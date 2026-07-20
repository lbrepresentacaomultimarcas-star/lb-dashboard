-- ============================================================================
-- LB CRM — Módulo "Resultados LB" (contemplações oficiais da administradora)
-- ADITIVO: só cria 1 tabela nova. Nada existente muda. Idempotente.
-- Histórico permanente: registros nunca são apagados pela aplicação.
-- ============================================================================

create table if not exists public.resultados_contemplacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  cidade text not null,
  estado text not null default 'SE',
  tipo_bem text,                          -- Imóvel / Automóvel / Moto / ...
  valor_credito numeric(14,2),
  grupo text,
  cota text,
  data_contemplacao date,
  tipo_contemplacao text,                 -- Sorteio / Lance fixo / Lance livre...
  mes_ref text not null,                  -- "AAAA-MM" (competência do resultado)
  fonte text,                             -- nome do arquivo ou link importado
  criado_em timestamptz not null default now()
);

-- Evita duplicar o mesmo registro em reimportações (mesma cota no mesmo mês).
create unique index if not exists resultados_unico_idx
  on public.resultados_contemplacoes (org_id, mes_ref, coalesce(grupo,''), coalesce(cota,''), cidade);

create index if not exists resultados_org_idx    on public.resultados_contemplacoes (org_id, mes_ref);
create index if not exists resultados_cidade_idx on public.resultados_contemplacoes (org_id, cidade);

alter table public.resultados_contemplacoes enable row level security;

do $$
begin
  begin
    create policy "resultados read"   on public.resultados_contemplacoes for select using (org_id = public.current_org_id());
    create policy "resultados insert" on public.resultados_contemplacoes for insert with check (org_id = public.current_org_id());
    create policy "resultados update" on public.resultados_contemplacoes for update using (org_id = public.current_org_id());
    create policy "resultados delete" on public.resultados_contemplacoes for delete using (org_id = public.current_org_id());
  exception when duplicate_object then null;
  end;
end $$;
