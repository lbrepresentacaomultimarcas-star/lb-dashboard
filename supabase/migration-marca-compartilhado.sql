-- ============================================================================
-- LB CRM — MARCA "COMPARTILHADO" NO NEGÓCIO
--
-- O PROBLEMA
--
-- Redistribuir 270 negócios parados funciona, mas depois eles se misturam às
-- oportunidades novas e afundam na lista. Não dá para saber quais foram
-- reenviados, para quem, nem quando.
--
-- A SOLUÇÃO
--
-- O MESMO negócio ganha três campos. Não existe negócio novo, não existe
-- cópia, não existe segunda lista: é etiqueta no registro que já está lá.
--
-- Quem carimba é a função `distribuir_leads()` — que hoje é o caminho ÚNICO
-- tanto do "Compartilhar" individual quanto da distribuição em massa. Por
-- isso não há como um negócio ser compartilhado sem ficar marcado: não
-- existe outro caminho.
--
-- Compartilhar de novo SOBRESCREVE os campos (a marca reflete o último
-- envio) e acrescenta mais uma linha no histórico — o `audit_log`, que já
-- guardava tudo, continua sendo a memória completa.
--
-- 100% ADITIVA e IDEMPOTENTE.
-- ============================================================================

alter table public.leads
  add column if not exists compartilhado_em   timestamptz,
  add column if not exists compartilhado_por  text,
  add column if not exists compartilhado_modo text;

comment on column public.leads.compartilhado_em is
  'Quando o negócio foi compartilhado/redistribuído pela última vez. NULL = nunca.';
comment on column public.leads.compartilhado_por is
  'E-mail de quem fez o último compartilhamento.';
comment on column public.leads.compartilhado_modo is
  'individual | massa | recuperado — como chegou ao responsável atual.';

-- O filtro "Compartilhados" ordena por data e costuma pedir os recentes:
-- índice parcial, só nas linhas marcadas (a grande maioria é NULL).
create index if not exists leads_compartilhado_idx
  on public.leads (org_id, compartilhado_em desc)
  where compartilhado_em is not null;

