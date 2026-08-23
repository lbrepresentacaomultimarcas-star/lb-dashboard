-- ============================================================================
-- LB CRM — Prazo informado pelo cliente (campo próprio, para análise futura)
-- 100% ADITIVA e IDEMPOTENTE. Rode no SQL Editor do Supabase.
--
-- NÃO altera a integração com a Meta, o webhook, a distribuição nem o Pipeline.
-- NÃO apaga nada: as respostas cruas do formulário continuam intactas em
-- `central_leads.wa_contato` (jsonb), exatamente como a Meta entregou.
--
-- POR QUE UM CAMPO PRÓPRIO: hoje a resposta do prazo só vira PRIORIDADE
-- (classificação do sistema) e uma linha de observação. Prioridade e prazo são
-- coisas diferentes: a primeira o CRM decide, a segunda o CLIENTE declarou.
-- Guardar o texto original permite comparar depois "o que ele disse" com
-- "quando fechou de verdade".
-- ============================================================================

-- 1) Coluna nova ---------------------------------------------------------------
alter table public.central_leads
  add column if not exists prazo_interesse text;  -- resposta LITERAL do cliente

comment on column public.central_leads.prazo_interesse is
  'Resposta original do cliente sobre quando pretende fechar. Nunca sobrescrever com classificação do sistema.';

create index if not exists central_leads_prazo_idx
  on public.central_leads (org_id, prazo_interesse)
  where prazo_interesse is not null;

-- 2) Backfill dos leads que JÁ entraram ---------------------------------------
--    O payload cru da Meta está em wa_contato -> lead -> field_data, um array de
--    { name, values }. Procuramos a pergunta de prazo e copiamos a resposta.
--    Só preenche o que está vazio — nunca sobrescreve.
update public.central_leads c
   set prazo_interesse = sub.resposta
  from (
    select l.id,
           (campo.valor -> 'values' ->> 0) as resposta
      from public.central_leads l
      cross join lateral jsonb_array_elements(
             coalesce(l.wa_contato -> 'lead' -> 'field_data', '[]'::jsonb)
           ) as campo(valor)
     where l.wa_contato is not null
       and (
            lower(campo.valor ->> 'name') like '%quando%'
         or lower(campo.valor ->> 'name') like '%prazo%'
         or lower(campo.valor ->> 'name') like '%pretende%'
       )
  ) as sub
 where c.id = sub.id
   and c.prazo_interesse is null
   and sub.resposta is not null;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'leads com payload da Meta guardado' as item, count(*)::text as valor
  from public.central_leads where wa_contato is not null
union all
select 'leads com prazo recuperado', count(*)::text
  from public.central_leads where prazo_interesse is not null
union all
select 'coluna criada', count(*)::text
  from information_schema.columns
 where table_name = 'central_leads' and column_name = 'prazo_interesse';
