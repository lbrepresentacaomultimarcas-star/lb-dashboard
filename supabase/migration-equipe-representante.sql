-- ============================================================================
-- LB CRM — CADEIA DE COMANDO COMPLETA NA EQUIPE
--
-- A equipe já guardava Supervisor e Líder. Faltava o degrau de cima:
--
--   ADMINISTRATIVO / REPRESENTANTE
--            ↓
--        SUPERVISOR
--            ↓
--          LÍDER
--            ↓
--        VENDEDORES
--
-- ISTO É ORGANOGRAMA, NÃO PERMISSÃO.
--
-- Estar apontado como supervisor de uma equipe NÃO dá poder de supervisor a
-- ninguém: quem concede permissão é `profiles.papel`, via `pode_ver_vendedor()`
-- e `permissions.ts`. Estas colunas dizem QUEM RESPONDE POR QUEM — nada mais.
-- Por isso nenhuma policy é tocada aqui.
--
-- 100% ADITIVA e IDEMPOTENTE.
-- ============================================================================

alter table public.equipes
  add column if not exists representante_id uuid;

comment on column public.equipes.representante_id is
  'Administrativo/Representante responsável pela equipe (profiles.id). Organograma — não concede permissão.';

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'coluna representante_id existe (tem que ser 1)' as item, count(*)::text as valor
  from information_schema.columns
 where table_schema = 'public' and table_name = 'equipes' and column_name = 'representante_id'
union all
select 'equipes cadastradas (não pode ter mudado)', count(*)::text from public.equipes
union all
select 'equipes com supervisor definido', count(*)::text
  from public.equipes where supervisor_id is not null
union all
select 'equipes com líder definido', count(*)::text
  from public.equipes where lider_id is not null;
