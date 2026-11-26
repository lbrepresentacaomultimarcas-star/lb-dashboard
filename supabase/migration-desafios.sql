-- LB CRM — DESAFIOS CONFIGURÁVEIS (Gerenciar desafios)
--
-- RODE PRIMEIRO `ensaio-desafios.sql`. Só rode este se o ensaio terminar com
-- "FALHAS: 0".
--
-- Cria a tabela `desafios`: título, frase, período, participantes (vendedor,
-- nome exibido e meta) e se está ativo. Todos da empresa leem; só o
-- administrador cria, altera ou exclui.
-- Já cadastra o desafio atual (R$ 1 milhão, 26/11 a 07/12) com os 5 vendedores,
-- ligados aos cadastros existentes. Não altera vendas, vendedores nem metas.
-- É um único bloco: ou aplica tudo, ou não aplica nada.

do $lb$
declare
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

  --@@FIM_MIGRACAO@@
end
$lb$;

select titulo, inicio, fim, jsonb_array_length(participantes) as vendedores, ativo
  from public.desafios order by inicio desc;