-- ============================================================================
-- A função de distribuição passa a carimbar. Mesma lógica de antes —
-- só acrescenta as três colunas no UPDATE.
-- ============================================================================
create or replace function public.distribuir_leads(
  p_lead_ids            uuid[],
  p_vendedor_ids        uuid[],
  p_incluir_atribuidos  boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_papel       text;
  v_ativo       boolean;
  v_org         uuid;
  v_email       text;
  v_validos     uuid[];
  v_n           int;
  v_i           int := 0;
  v_lead        record;
  v_destino     uuid;
  v_modo        text;
  v_feitos      int := 0;
  v_recuperados int := 0;
  v_preservados int := 0;
  v_resumo      jsonb := '[]'::jsonb;
  v_contagem    jsonb := '{}'::jsonb;
begin
  select papel, coalesce(ativo, true), coalesce(vendedor_id, id), email
    into v_papel, v_ativo, v_org, v_email
  from public.profiles
  where id = auth.uid();

  if not found then
    return jsonb_build_object('erro', 'Sessão não encontrada.');
  end if;
  if not v_ativo then
    return jsonb_build_object('erro', 'Seu acesso foi bloqueado. Entre em contato com o administrador.');
  end if;
  if v_papel <> 'admin' then
    return jsonb_build_object('erro', 'Apenas o administrador pode distribuir negócios.');
  end if;
  if p_lead_ids is null or array_length(p_lead_ids, 1) is null then
    return jsonb_build_object('erro', 'Nenhum negócio selecionado.');
  end if;

  -- Só recebe quem tem cadastro ativo E login liberado: mandar negócio para
  -- quem está bloqueado é esconder o cliente de todo mundo.
  select array_agg(v.id order by array_position(p_vendedor_ids, v.id))
    into v_validos
  from public.vendedores v
  join public.profiles p on p.vendedor_ref = v.id
  where v.id = any(p_vendedor_ids)
    and v.org_id = v_org
    and coalesce(v.ativo, true)
    and coalesce(p.ativo, true);

  v_n := coalesce(array_length(v_validos, 1), 0);
  if v_n = 0 then
    return jsonb_build_object(
      'erro', 'Nenhum consultor válido na seleção. Consultores bloqueados ou sem login não recebem negócios.'
    );
  end if;

  -- Um negócio só = uma marca. O laço percorre os ids recebidos, e cada um
  -- é atualizado UMA vez. Nunca há insert aqui: é impossível duplicar.
  for v_lead in
    select
      l.id,
      l.vendedor_id is null as sem_dono,
      (l.vendedor_id is not null and not exists (
         select 1 from public.profiles p
         where p.vendedor_ref = l.vendedor_id
           and coalesce(p.ativo, true)
       )) as dono_bloqueado
    from public.leads l
    where l.id = any(p_lead_ids)
      and l.org_id = v_org
    order by l.criado_em
    for update skip locked
  loop
    if not v_lead.sem_dono and not v_lead.dono_bloqueado and not p_incluir_atribuidos then
      v_preservados := v_preservados + 1;
      continue;
    end if;

    v_destino := v_validos[(v_i % v_n) + 1];
    v_modo := case
                when v_lead.dono_bloqueado then 'recuperado'
                when array_length(p_lead_ids, 1) = 1 then 'individual'
                else 'massa'
              end;

    -- A linha já está travada pelo `for update`: ninguém mexe nela até esta
    -- transação terminar. É essa trava que impede duplo clique e dois admins
    -- ao mesmo tempo de atribuírem o mesmo negócio duas vezes.
    update public.leads
       set vendedor_id        = v_destino,
           compartilhado_em   = now(),
           compartilhado_por  = v_email,
           compartilhado_modo = v_modo
     where id = v_lead.id;

    if found then
      v_i      := v_i + 1;
      v_feitos := v_feitos + 1;
      if v_lead.dono_bloqueado then
        v_recuperados := v_recuperados + 1;
      end if;

      v_contagem := jsonb_set(
        v_contagem,
        array[v_destino::text],
        to_jsonb(coalesce((v_contagem ->> v_destino::text)::int, 0) + 1)
      );

      insert into public.audit_log (org_id, acao, entidade, entidade_id, usuario_email, detalhes)
      values (
        v_org,
        'distribuir_massa',
        'lead',
        v_lead.id,
        v_email,
        case v_modo
          when 'recuperado' then 'Recuperado de consultor bloqueado → '
          when 'individual' then 'Compartilhado (individual) → '
          else 'Distribuição em massa → '
        end ||
        coalesce((select nome from public.vendedores where id = v_destino), v_destino::text)
      );
    end if;
  end loop;

  select coalesce(
           jsonb_agg(jsonb_build_object(
             'vendedorId', c.key,
             'nome',       coalesce(v.nome, c.key),
             'quantos',    c.value::int
           ) order by (c.value::int) desc, v.nome),
           '[]'::jsonb
         )
    into v_resumo
  from jsonb_each_text(v_contagem) as c(key, value)
  left join public.vendedores v on v.id = c.key::uuid;

  return jsonb_build_object(
    'distribuidos',  v_feitos,
    'recuperados',   v_recuperados,
    'jaTinhamDono',  v_preservados,
    'porConsultor',  v_resumo
  );
end;
$$;

revoke all on function public.distribuir_leads(uuid[], uuid[], boolean) from public;
grant execute on function public.distribuir_leads(uuid[], uuid[], boolean) to authenticated;

-- ============================================================================
-- MARCA RETROATIVA
--
-- Os negócios que você já redistribuiu hoje ficaram sem etiqueta — a coluna
-- não existia ainda. O histórico (audit_log) sabe quando e por quem: dá para
-- recuperar essa informação em vez de perdê-la.
--
-- Só preenche onde está vazio; não sobrescreve nada.
-- ============================================================================
with primeiro as (
  select distinct on (a.entidade_id)
         a.entidade_id,
         a.criado_em,
         a.usuario_email,
         case when a.detalhes like 'Recuperado%' then 'recuperado' else 'massa' end as modo
  from public.audit_log a
  where a.acao = 'distribuir_massa'
    and a.entidade = 'lead'
    and a.entidade_id is not null
  order by a.entidade_id, a.criado_em desc
)
update public.leads l
   set compartilhado_em   = p.criado_em,
       compartilhado_por  = p.usuario_email,
       compartilhado_modo = p.modo
  from primeiro p
 where l.id = p.entidade_id
   and l.compartilhado_em is null;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'negócios marcados como compartilhados' as item, count(*)::text as valor
  from public.leads where compartilhado_em is not null
union all
select 'destes, recuperados de bloqueado', count(*)::text
  from public.leads where compartilhado_modo = 'recuperado'
union all
select 'total de negócios (nao pode ter mudado)', count(*)::text
  from public.leads;
