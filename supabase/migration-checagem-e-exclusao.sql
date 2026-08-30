-- ============================================================================
-- LB CRM — CAMPO CHECAGEM + EXCLUSÃO DE PROPOSTA
--
-- 100% ADITIVA e IDEMPOTENTE. Duas colunas em `analises`, uma em `fichas`.
-- NÃO altera nada mais: nem forma de pagamento, nem dados bancários, nem os
-- estados da análise, nem o simulador, nem o PDF além de passar a imprimir o
-- que for digitado no CHECAGEM.
--
-- ----------------------------------------------------------------------------
-- 1) CHECAGEM
--
-- O formulário de papel tem a linha "CHECAGEM:" e ela já aparece na ficha —
-- mas em BRANCO, porque até agora era preenchida à mão. Não existia campo no
-- banco. Esta coluna é esse campo: um só, o mesmo que a tela de edição
-- preenche e o PDF imprime. Não há segunda informação.
--
-- 2) EXCLUSÃO
--
-- Exclusão LÓGICA, não apagamento. O card some da tela e não volta ao
-- recarregar — que é o que foi pedido — mas a análise e todo o histórico dela
-- continuam no banco. Apagar de verdade levaria junto a ficha e os eventos por
-- cascade, e este módulo foi construído com "histórico não se apaga".
-- ============================================================================

alter table public.fichas
  add column if not exists checagem text;

comment on column public.fichas.checagem is
  'Linha CHECAGEM do formulário. Preenchida na tela de edição da ficha e impressa no PDF.';

alter table public.analises
  add column if not exists excluido_em       timestamptz,
  add column if not exists excluido_por_nome text;

comment on column public.analises.excluido_em is
  'Exclusão LÓGICA: some da tela, continua no banco para auditoria.';

create index if not exists analises_ativas_idx
  on public.analises (org_id, criado_em desc)
  where excluido_em is null;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'coluna checagem em fichas' as item, count(*)::text as valor
  from information_schema.columns
 where table_name = 'fichas' and column_name = 'checagem'
union all
select 'colunas de exclusão em analises', count(*)::text
  from information_schema.columns
 where table_name = 'analises' and column_name in ('excluido_em', 'excluido_por_nome')
union all
select 'analises (nenhuma foi apagada)', count(*)::text from public.analises
union all
select 'fichas (deve seguir igual)', count(*)::text from public.fichas;
