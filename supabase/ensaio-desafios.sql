-- LB CRM — ENSAIO DOS DESAFIOS CONFIGURÁVEIS (NÃO ALTERA NADA)
--
-- Aplica a estrutura nova, cadastra o desafio atual, simula consultor e
-- administrador e DESFAZ TUDO. O resultado aparece como uma mensagem de ERRO em
-- vermelho, começando por "ENSAIO CONCLUIDO - NADA FOI ALTERADO". Esse erro é proposital.
-- Se aparecer "não foi possível ligar ao cadastro", me mande o print.

do $lb$
declare
  v_admin uuid;
  v_consultor uuid;
  v_ref uuid;
  v_org_t uuid;
  v_id uuid;
  v_n bigint;
  v_res text;
  v_ok int := 0;
  v_falhas int := 0;
  v_sem int := 0;
  v_linhas text := '';
  v_t record;
  v_seed text := '';
  v_org uuid;
  v_part jsonb;
  v_ids uuid[];
  v_p record;
  v_faltas text;
begin
  -- 1) Tabela
  execute $q$
    create table if not exists public.desafios (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null default public.current_org_id(),
      titulo text not null,
      frase text not null default '',
      inicio date not null,
      fim date not null,
      meta_coletiva numeric,
      participantes jsonb not null default '[]'::jsonb,
      ativo boolean not null default true,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      constraint desafios_periodo check (fim >= inicio and fim - inicio <= 92),
      constraint desafios_participantes check (jsonb_typeof(participantes) = 'array')
    )
  $q$;
  execute 'create index if not exists desafios_org_idx on public.desafios (org_id, inicio desc)';
  execute 'alter table public.desafios enable row level security';
  execute 'drop policy if exists "desafios leitura" on public.desafios';
  execute 'drop policy if exists "desafios admin insere" on public.desafios';
  execute 'drop policy if exists "desafios admin altera" on public.desafios';
  execute 'drop policy if exists "desafios admin exclui" on public.desafios';
  execute 'create policy "desafios leitura" on public.desafios for select to authenticated using (org_id = public.current_org_id())';
  execute 'create policy "desafios admin insere" on public.desafios for insert to authenticated with check (org_id = public.current_org_id() and public.tem_cargo(''admin''))';
  execute 'create policy "desafios admin altera" on public.desafios for update to authenticated using (org_id = public.current_org_id() and public.tem_cargo(''admin'')) with check (org_id = public.current_org_id() and public.tem_cargo(''admin''))';
  execute 'create policy "desafios admin exclui" on public.desafios for delete to authenticated using (org_id = public.current_org_id() and public.tem_cargo(''admin''))';

  -- 2) Tempo real
  begin
    execute 'alter publication supabase_realtime add table public.desafios';
  exception when others then null;
  end;

  -- 3) O desafio atual vira o primeiro registro (só onde ainda não há desafio)
  for v_org in select distinct org_id from public.vendedores where org_id is not null loop
    if exists (select 1 from public.desafios d where d.org_id = v_org) then
      continue;
    end if;
    v_part := '[]'::jsonb;
    v_faltas := '';
    for v_p in
      select * from (values
        (1, 'Adriel', 'adriel%'),
        (2, 'Joyce Santos', 'joyce santos%'),
        (3, 'Juliana', 'juliana%'),
        (4, 'Kathiely Santos', 'kathiely santos%'),
        (5, 'William Narciso', 'will%narciso%')
      ) as x(ordem, nome, padrao)
      order by ordem
    loop
      select array_agg(v.id) into v_ids
        from public.vendedores v
       where v.org_id = v_org and coalesce(v.ativo, true)
         and lower(trim(v.nome)) like v_p.padrao;
      if coalesce(array_length(v_ids, 1), 0) = 1 then
        v_part := v_part || jsonb_build_array(jsonb_build_object(
          'vendedor_id', v_ids[1], 'nome', v_p.nome, 'meta', 200000));
      else
        v_faltas := v_faltas || format(' %s (%s cadastros);', v_p.nome, coalesce(array_length(v_ids, 1), 0));
      end if;
    end loop;

    if jsonb_array_length(v_part) = 0 then
      continue; -- empresa sem nenhum desses vendedores: não é a LB
    end if;
    if v_faltas <> '' then
      raise exception 'Desafio atual: não foi possível ligar ao cadastro:%', v_faltas;
    end if;

    insert into public.desafios (org_id, titulo, frase, inicio, fim, meta_coletiva, participantes, ativo)
    values (v_org, 'DESAFIO LB — META DE R$ 1 MILHÃO',
            'Desafio · Responsabilidade · Competitividade · Espírito de equipe',
            date '2026-11-26', date '2026-12-07', 1000000, v_part, true);
  end loop;


  -- ENSAIO: o que foi cadastrado como desafio atual
  select string_agg(format('%s (%s vendedores, %s a %s)', titulo, jsonb_array_length(participantes),
                           to_char(inicio, 'DD/MM'), to_char(fim, 'DD/MM')), '; ')
    into v_seed from public.desafios;

  select p.id, p.vendedor_ref, coalesce(p.vendedor_id, p.id) into v_consultor, v_ref, v_org_t
    from public.profiles p
   where p.papel = 'vendedor' and p.vendedor_ref is not null
     and coalesce(p.ativo, true) and coalesce(p.codigo_liberado, true)
   limit 1;
  select id into v_admin from public.profiles
   where papel = 'admin' and coalesce(ativo, true) and coalesce(codigo_liberado, true)
   order by criado_em limit 1;
  select id into v_id from public.desafios limit 1;

  for v_t in
    select * from (values
      ('consultor', 'permitido', 'ver o desafio'),
      ('consultor', 'bloqueado', 'criar desafio'),
      ('consultor', 'bloqueado', 'alterar desafio'),
      ('consultor', 'bloqueado', 'excluir desafio'),
      ('admin', 'permitido', 'criar desafio'),
      ('admin', 'permitido', 'alterar desafio'),
      ('admin', 'permitido', 'excluir desafio')
    ) as x(quem, esperado, descricao)
  loop
    if (v_t.quem = 'consultor' and v_consultor is null) or (v_t.quem = 'admin' and v_admin is null)
       or (v_id is null and v_t.descricao <> 'criar desafio') then
      v_sem := v_sem + 1;
      continue;
    end if;
    v_n := 0;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', case v_t.quem when 'admin' then v_admin else v_consultor end, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      if v_t.descricao = 'ver o desafio' then
        select count(*) into v_n from public.desafios;
      elsif v_t.descricao = 'criar desafio' then
        insert into public.desafios (titulo, inicio, fim) values ('ENSAIO', date '2026-12-08', date '2026-12-22');
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'alterar desafio' then
        update public.desafios set ativo = not ativo where id = v_id;
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'excluir desafio' then
        delete from public.desafios where id = v_id;
        get diagnostics v_n = row_count;
      end if;
      raise exception using errcode = 'LBT01', message = 'desfaz este teste';
    exception
      when sqlstate 'LBT01' then
        v_res := case when v_n > 0 then 'permitido' else 'bloqueado' end;
      when insufficient_privilege then
        v_res := 'bloqueado';
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

  -- Este erro é proposital: é ele que garante que NADA fica gravado.
  raise exception using
    errcode = 'LBE01',
    message = format(E'ENSAIO CONCLUIDO - NADA FOI ALTERADO
PASSOU: %s
FALHAS: %s
SEM DADOS PARA TESTAR: %s
DESAFIO CADASTRADO: %s%s',
                     v_ok, v_falhas, v_sem, coalesce(v_seed, 'nenhum'), v_linhas);
end
$lb$;
