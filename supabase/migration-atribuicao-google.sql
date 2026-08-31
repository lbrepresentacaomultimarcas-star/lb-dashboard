-- ============================================================================
-- LB CRM — ORIGEM DO LEAD (Google Ads / UTMs)
--
-- 100% ADITIVA e IDEMPOTENTE. Só acrescenta colunas em `central_leads`.
-- NÃO altera nada existente. NÃO mexe em distribuição, Pipeline, fichas nem
-- na anti-duplicidade.
--
-- ----------------------------------------------------------------------------
-- PARA QUE SERVE
--
-- Hoje o CRM sabe QUANTOS leads chegaram. Com estas colunas ele passa a saber
-- de ONDE cada um veio — e, principalmente, permite o caminho de volta:
--
--   anúncio → clique (gclid) → lead → atendimento → proposta → VENDA
--                                                              ↓
--                            o CRM devolve ao Google "este clique virou venda"
--
-- Sem o gclid guardado, esse retorno é impossível: o Google ficaria otimizando
-- por quem preenche formulário, não por quem compra.
--
-- NENHUM dado pessoal do cliente vai para o Google. O gclid é um identificador
-- do próprio Google e não diz quem a pessoa é.
-- ============================================================================

alter table public.central_leads
  add column if not exists gclid        text,
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term     text,
  add column if not exists utm_content  text,
  add column if not exists landing_url  text,
  add column if not exists referrer     text;

comment on column public.central_leads.gclid is
  'Identificador do clique no Google Ads. É a chave para devolver a venda ao Google (conversão off-line).';
comment on column public.central_leads.utm_term is
  'Palavra-chave/termo da campanha, quando a URL do anúncio a repassa.';

-- Achar rápido os leads que vieram de anúncio (é a consulta da conversão
-- off-line: "quais leads com gclid viraram venda?").
create index if not exists central_leads_gclid_idx
  on public.central_leads (org_id, gclid)
  where gclid is not null;

create index if not exists central_leads_campanha_idx
  on public.central_leads (org_id, utm_source, utm_campaign)
  where utm_source is not null;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'colunas de origem criadas' as item, count(*)::text as valor
  from information_schema.columns
 where table_name = 'central_leads'
   and column_name in ('gclid','utm_source','utm_medium','utm_campaign',
                       'utm_term','utm_content','landing_url','referrer')
union all
select 'central_leads (nenhum lead alterado)', count(*)::text from public.central_leads
union all
select 'leads do Pipeline (deve seguir igual)', count(*)::text from public.leads;
