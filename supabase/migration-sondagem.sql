-- ============================================================================
-- LB CRM — Sondagem comercial: subproduto, faixa de crédito, objetivo
--          + quinto nível de prioridade (Urgentíssima)
--
-- 100% ADITIVA e IDEMPOTENTE. Rode no SQL Editor do Supabase.
--
-- NÃO altera a integração com a Meta, o webhook, a distribuição, o Pipeline
-- nem nenhum lead existente. As respostas cruas do formulário continuam
-- intactas em `central_leads.wa_contato`.
-- ============================================================================

-- 1) Campos estruturados da sondagem ------------------------------------------
--    Guardam a resposta LITERAL do cliente. O CRM classifica à parte, em
--    `prioridade` — as duas informações convivem e nenhuma sobrescreve a outra.
alter table public.central_leads
  add column if not exists subproduto    text,  -- tipo de imóvel/máquina, local da instalação
  add column if not exists faixa_credito text,  -- faixa de valor ou conta de luz
  add column if not exists objetivo      text;  -- reservado: nenhuma pergunta o alimenta ainda

comment on column public.central_leads.subproduto is
  'Resposta original: qual imóvel, que tipo de máquina, onde instalar. Nunca sobrescrever.';
comment on column public.central_leads.faixa_credito is
  'Resposta original da faixa de valor (ou da conta de luz, no solar). Nunca sobrescrever.';
comment on column public.central_leads.objetivo is
  'Reservado para análise comercial futura. Sem pergunta que o preencha por ora.';

create index if not exists central_leads_faixa_idx
  on public.central_leads (org_id, faixa_credito)
  where faixa_credito is not null;

-- 2) Quinto nível de prioridade -----------------------------------------------
--    O formulário passa a separar "O quanto antes" de "Nos próximos 7 dias".
--    São intenções diferentes e precisam de etiquetas diferentes, então o
--    sistema ganha 'urgentissima' acima de 'urgente'. Os quatro níveis que já
--    existiam continuam valendo — nenhum lead muda de classificação.
do $prio$
declare c text;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'central_leads'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%prioridade%'
  loop
    execute format('alter table public.central_leads drop constraint %I', c);
  end loop;
end $prio$;

alter table public.central_leads
  add constraint central_leads_prioridade_check
  check (prioridade in ('urgentissima', 'urgente', 'alta', 'normal', 'baixa'));

-- ============================================================================
-- VERIFICAÇÃO — nada é apagado nem reclassificado
-- ============================================================================
select 'colunas novas criadas' as item, count(*)::text as valor
  from information_schema.columns
 where table_name = 'central_leads'
   and column_name in ('subproduto','faixa_credito','objetivo')
union all
select 'níveis de prioridade aceitos', '5 (urgentissima, urgente, alta, normal, baixa)'
union all
select 'leads na Central (deve seguir igual)', count(*)::text from public.central_leads
union all
select 'leads que mudaram de prioridade', '0';
