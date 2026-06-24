-- LB Dashboard — regra de fechamento de produção (dia base + dia útil)
-- ADITIVA: cria 2 tabelas novas. NÃO altera vendas/metas/leads/etc.
-- Rodar no SQL Editor do Supabase do LB (projeto qjxmzttfdgivlsfxfwsc).

-- ============================================================
-- 1. Config da produção (1 linha por org)
-- ============================================================
create table if not exists public.config_producao (
  org_id              uuid primary key default public.current_org_id(),
  dia_base            int  not null default 20 check (dia_base between 1 and 28),
  prorrogar_dia_util  boolean not null default true,
  considerar_sab_dom  boolean not null default true,
  considerar_feriados boolean not null default true,
  inicio_proximo_ciclo text not null default 'dia_seguinte'
                       check (inicio_proximo_ciclo in ('no_fechamento','dia_seguinte')),
  -- cutover: a regra só vale a partir desta data (histórico antigo intacto).
  -- Default é "futuro distante" = DESLIGADO por segurança; o admin define a data
  -- real na tela (ex.: 2026-06-23). Sem linha salva, o app também fica desligado.
  data_inicio_regra   date not null default '9999-12-31',
  atualizado_em       timestamptz not null default now()
);

-- ============================================================
-- 2. Feriados (tela admin de manutenção)
-- ============================================================
create table if not exists public.feriados (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default public.current_org_id(),
  data        date not null,
  descricao   text,
  criado_em   timestamptz not null default now(),
  unique (org_id, data)
);
create index if not exists feriados_org_data_idx on public.feriados (org_id, data);

-- ============================================================
-- 3. RLS — cada org só enxerga/edita o seu (padrão do LB)
-- ============================================================
alter table public.config_producao enable row level security;
alter table public.feriados        enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['config_producao','feriados']) loop
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
-- 4. Realtime (pra config/feriados refletirem na hora)
-- ============================================================
do $$
begin
  begin alter publication supabase_realtime add table public.config_producao; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.feriados;        exception when duplicate_object then null; end;
end$$;
