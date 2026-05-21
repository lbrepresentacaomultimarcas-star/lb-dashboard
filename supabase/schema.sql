-- LB Dashboard 2.0 — schema Supabase
-- Rode no SQL Editor do seu projeto Supabase (https://supabase.com/dashboard).

-- ============================================================
-- HELPER: org_id atual (cada usuário admin é uma org por padrão)
-- ============================================================

create or replace function public.current_org_id() returns uuid
language plpgsql stable as $$
begin
  return coalesce(
    (select vendedor_id from public.profiles where id = auth.uid()),
    auth.uid()
  );
end;
$$;

-- ============================================================
-- TABELAS
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  papel text not null check (papel in ('admin', 'vendedor')) default 'admin',
  vendedor_id uuid,
  criado_em timestamptz not null default now()
);

create table if not exists public.vendedores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  nome text not null,
  email text,
  meta_mensal numeric(12,2) not null default 0,
  comissao_pct numeric(5,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  cliente text not null,
  valor numeric(12,2) not null check (valor >= 0),
  data timestamptz not null default now(),
  observacao text,
  criado_em timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  nome text not null,
  email text,
  telefone text,
  empresa text,
  notas text,
  criado_em timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  nome text not null,
  email text,
  telefone text,
  valor_estimado numeric(12,2) not null default 0,
  status text not null check (status in ('novo','contato','qualificado','ganho','perdido')) default 'novo',
  vendedor_id uuid references public.vendedores(id) on delete set null,
  origem text,
  observacao text,
  criado_em timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  usuario_email text,
  detalhes text,
  criado_em timestamptz not null default now()
);

create index if not exists vendas_vendedor_idx     on public.vendas (vendedor_id);
create index if not exists vendas_data_idx         on public.vendas (data);
create index if not exists vendas_org_idx          on public.vendas (org_id);
create index if not exists vendedores_org_idx      on public.vendedores (org_id);
create index if not exists clientes_org_idx        on public.clientes (org_id);
create index if not exists leads_org_idx           on public.leads (org_id);
create index if not exists leads_status_idx        on public.leads (status);
create index if not exists audit_log_org_idx       on public.audit_log (org_id);
create index if not exists audit_log_criado_em_idx on public.audit_log (criado_em desc);

-- ============================================================
-- RLS — cada org só enxerga os próprios registros
-- ============================================================

alter table public.profiles    enable row level security;
alter table public.vendedores  enable row level security;
alter table public.vendas      enable row level security;
alter table public.clientes    enable row level security;
alter table public.leads       enable row level security;
alter table public.audit_log   enable row level security;

drop policy if exists "profiles self read"  on public.profiles;
drop policy if exists "profiles self write" on public.profiles;
create policy "profiles self read"  on public.profiles for select using (id = auth.uid());
create policy "profiles self write" on public.profiles for update using (id = auth.uid());

-- Helper macro: aplica as 4 policies (CRUD) numa tabela por org_id
do $$
declare t text;
begin
  for t in select unnest(array['vendedores','vendas','clientes','leads','audit_log']) loop
    execute format('drop policy if exists "%s read"   on public.%s;', t, t);
    execute format('drop policy if exists "%s insert" on public.%s;', t, t);
    execute format('drop policy if exists "%s update" on public.%s;', t, t);
    execute format('drop policy if exists "%s delete" on public.%s;', t, t);
    execute format('create policy "%s read"   on public.%s for select using (org_id = public.current_org_id());', t, t);
    execute format('create policy "%s insert" on public.%s for insert with check (org_id = public.current_org_id());', t, t);
    execute format('create policy "%s update" on public.%s for update using (org_id = public.current_org_id());', t, t);
    execute format('create policy "%s delete" on public.%s for delete using (org_id = public.current_org_id());', t, t);
  end loop;
end$$;

-- ============================================================
-- TRIGGER — cria profile automaticamente quando alguém se cadastra
-- ============================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'admin'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- REALTIME — habilita push de mudanças
-- ============================================================

alter publication supabase_realtime add table public.vendedores;
alter publication supabase_realtime add table public.vendas;
alter publication supabase_realtime add table public.clientes;
alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.audit_log;
