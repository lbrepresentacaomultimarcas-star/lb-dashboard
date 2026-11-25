-- LB CRM — ENSAIO DO PERFIL DO CLIENTE (NÃO ALTERA NADA)
--
-- Aplica a estrutura nova, simula consultor e administrador com negócios reais
-- e DESFAZ TUDO. O resultado aparece como uma mensagem de ERRO em vermelho,
-- começando por "ENSAIO CONCLUIDO - NADA FOI ALTERADO". Esse erro é proposital.

do $lb$
declare
  v_org uuid;
  v_admin uuid;
  v_consultor uuid;
  v_ref uuid;
  v_lead uuid;
  v_lead_outro uuid;
  v_perfil uuid;
  v_n bigint;
  v_h bigint;
  v_por uuid;
  v_res text;
  v_ok int := 0;
  v_falhas int := 0;
  v_sem int := 0;
  v_linhas text := '';
  v_t record;
begin
  -- 1) Perfis configuráveis
  execute $q$
    create table if not exists public.perfis_cliente (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null default public.current_org_id(),
      chave text not null,
      nome text not null,
      emoji text not null default '',
      cor text not null default '#94a3b8',
      dica text not null default '',
      ordem int not null default 0,
      ativo boolean not null default true,
      criado_em timestamptz not null default now(),
      unique (org_id, chave)
    )
  $q$;
  execute 'alter table public.perfis_cliente enable row level security';
  execute 'drop policy if exists "perfis leitura" on public.perfis_cliente';
  execute 'drop policy if exists "perfis admin insere" on public.perfis_cliente';
  execute 'drop policy if exists "perfis admin altera" on public.perfis_cliente';
  execute 'drop policy if exists "perfis admin exclui" on public.perfis_cliente';
  execute 'create policy "perfis leitura" on public.perfis_cliente for select to authenticated using (org_id = public.current_org_id())';
  execute 'create policy "perfis admin insere" on public.perfis_cliente for insert to authenticated with check (org_id = public.current_org_id() and public.tem_cargo(''admin''))';
  execute 'create policy "perfis admin altera" on public.perfis_cliente for update to authenticated using (org_id = public.current_org_id() and public.tem_cargo(''admin'')) with check (org_id = public.current_org_id() and public.tem_cargo(''admin''))';
  execute 'create policy "perfis admin exclui" on public.perfis_cliente for delete to authenticated using (org_id = public.current_org_id() and public.tem_cargo(''admin''))';

  for v_org in select distinct org_id from public.vendedores where org_id is not null loop
    insert into public.perfis_cliente (org_id, chave, nome, emoji, cor, dica, ordem) values
      (v_org, 'confianca', 'Confiança', '🤝', '#38bdf8',
       'Precisa de relacionamento, segurança e prova social. Tenha calma, seja transparente, mostre depoimentos e explique cada etapa do processo.', 1),
      (v_org, 'pressao', 'Pressão', '⚡', '#f59e0b',
       'Decidido e com urgência. Seja objetivo, apresente uma condição com prazo claro e vá direto para a proposta.', 2),
      (v_org, 'pesquisador', 'Pesquisador', '🔍', '#a78bfa',
       'Compara, pede números e simulações e demora a decidir. Leve dados, simulação detalhada e comparativo, e agende o próximo contato.', 3),
      (v_org, 'so_conhecendo', 'Só conhecendo', '👀', '#94a3b8',
       'Curioso, sem intenção clara de compra agora. Nutra a relação, não pressione e combine quando retomar.', 4)
    on conflict (org_id, chave) do nothing;
  end loop;

  -- 2) Perfil no negócio
  execute 'alter table public.leads add column if not exists perfil_cliente uuid references public.perfis_cliente(id) on delete set null';
  execute 'alter table public.leads add column if not exists perfil_observacao text';
  execute 'alter table public.leads add column if not exists perfil_definido_por uuid';
  execute 'alter table public.leads add column if not exists perfil_definido_em timestamptz';
  execute 'create index if not exists leads_perfil_cliente_idx on public.leads (org_id, perfil_cliente)';

  -- 3) Histórico
  execute $q$
    create table if not exists public.negocio_perfil_historico (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null,
      negocio_id uuid not null references public.leads(id) on delete cascade,
      perfil_anterior uuid,
      perfil_novo uuid,
      observacao text,
      usuario_id uuid,
      usuario_nome text,
      created_at timestamptz not null default now()
    )
  $q$;
  execute 'create index if not exists negocio_perfil_historico_idx on public.negocio_perfil_historico (negocio_id, created_at desc)';
  execute 'alter table public.negocio_perfil_historico enable row level security';
  execute 'drop policy if exists "perfil historico leitura" on public.negocio_perfil_historico';
  execute $q$
    create policy "perfil historico leitura" on public.negocio_perfil_historico for select to authenticated
    using (
      org_id = public.current_org_id()
      and exists (select 1 from public.leads l
                   where l.id = negocio_id and public.pode_ver_vendedor(l.vendedor_id))
    )
  $q$;

  -- 4) Carimbo e validação (antes de gravar)
  execute $q$
    create or replace function public.lb_perfil_cliente_carimbo()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      if tg_op = 'UPDATE'
         and new.perfil_cliente is not distinct from old.perfil_cliente
         and new.perfil_observacao is not distinct from old.perfil_observacao then
        new.perfil_definido_por := old.perfil_definido_por;
        new.perfil_definido_em := old.perfil_definido_em;
        return new;
      end if;
      if tg_op = 'INSERT' and new.perfil_cliente is null and new.perfil_observacao is null then
        new.perfil_definido_por := null;
        new.perfil_definido_em := null;
        return new;
      end if;
      if new.perfil_cliente is not null and not exists (
           select 1 from public.perfis_cliente p
            where p.id = new.perfil_cliente and p.org_id = new.org_id and p.ativo) then
        raise exception 'Perfil de cliente inválido para esta empresa.';
      end if;
      new.perfil_definido_por := auth.uid();
      new.perfil_definido_em := now();
      return new;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_perfil_cliente_carimbo on public.leads';
  execute 'create trigger trg_lb_perfil_cliente_carimbo before insert or update of perfil_cliente, perfil_observacao, perfil_definido_por, perfil_definido_em on public.leads for each row execute function public.lb_perfil_cliente_carimbo()';

  -- 5) Histórico (depois de gravar)
  execute $q$
    create or replace function public.lb_perfil_cliente_historico()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      if tg_op = 'INSERT' and new.perfil_cliente is null then
        return null;
      end if;
      if tg_op = 'UPDATE'
         and new.perfil_cliente is not distinct from old.perfil_cliente
         and new.perfil_observacao is not distinct from old.perfil_observacao then
        return null;
      end if;
      insert into public.negocio_perfil_historico
        (org_id, negocio_id, perfil_anterior, perfil_novo, observacao, usuario_id, usuario_nome)
      values (
        new.org_id, new.id,
        case when tg_op = 'UPDATE' then old.perfil_cliente end,
        new.perfil_cliente, new.perfil_observacao, auth.uid(),
        (select coalesce(p.nome, p.email) from public.profiles p where p.id = auth.uid())
      );
      return null;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_perfil_cliente_historico on public.leads';
  execute 'create trigger trg_lb_perfil_cliente_historico after insert or update of perfil_cliente, perfil_observacao on public.leads for each row execute function public.lb_perfil_cliente_historico()';

  -- 6) Tempo real dos perfis configuráveis
  begin
    execute 'alter publication supabase_realtime add table public.perfis_cliente';
  exception when others then null;
  end;


  -- ENSAIO: pessoas e negócios reais, só para a simulação
  select p.id, p.vendedor_ref, coalesce(p.vendedor_id, p.id) into v_consultor, v_ref, v_org
    from public.profiles p
   where p.papel = 'vendedor' and p.vendedor_ref is not null
     and coalesce(p.ativo, true) and coalesce(p.codigo_liberado, true)
   order by (select count(*) from public.leads l where l.vendedor_id = p.vendedor_ref) desc
   limit 1;
  select id into v_admin from public.profiles
   where papel = 'admin' and coalesce(ativo, true) and coalesce(codigo_liberado, true)
     and coalesce(vendedor_id, id) = v_org
   order by criado_em limit 1;
  select id into v_lead from public.leads where vendedor_id = v_ref limit 1;
  select id into v_lead_outro from public.leads
   where vendedor_id is not null and vendedor_id <> v_ref and org_id = v_org limit 1;
  select id into v_perfil from public.perfis_cliente where org_id = v_org and chave = 'confianca';

  for v_t in
    select * from (values
      ('consultor', 'permitido', 'ler os perfis'),
      ('consultor', 'permitido', 'definir perfil do proprio negocio'),
      ('consultor', 'permitido', 'historico gravado com quem definiu'),
      ('consultor', 'bloqueado', 'definir perfil de negocio de outro'),
      ('consultor', 'bloqueado', 'usar perfil inexistente'),
      ('consultor', 'bloqueado', 'criar tipo de perfil'),
      ('consultor', 'bloqueado', 'gravar historico direto'),
      ('consultor', 'bloqueado', 'apagar historico'),
      ('admin', 'permitido', 'criar tipo de perfil'),
      ('admin', 'permitido', 'definir perfil de qualquer negocio')
    ) as x(quem, esperado, descricao)
  loop
    if (v_t.quem = 'consultor' and (v_consultor is null or v_lead is null))
       or (v_t.quem = 'admin' and v_admin is null)
       or v_perfil is null
       or (v_t.descricao like '%de outro%' and v_lead_outro is null)
       or (v_t.descricao like '%qualquer%' and v_lead_outro is null) then
      v_sem := v_sem + 1;
      continue;
    end if;

    v_n := 0;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', case v_t.quem when 'admin' then v_admin else v_consultor end, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);

      if v_t.descricao = 'ler os perfis' then
        select count(*) into v_n from public.perfis_cliente;
      elsif v_t.descricao = 'definir perfil do proprio negocio' then
        update public.leads set perfil_cliente = v_perfil, perfil_observacao = 'ENSAIO' where id = v_lead;
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'historico gravado com quem definiu' then
        update public.leads set perfil_cliente = v_perfil, perfil_observacao = 'ENSAIO 2' where id = v_lead;
        select count(*) into v_h from public.negocio_perfil_historico
         where negocio_id = v_lead and usuario_id = v_consultor and observacao = 'ENSAIO 2';
        select perfil_definido_por into v_por from public.leads where id = v_lead;
        v_n := case when v_h = 1 and v_por = v_consultor then 1 else 0 end;
      elsif v_t.descricao = 'definir perfil de negocio de outro' then
        update public.leads set perfil_cliente = v_perfil where id = v_lead_outro;
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'usar perfil inexistente' then
        update public.leads set perfil_cliente = gen_random_uuid() where id = v_lead;
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'criar tipo de perfil' then
        insert into public.perfis_cliente (chave, nome) values ('ensaio_' || v_t.quem, 'ENSAIO');
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'gravar historico direto' then
        insert into public.negocio_perfil_historico (org_id, negocio_id, perfil_novo)
        values (v_org, v_lead, v_perfil);
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'apagar historico' then
        perform set_config('role', 'postgres', true);
        update public.leads set perfil_cliente = v_perfil, perfil_observacao = 'ENSAIO 3' where id = v_lead;
        perform set_config('role', 'authenticated', true);
        delete from public.negocio_perfil_historico where negocio_id = v_lead;
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'definir perfil de qualquer negocio' then
        update public.leads set perfil_cliente = v_perfil where id = v_lead_outro;
        get diagnostics v_n = row_count;
      end if;
      raise exception using errcode = 'LBT01', message = 'desfaz este teste';
    exception
      when sqlstate 'LBT01' then
        v_res := case when v_n > 0 then 'permitido' else 'bloqueado' end;
      when insufficient_privilege then
        v_res := 'bloqueado';
      when raise_exception then
        v_res := case when sqlerrm like 'Perfil de cliente inv%' then 'bloqueado' else 'erro: ' || left(sqlerrm, 90) end;
      when others then
        v_res := 'erro: ' || left(sqlerrm, 90);
    end;

    if v_res = v_t.esperado then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n- ' || v_t.quem || ' / ' || v_t.descricao
               || ': esperado ' || v_t.esperado || ', veio ' || v_res;
    end if;
  end loop;

  -- Este erro é proposital: é ele que garante que NADA fica gravado.
  raise exception using
    errcode = 'LBE01',
    message = format(E'ENSAIO CONCLUIDO - NADA FOI ALTERADO\nPASSOU: %s\nFALHAS: %s\nSEM DADOS PARA TESTAR: %s%s',
                     v_ok, v_falhas, v_sem, v_linhas);

end
$lb$;
