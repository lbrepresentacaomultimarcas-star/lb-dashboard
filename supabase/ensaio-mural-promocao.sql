-- LB CRM — ENSAIO DO MURAL DE PROMOÇÃO (NÃO ALTERA NADA)
-- Aplica, simula admin, promovido e colega, e DESFAZ TUDO. Termina com um ERRO
-- proposital "ENSAIO CONCLUIDO - NADA FOI ALTERADO".

do $lb$
declare
  v_org uuid;
  v_a uuid;
  v_c uuid;
  v_c2 uuid;
  v_promo uuid;
  v_velha uuid;
  v_n bigint;
  v_res text;
  v_ok int := 0;
  v_falhas int := 0;
  v_sem int := 0;
  v_linhas text := '';
  v_t record;
begin
  execute 'alter table public.promocoes_agendadas add column if not exists foto_url text';
  execute 'alter table public.promocoes_agendadas add column if not exists legenda text';

  -- o colaborador continua só podendo marcar que viu a comemoração:
  -- foto e legenda também entram na lista do que só a administração/servidor muda
  execute $q$
    create or replace function public.lb_dev_promocao_antes()
    returns trigger language plpgsql security definer set search_path = public as $fn$
    begin
      if tg_op = 'INSERT' then
        new.org_id := public.lb_dev_org_de(new.profile_id);
        new.criado_por := auth.uid();
        new.cargo_atual := (select papel from public.profiles where id = new.profile_id);
        new.status := 'agendada';
        new.realizada_em := null;
        new.comemoracao_vista_em := null;
        return new;
      end if;
      new.atualizado_em := now();
      if auth.uid() is null or public.lb_dev_eh_admin(old.org_id) then
        if new.status = 'realizada' and old.status is distinct from 'realizada' then
          new.realizada_em := now();
          new.comemoracao_vista_em := null;
        end if;
        return new;
      end if;
      if row(new.profile_id, new.org_id, new.cargo_atual, new.cargo_novo, new.data_hora, new.mensagem,
             new.status, new.criado_por, new.realizada_em, new.foto_url, new.legenda)
         is distinct from row(old.profile_id, old.org_id, old.cargo_atual, old.cargo_novo, old.data_hora,
             old.mensagem, old.status, old.criado_por, old.realizada_em, old.foto_url, old.legenda) then
        raise exception 'Só a administração altera a promoção.';
      end if;
      new.comemoracao_vista_em := case when old.comemoracao_vista_em is null and new.comemoracao_vista_em is not null
                                       then now() else old.comemoracao_vista_em end;
      return new;
    end
    $fn$
  $q$;

  -- Mural: promoções feitas nos últimos 3 dias, para todos da empresa
  execute $q$
    create or replace function public.lb_dev_mural_promocoes()
    returns table (id uuid, profile_id uuid, nome text, cargo_atual text, cargo_novo text,
                   realizada_em timestamptz, foto_url text, legenda text)
    language sql stable security definer set search_path = public as $fn$
      select pa.id, pa.profile_id, public.lb_dev_nome(pa.profile_id), pa.cargo_atual, pa.cargo_novo,
             pa.realizada_em, pa.foto_url, pa.legenda
        from public.promocoes_agendadas pa
       where pa.org_id = public.current_org_id()
         and pa.status = 'realizada'
         and pa.realizada_em > now() - interval '3 days'
       order by pa.realizada_em desc
    $fn$
  $q$;
  execute 'revoke all on function public.lb_dev_mural_promocoes() from public';
  execute 'grant execute on function public.lb_dev_mural_promocoes() to authenticated';


  -- ===================== ENSAIO (tudo abaixo é desfeito) =====================
  select p.id, coalesce(p.vendedor_id, p.id) into v_a, v_org from public.profiles p
   where p.papel = 'admin' and coalesce(p.ativo, true) order by p.criado_em limit 1;
  select p.id into v_c from public.profiles p
   where p.papel = 'vendedor' and coalesce(p.ativo, true) and coalesce(p.codigo_liberado, true)
     and coalesce(p.vendedor_id, p.id) = v_org order by p.criado_em limit 1;
  select p.id into v_c2 from public.profiles p
   where p.papel = 'vendedor' and coalesce(p.ativo, true) and coalesce(p.codigo_liberado, true)
     and coalesce(p.vendedor_id, p.id) = v_org and p.id <> v_c order by p.criado_em limit 1;

  if v_c is not null then
    -- promoção feita agora (aparece) e uma de 4 dias atrás (não aparece mais)
    insert into public.promocoes_agendadas (profile_id, cargo_novo, data_hora, mensagem)
    values (v_c, 'lider', now(), 'ENSAIO privado') returning id into v_promo;
    update public.promocoes_agendadas set status = 'realizada', foto_url = 'https://exemplo/foto.jpg', legenda = 'ENSAIO parabéns' where id = v_promo;
    insert into public.promocoes_agendadas (profile_id, cargo_novo, data_hora)
    values (v_c2, 'lider', now() - interval '5 days') returning id into v_velha;
    update public.promocoes_agendadas set status = 'realizada' where id = v_velha;
    update public.promocoes_agendadas set realizada_em = now() - interval '4 days' where id = v_velha;
  end if;

  for v_t in
    select * from (values
      ('outro', 'permitido', 'colega ve a promocao no mural'),
      ('outro', 'permitido', 'mural mostra foto e legenda'),
      ('outro', 'bloqueado', 'mural nao mostra promocao de 4 dias atras'),
      ('outro', 'bloqueado', 'colega nao le a orientacao privada'),
      ('colab', 'bloqueado', 'promovido troca a foto direto no banco'),
      ('colab', 'permitido', 'promovido ainda marca que viu a comemoracao'),
      ('admin', 'permitido', 'admin edita a legenda'),
      ('admin', 'permitido', 'admin ve o mural')
    ) as x(quem, esperado, descricao)
  loop
    if v_a is null or v_c is null or v_c2 is null then
      v_sem := v_sem + 1;
      continue;
    end if;
    v_n := 0;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub',
        case v_t.quem when 'admin' then v_a when 'outro' then v_c2 else v_c end, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      if v_t.descricao = 'colega ve a promocao no mural' then
        select count(*) into v_n from public.lb_dev_mural_promocoes() m where m.id = v_promo;
      elsif v_t.descricao = 'mural mostra foto e legenda' then
        select count(*) into v_n from public.lb_dev_mural_promocoes() m
         where m.id = v_promo and m.foto_url is not null and m.legenda = 'ENSAIO parabéns' and m.nome is not null;
      elsif v_t.descricao = 'mural nao mostra promocao de 4 dias atras' then
        select count(*) into v_n from public.lb_dev_mural_promocoes() m where m.id = v_velha;
      elsif v_t.descricao = 'colega nao le a orientacao privada' then
        select count(*) into v_n from public.promocoes_agendadas where id = v_promo;
      elsif v_t.descricao = 'promovido troca a foto direto no banco' then
        update public.promocoes_agendadas set foto_url = 'https://outra' where id = v_promo;
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'promovido ainda marca que viu a comemoracao' then
        update public.promocoes_agendadas set comemoracao_vista_em = now() where id = v_promo;
        select count(*) into v_n from public.promocoes_agendadas where id = v_promo and comemoracao_vista_em is not null;
      elsif v_t.descricao = 'admin edita a legenda' then
        update public.promocoes_agendadas set legenda = 'ENSAIO nova' where id = v_promo;
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'admin ve o mural' then
        select count(*) into v_n from public.lb_dev_mural_promocoes();
      end if;
      raise exception using errcode = 'LBT01', message = 'desfaz este teste';
    exception
      when sqlstate 'LBT01' then
        v_res := case when v_n > 0 then 'permitido' else 'bloqueado' end;
      when insufficient_privilege then
        v_res := 'bloqueado';
      when raise_exception then
        v_res := case when sqlerrm like 'Só a administração%' then 'bloqueado' else 'erro: ' || left(sqlerrm, 90) end;
      when others then
        v_res := 'erro: ' || left(sqlerrm, 90);
    end;
    if v_res = v_t.esperado then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'
- ' || v_t.quem || ' / ' || v_t.descricao || ': esperado ' || v_t.esperado || ', veio ' || v_res;
    end if;
  end loop;

  raise exception using
    errcode = 'LBE01',
    message = format(E'ENSAIO CONCLUIDO - NADA FOI ALTERADO
PASSOU: %s
FALHAS: %s
SEM DADOS PARA TESTAR: %s%s',
                     v_ok, v_falhas, v_sem, v_linhas);
end
$lb$;
