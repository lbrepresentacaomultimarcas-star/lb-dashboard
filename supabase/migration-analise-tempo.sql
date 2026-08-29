-- ============================================================================
-- LB CRM — ANÁLISE COM TEMPO (etapa "Deixar em análise")
--
-- 100% ADITIVA e IDEMPOTENTE. Só acrescenta colunas em `analises`.
-- NÃO altera tabela nenhuma além dessa. NÃO mexe em fichas, leads, central,
-- tráfego nem no simulador.
--
-- ----------------------------------------------------------------------------
-- POR QUE NO BANCO E NÃO NO NAVEGADOR
--
-- O contador precisa sobreviver a recarregar a página, fechar a aba, trocar
-- de aparelho e a dois usuários abrindo a mesma proposta. Um setTimeout no
-- navegador não sobrevive a nada disso. Guardando o INSTANTE DE TÉRMINO, o
-- tempo restante é sempre calculado — nunca contado.
--
-- INVARIANTE: `analise_fim IS NOT NULL` <=> existe análise pendente.
-- Registrar a decisão final limpa esses campos. É isso que impede duas
-- análises simultâneas na mesma proposta e duas decisões finais.
-- ============================================================================

alter table public.analises
  add column if not exists analise_inicio    timestamptz,
  add column if not exists analise_fim       timestamptz,
  add column if not exists analise_minutos   integer,
  add column if not exists analise_resultado text,
  add column if not exists analise_por_nome  text,
  add column if not exists mensagem_reprovacao text;

comment on column public.analises.analise_fim is
  'Instante em que a análise termina. Fonte da verdade do contador — o navegador só calcula a diferença.';
comment on column public.analises.analise_resultado is
  'Resultado programado pelo administrador: aprovado | nao_aprovado. Só vale enquanto analise_fim não for nulo.';

-- o resultado programado só aceita os dois valores possíveis
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'analises_analise_resultado_check'
  ) then
    alter table public.analises
      add constraint analises_analise_resultado_check
      check (analise_resultado is null or analise_resultado in ('aprovado', 'nao_aprovado'));
  end if;
end $$;

-- Achar rápido as análises pendentes (para a tela e para conferir concorrência).
create index if not exists analises_pendentes_idx
  on public.analises (org_id, analise_fim)
  where analise_fim is not null;

-- ============================================================================
-- VERIFICAÇÃO — nada existente foi alterado
-- ============================================================================
select 'colunas novas em analises' as item, count(*)::text as valor
  from information_schema.columns
 where table_name = 'analises'
   and column_name in ('analise_inicio','analise_fim','analise_minutos',
                       'analise_resultado','analise_por_nome','mensagem_reprovacao')
union all
select 'analises (deve seguir igual)', count(*)::text from public.analises
union all
select 'fichas (deve seguir igual)', count(*)::text from public.fichas
union all
select 'leads (deve seguir igual)', count(*)::text from public.leads;
