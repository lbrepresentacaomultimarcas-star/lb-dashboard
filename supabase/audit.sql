-- ============================================================
-- LB Dashboard — AUDITORIA DE SEGURANÇA (RLS / GRANTS / POLICIES)
-- ------------------------------------------------------------
-- Rode no SQL Editor do Supabase (https://supabase.com/dashboard).
-- Seções 1–3 = SOMENTE LEITURA (diagnóstico).
-- Seção 4 = HARDENING idempotente e seguro. Leia os comentários antes.
-- Recomendado: rode 1–3, confira o resultado, depois rode a 4 e por fim
-- rode a 1 de novo pra confirmar.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabelas do schema public + status de RLS + nº de policies
--    ⚠️ rls_habilitado = false  ->  tabela EXPOSTA via PostgREST/GraphQL
--       (qualquer um com a anon key, ou um JWT, consegue ler/escrever)
-- ------------------------------------------------------------
select
  c.relname                                     as tabela,
  c.relrowsecurity                              as rls_habilitado,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) as qtd_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- ------------------------------------------------------------
-- 2. Tabelas com RLS ON mas SEM policy (= deny-all).
--    OK se a tabela só é acessada pela API admin (service_role ignora RLS).
--    NÃO ok se o app lê essa tabela direto pelo browser (vai falhar/voltar vazio).
-- ------------------------------------------------------------
select c.relname as tabela_deny_all
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by c.relname;

-- ------------------------------------------------------------
-- 3. GRANTS diretos das roles anon / authenticated
--    'anon' (visitante não logado) idealmente NÃO deve ter nada aqui.
-- ------------------------------------------------------------
select table_name, grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- ============================================================
-- 4. HARDENING (idempotente). Aplica o padrão atual do Supabase:
--    • anon NUNCA acessa tabela direto (este app é só pra usuário logado)
--    • RLS habilitado em TODAS as tabelas public
--    • tabela com coluna org_id -> policies por org (multi-tenant) automáticas
--    • profiles -> cada um lê/edita só a própria linha
--    • tabela admin-only sem org_id (ex.: equipes/producoes) fica deny-all
--      para 'authenticated' DE PROPÓSITO: o app acessa via API com
--      service_role, que ignora RLS. Isso é mais seguro, não menos.
--    Se a seção 2 (depois daqui) listar alguma tabela que o BROWSER lê
--    direto, me mande o nome/colunas que eu escrevo a policy específica.
-- ============================================================
do $$
declare r record;
begin
  -- 4a. remove acesso direto do visitante não-logado
  revoke all on all tables in schema public from anon;

  -- 4b. RLS em tudo + policies por org_id quando a coluna existir
  for r in
    select c.relname as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security;', r.t);

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.t and column_name = 'org_id'
    ) then
      execute format('drop policy if exists "org_select" on public.%I;', r.t);
      execute format('drop policy if exists "org_insert" on public.%I;', r.t);
      execute format('drop policy if exists "org_update" on public.%I;', r.t);
      execute format('drop policy if exists "org_delete" on public.%I;', r.t);
      execute format('create policy "org_select" on public.%I for select to authenticated using (org_id = public.current_org_id());', r.t);
      execute format('create policy "org_insert" on public.%I for insert to authenticated with check (org_id = public.current_org_id());', r.t);
      execute format('create policy "org_update" on public.%I for update to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());', r.t);
      execute format('create policy "org_delete" on public.%I for delete to authenticated using (org_id = public.current_org_id());', r.t);
      raise notice 'org-scoped OK: %', r.t;
    elsif r.t = 'profiles' then
      execute 'drop policy if exists "profiles self read"  on public.profiles;';
      execute 'drop policy if exists "profiles self write" on public.profiles;';
      execute 'create policy "profiles self read"  on public.profiles for select to authenticated using (id = auth.uid());';
      execute 'create policy "profiles self write" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());';
      raise notice 'profiles self-access OK';
    else
      raise notice 'ATENCAO: "%" tem RLS on e SEM org_id -> deny-all p/ authenticated. Se o browser lê essa tabela, crie uma policy especifica.', r.t;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. Confirmação: rode a seção 1 de novo. Esperado: rls_habilitado = true
--    em todas as tabelas, e qtd_policies > 0 nas tabelas que o app lê.
-- ------------------------------------------------------------
