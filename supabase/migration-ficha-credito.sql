-- ============================================================================
-- LB CRM — CAMPO "CRÉDITO" NA FICHA FINAL
--
-- O formulário de papel tem, na mesma caixa: "Grupo: ____  Crédito: ____".
-- No sistema o Grupo tinha campo, o Crédito não: o PDF puxava o valor da
-- ANÁLISE. Quando a análise vinha sem valor, a linha saía em branco na ficha
-- impressa — e não havia onde digitar para corrigir.
--
-- Agora a ficha guarda o próprio crédito, ao lado de contrato/cota/grupo,
-- que são os outros dados da OPERAÇÃO fechada.
--
-- NÃO sobrescreve a análise de propósito: ela é o registro de como a proposta
-- foi avaliada, e mexer nela mudaria o percentual de lance já calculado.
-- Ficha vazia = o PDF continua usando o valor da análise, exatamente como
-- antes. Nada muda nas fichas que já existem.
--
-- 100% ADITIVA e IDEMPOTENTE.
-- ============================================================================

alter table public.fichas
  add column if not exists credito numeric;

comment on column public.fichas.credito is
  'Valor do crédito contratado, como sai na ficha impressa. Vazio = usa o da análise.';

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'coluna credito existe (tem que ser 1)' as item, count(*)::text as valor
  from information_schema.columns
 where table_schema = 'public' and table_name = 'fichas' and column_name = 'credito'
union all
select 'fichas existentes (nao pode ter mudado)', count(*)::text from public.fichas;
