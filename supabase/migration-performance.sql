-- LB Dashboard — Índice LB de Performance (módulo independente)
-- ADITIVA: cria 2 tabelas novas. NÃO altera vendas/leads/metas/audit/etc.
-- Rodar no SQL Editor do Supabase do LB (projeto qjxmzttfdgivlsfxfwsc).

-- ============================================================
-- 1. Config da performance (1 linha por org) — pesos + metas
-- ============================================================
create table if not exists public.performance_config (
  org_id            uuid primary key default public.current_org_id(),
  -- pesos (somam ~100)
  peso_conversao    int not null default 40,
  peso_fechamentos  int not null default 25,
  peso_agendamentos int not null default 15,
  peso_propostas    int not null default 10,
  peso_atualizacao  int not null default 10,
  -- metas (bater a meta = 100% naquele indicador)
  meta_conversao    numeric(5,2) not null default 30,  -- %
  meta_fechamentos  int not null default 6,
  meta_agendamentos int not null default 20,
  meta_propostas    int not null default 30,
  dias_frescor      int not null default 7,
  limiar_evolucao   numeric(5,2) not null default 2,
  meta_empresa      numeric(5,2) not null default 80,  -- meta mínima de performance
  atualizado_em     timestamptz not null default now()
);

-- ============================================================
-- 2. Histórico mensal de performance (snapshot por vendedor/ciclo)
-- ============================================================
create table if not exists public.performance_historico (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default public.current_org_id(),
  vendedor_id      uuid not null references public.vendedores(id) on delete cascade,
  ciclo            text not null,                 -- "AAAA-MM" (mês do fechamento)
  nota             numeric(5,2) not null,
  sub_conversao    numeric(5,2) not null default 0,
  sub_fechamentos  numeric(5,2) not null default 0,
  sub_agendamentos numeric(5,2) not null default 0,
  sub_propostas    numeric(5,2) not null default 0,
  sub_atualizacao  numeric(5,2) not null default 0,
  classificacao    text not null,
  criado_em        timestamptz not null default now(),
  unique (org_id, vendedor_id, ciclo)
);
create index if not exists perf_hist_org_ciclo_idx on public.performance_historico (org_id, ciclo);
create index if not exists perf_hist_vendedor_idx   on public.performance_historico (vendedor_id);

-- ============================================================
-- 3. RLS — cada org só enxerga/edita o seu (padrão do projeto)
-- ============================================================
alter table public.performance_config    enable row level security;
alter table public.performance_historico enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['performance_config','performance_historico']) loop
    execute format('drop policy if exists "%s rw" on public.%s;', t, t);
    execute format(
      'create policy "%s rw" on public.%s for all using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());',
      t, t);
  end loop;
end$$;

-- ============================================================
-- 4. Realtime (config/histórico refletem na hora)
-- ============================================================
do $$
begin
  begin alter publication supabase_realtime add table public.performance_config;    exception when others then null; end;
  begin alter publication supabase_realtime add table public.performance_historico; exception when others then null; end;
end$$;
