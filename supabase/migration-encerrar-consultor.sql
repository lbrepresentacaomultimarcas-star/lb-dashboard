-- LB Dashboard — Excluir consultor transferindo os contatos.
--
-- Faz TUDO em uma única transação: ou transfere e encerra, ou não muda nada.
--
-- O QUE VAI PARA OS NOVOS CONSULTORES (em rodízio):
--   • negócios abertos do Pipeline (tudo que não é fechamento nem perdido);
--   • leads ativos da Central (sem encerramento e sem exclusão).
--
-- O QUE NUNCA MUDA DE DONO: vendas, metas, comissões, negócios fechados ou
-- perdidos, análises e histórico de performance. Esse crédito é de quem vendeu.
--
-- POR QUE ÀS VEZES INATIVA EM VEZ DE EXCLUIR: `vendas` e `metas` estão ligadas
-- ao vendedor com ON DELETE CASCADE. Excluir quem tem histórico APAGARIA esse
-- histórico. Nesse caso o cadastro fica inativo: sai da fila e dos seletores, e
-- os números passados continuam certos.
--
-- p_simular = true (padrão) executa tudo e DESFAZ no final: é a prévia da tela.
--
-- Só cria esta função. Nenhum dado é alterado ao rodar este arquivo.

create or replace function public.encerrar_consultor(
  p_vendedor uuid,
  p_destinos uuid[] default '{}',
  p_bloquear_acesso boolean default true,
  p_simular boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_papel text;
  v_ativo boolean;
  v_email text;
  v_org uuid := public.current_org_id();
  v_nome text;
  v_validos uuid[];
  v_n int;
  v_i int := 0;
  v_item record;
  v_destino uuid;
  v_nome_destino text;
  v_contagem jsonb := '{}'::jsonb;
  v_resumo jsonb := '[]'::jsonb;
  v_pipeline int := 0;
  v_central int := 0;
  v_pend_pipeline int;
  v_pend_central int;
  v_vendas int;
  v_metas int;
  v_negocios int;
  v_central_hist int;
  v_analises int;
  v_performance int;
  v_acao text;
  v_bloqueados int := 0;
begin
  select papel, coalesce(ativo, true) and coalesce(codigo_liberado, true), email
    into v_papel, v_ativo, v_email
    from public.profiles
   where id = auth.uid();

  if not found or not v_ativo or v_papel <> 'admin' then
    return jsonb_build_object('erro', 'Apenas o administrador pode excluir consultores.');
  end if;

  select nome into v_nome
    from public.vendedores
   where id = p_vendedor and org_id = v_org
   for update;

  if not found then
    return jsonb_build_object('erro', 'Consultor não encontrado.');
  end if;

  select count(*) into v_pend_pipeline from public.leads
   where vendedor_id = p_vendedor and org_id = v_org
     and status not in ('fechamento', 'perdido');
  select count(*) into v_pend_central from public.central_leads
   where vendedor_id = p_vendedor and org_id = v_org
     and encerrado_em is null and excluido_em is null;

  select count(*) into v_vendas from public.vendas where vendedor_id = p_vendedor and org_id = v_org;
  select count(*) into v_metas from public.metas where vendedor_id = p_vendedor and org_id = v_org;
  select count(*) into v_negocios from public.leads
   where vendedor_id = p_vendedor and org_id = v_org and status in ('fechamento', 'perdido');
  select count(*) into v_central_hist from public.central_leads
   where vendedor_id = p_vendedor and org_id = v_org
     and (encerrado_em is not null or excluido_em is not null);
  select count(*) into v_analises from public.analises where vendedor_id = p_vendedor and org_id = v_org;
  select count(*) into v_performance from public.performance_historico where vendedor_id = p_vendedor and org_id = v_org;

  v_acao := case
    when v_vendas + v_metas + v_negocios + v_central_hist + v_analises + v_performance > 0 then 'inativado'
    else 'excluido'
  end;

  -- Só recebe quem tem cadastro ativo E login liberado (mesma regra da distribuição).
  select array_agg(x.id order by array_position(p_destinos, x.id))
    into v_validos
    from (
      select distinct v.id
        from public.vendedores v
        join public.profiles p on p.vendedor_ref = v.id
       where v.id = any(coalesce(p_destinos, '{}'))
         and v.id <> p_vendedor
         and v.org_id = v_org
         and coalesce(v.ativo, true)
         and coalesce(p.ativo, true)
         and coalesce(p.codigo_liberado, true)
    ) x;

  v_n := coalesce(array_length(v_validos, 1), 0);

  if coalesce(array_length(p_destinos, 1), 0) <> v_n then
    return jsonb_build_object('erro', 'Um dos consultores escolhidos está bloqueado, sem login ou é o próprio consultor.');
  end if;

  if v_n = 0 and v_pend_pipeline + v_pend_central > 0 then
    if p_simular then
      return jsonb_build_object(
        'simulado', true, 'acao', v_acao, 'nome', v_nome,
        'pipeline', v_pend_pipeline, 'central', v_pend_central, 'porConsultor', '[]'::jsonb,
        'mantidos', jsonb_build_object('vendas', v_vendas, 'metas', v_metas, 'negocios', v_negocios,
                                       'central', v_central_hist, 'analises', v_analises, 'performance', v_performance),
        'acessoBloqueado', 0
      );
    end if;
    return jsonb_build_object('erro', 'Escolha quem vai receber os contatos.');
  end if;

  begin
    for v_item in
      select id, nome from public.leads
       where vendedor_id = p_vendedor and org_id = v_org
         and status not in ('fechamento', 'perdido')
       order by criado_em
       for update
    loop
      v_destino := v_validos[(v_i % v_n) + 1];
      select nome into v_nome_destino from public.vendedores where id = v_destino;

      update public.leads
         set vendedor_id = v_destino,
             compartilhado_em = now(),
             compartilhado_por = v_email,
             compartilhado_modo = 'recuperado'
       where id = v_item.id;

      insert into public.audit_log (org_id, acao, entidade, entidade_id, usuario_email, detalhes)
      values (v_org, 'transferir', 'lead', v_item.id, v_email,
              format('Saída de consultor: "%s" · de %s → %s', v_item.nome, v_nome, v_nome_destino));

      v_contagem := jsonb_set(v_contagem, array[v_destino::text],
                              to_jsonb(coalesce((v_contagem ->> v_destino::text)::int, 0) + 1));
      v_i := v_i + 1;
      v_pipeline := v_pipeline + 1;
    end loop;

    for v_item in
      select id, nome from public.central_leads
       where vendedor_id = p_vendedor and org_id = v_org
         and encerrado_em is null and excluido_em is null
       order by recebido_em
       for update
    loop
      v_destino := v_validos[(v_i % v_n) + 1];
      select nome into v_nome_destino from public.vendedores where id = v_destino;

      update public.central_leads
         set vendedor_id = v_destino,
             distribuido_por = auth.uid(),
             distribuido_em = now()
       where id = v_item.id;

      insert into public.central_leads_eventos
        (org_id, central_lead_id, tipo, campo, valor_anterior, valor_novo, detalhe, autor_nome)
      values (v_org, v_item.id, 'redistribuido', 'Consultor', v_nome, v_nome_destino,
              'Saída de consultor', v_email);

      insert into public.audit_log (org_id, acao, entidade, entidade_id, usuario_email, detalhes)
      values (v_org, 'redistribuir', 'central_lead', v_item.id, v_email,
              format('Saída de consultor: "%s" · de %s → %s', v_item.nome, v_nome, v_nome_destino));

      v_contagem := jsonb_set(v_contagem, array[v_destino::text],
                              to_jsonb(coalesce((v_contagem ->> v_destino::text)::int, 0) + 1));
      v_i := v_i + 1;
      v_central := v_central + 1;
    end loop;

    insert into public.notificacoes (org_id, user_id, tipo, titulo, mensagem, link)
    select v_org, p.id, 'central_distribuicao', '🔁 CONTATOS TRANSFERIDOS PARA VOCÊ',
           format('Você recebeu %s contato(s) que estavam com %s.', c.value, v_nome), '/central'
      from jsonb_each_text(v_contagem) c
      join public.profiles p on p.vendedor_ref = c.key::uuid
     where coalesce(p.ativo, true);

    if p_bloquear_acesso then
      update public.profiles
         set ativo = false
       where vendedor_ref = p_vendedor
         and papel <> 'admin'
         and id <> auth.uid();
      get diagnostics v_bloqueados = row_count;
    end if;

    -- Conferência final: se algo entrou no nome dele durante a operação, não exclui.
    if v_acao = 'excluido' and (
         exists (select 1 from public.leads where vendedor_id = p_vendedor)
         or exists (select 1 from public.central_leads where vendedor_id = p_vendedor)
       ) then
      v_acao := 'inativado';
    end if;

    if v_acao = 'excluido' then
      delete from public.vendedores where id = p_vendedor;
    else
      update public.vendedores set ativo = false where id = p_vendedor;
    end if;

    insert into public.audit_log (org_id, acao, entidade, entidade_id, usuario_email, detalhes)
    values (v_org, case when v_acao = 'excluido' then 'remover' else 'inativar' end, 'vendedor',
            p_vendedor, v_email,
            format('%s · %s contato(s) transferido(s)', v_nome, v_pipeline + v_central));

    if p_simular then
      raise exception using errcode = 'LBS01', message = 'simulacao';
    end if;
  exception
    when sqlstate 'LBS01' then
      null; -- a simulação termina aqui: tudo acima foi desfeito
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'vendedorId', c.key, 'nome', coalesce(v.nome, c.key), 'quantos', c.value::int
         ) order by c.value::int desc, v.nome), '[]'::jsonb)
    into v_resumo
    from jsonb_each_text(v_contagem) c
    left join public.vendedores v on v.id = c.key::uuid;

  return jsonb_build_object(
    'simulado', p_simular,
    'acao', v_acao,
    'nome', v_nome,
    'pipeline', v_pipeline,
    'central', v_central,
    'porConsultor', v_resumo,
    'mantidos', jsonb_build_object('vendas', v_vendas, 'metas', v_metas, 'negocios', v_negocios,
                                   'central', v_central_hist, 'analises', v_analises, 'performance', v_performance),
    'acessoBloqueado', v_bloqueados
  );
end;
$$;

revoke all on function public.encerrar_consultor(uuid, uuid[], boolean, boolean) from public;
grant execute on function public.encerrar_consultor(uuid, uuid[], boolean, boolean) to authenticated;

-- COMO DESFAZER (remove só a função; não mexe em dados):
--   drop function public.encerrar_consultor(uuid, uuid[], boolean, boolean);
