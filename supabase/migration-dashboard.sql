-- ============================================================================
-- LB CRM — Painel Inteligente do Dashboard
-- Config editável pelo admin (Lembrete do Dia + Meta do Dia), 1 linha por org.
-- 100% ADITIVO e IDEMPOTENTE. Rode UMA vez no SQL editor do Supabase.
-- ============================================================================

create table if not exists public.dashboard_config (
  org_id        uuid primary key default current_org_id(),
  lembrete      text,
  meta_ligacoes int not null default 30,
  meta_reunioes int not null default 5,
  meta_vendas   int not null default 1,
  atualizado_em timestamptz not null default now()
);

alter table public.dashboard_config enable row level security;

do $$
begin
  create policy dashboard_config_all on public.dashboard_config
    using (org_id = current_org_id())
    with check (org_id = current_org_id());
exception when duplicate_object then null;
end $$;

-- Realtime: admin salva → todos veem sem recarregar
alter table public.dashboard_config replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.dashboard_config;
exception when duplicate_object then null;
end $$;
