-- ============================================================================
-- LB CRM — Módulo "Resultados LB" (contemplações oficiais da administradora)
-- v2 — schema calibrado com o PDF OFICIAL real (o resultado traz UF, grupo,
-- cota, % e valor do LANCE; não traz cidade nem valor de sorteio).
-- ADITIVO: só cria 1 tabela nova. Nada existente muda. Idempotente.
-- (O "drop" abaixo só remove a v1 desta MESMA tabela, caso tenha sido criada
--  antes desta correção — ela ainda não tinha dados.)
-- Histórico permanente: registros nunca são apagados pela aplicação.
-- ============================================================================

drop table if exists public.resultados_contemplacoes;

create table public.resultados_contemplacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  uf text not null default 'SE',
  grupo text not null,
  cota text not null,
  tipo_bem text,                          -- Imóvel / Automóvel / Moto / Serviço / Caminhão
  tipo_contemplacao text not null,        -- Sorteio / Lance Fixo / Lance Livre
  pct_lance numeric(8,4),                 -- % do lance (ex.: 30, 43.75) — null em sorteio
  parcelas_lance numeric(8,2),            -- nº de parcelas do lance — null em sorteio
  valor_lance numeric(14,2),              -- valor pago no lance — null em sorteio
  credito_estimado numeric(14,2),         -- valor_lance ÷ (% ÷ 100) — null em sorteio
  num_assembleia int,                     -- nº da assembleia (ex.: 37)
  data_contemplacao date,
  mes_ref text not null,                  -- "AAAA-MM" (competência do resultado)
  fonte text,                             -- nome do arquivo ou link importado
  criado_em timestamptz not null default now()
);

-- Evita duplicar o mesmo registro em reimportações (mesma cota do mesmo grupo
-- não é contemplada duas vezes no mesmo mês).
create unique index if not exists resultados_unico_idx
  on public.resultados_contemplacoes (org_id, grupo, cota, mes_ref);

create index if not exists resultados_org_idx   on public.resultados_contemplacoes (org_id, mes_ref);
create index if not exists resultados_grupo_idx on public.resultados_contemplacoes (org_id, grupo);

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
