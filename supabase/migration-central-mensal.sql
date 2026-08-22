-- ============================================================================
-- LB CRM — Central de Leads: histórico mensal + exclusão segura + lead de teste
-- 100% ADITIVA e IDEMPOTENTE. Rode no SQL Editor do Supabase.
--
-- NÃO apaga NENHUM lead. NÃO altera a integração com a Meta, o webhook, a
-- distribuição, o Pipeline nem as permissões. Só adiciona colunas novas e
-- ensina as métricas a ignorarem lead excluído e lead de teste.
--
-- A organização por mês NÃO precisa de coluna nova: `recebido_em` já existe,
-- é `not null default now()` e guarda data e hora exatas da entrada.
-- ============================================================================

-- 1) Colunas novas (todas opcionais / com default seguro) ---------------------
alter table public.central_leads
  add column if not exists excluido_em     timestamptz,  -- exclusão LÓGICA (o dado continua no banco)
  add column if not exists excluido_por    text,         -- e-mail de quem excluiu
  add column if not exists excluido_motivo text,
  add column if not exists teste           boolean not null default false;

-- 2) Índice para a consulta por período ---------------------------------------
create index if not exists central_leads_periodo_idx
  on public.central_leads (org_id, recebido_em desc)
  where excluido_em is null;

-- 3) Marca os leads de TESTE que já entraram ----------------------------------
--    A ferramenta de teste da Meta preenche os campos com texto genérico
--    ("<test lead: dummy data for full_name>"). Isso só ETIQUETA — não apaga.
update public.central_leads
   set teste = true
 where teste = false
   and (
        nome     ilike '%test lead%'
     or nome     ilike '%dummy data%'
     or nome     ilike '<%test%'
     or telefone ilike '%dummy%'
   );

-- 4) Métricas passam a ignorar excluído e teste -------------------------------
--    Mesma lógica de antes; muda SÓ o filtro do `base`. Histórico intacto.
create or replace function public.central_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  with base as (
    select * from public.central_leads
    where org_id = public.current_org_id()
      and public.pode_ver_vendedor(vendedor_id)
      and recebido_em >= p_from and recebido_em < p_to
      and excluido_em is null
      and coalesce(teste, false) = false
  )
  select jsonb_build_object(
    'recebidos',           count(*),
    'distribuidos',        count(*) filter (where distribuido_em is not null),
    'aguardando_ligacao',  count(*) filter (where status = 'aguardando'),
    'atendidos',           count(*) filter (where atendido_em is not null),
    'nao_atendidos',       count(*) filter (where status in ('nao_atendeu','aguardando_resposta')),
    'aguardando_resposta', count(*) filter (where status = 'aguardando_resposta'),
    'convertidos',         count(*) filter (where status = 'convertido'),
    'perdidos',            count(*) filter (where status = 'perdido'),
    'tempo_medio_distribuicao_seg',    avg(extract(epoch from (distribuido_em - recebido_em)))       filter (where distribuido_em is not null),
    'tempo_medio_primeira_ligacao_seg',avg(extract(epoch from (ligacao_iniciada_em - distribuido_em)))filter (where ligacao_iniciada_em is not null and distribuido_em is not null),
    'tempo_medio_atendimento_seg',     avg(extract(epoch from (atendido_em - ligacao_iniciada_em)))  filter (where atendido_em is not null and ligacao_iniciada_em is not null),
    'tempo_medio_conversao_seg',       avg(extract(epoch from (convertido_em - recebido_em)))        filter (where convertido_em is not null),
    'por_origem', (
      select coalesce(jsonb_agg(jsonb_build_object('origem', coalesce(origem,'—'), 'total', c, 'convertidos', cv)), '[]'::jsonb)
      from (select origem, count(*) c, count(*) filter (where status='convertido') cv from base group by origem) o
    ),
    'por_consultor', (
      select coalesce(jsonb_agg(jsonb_build_object('vendedor_id', vendedor_id, 'total', c, 'convertidos', cv)), '[]'::jsonb)
      from (select vendedor_id, count(*) c, count(*) filter (where status='convertido') cv
            from base where vendedor_id is not null group by vendedor_id) v
    )
  ) into res from base;
  return coalesce(res, '{}'::jsonb);
end$$;
revoke all on function public.central_dashboard(timestamptz, timestamptz) from public;
grant execute on function public.central_dashboard(timestamptz, timestamptz) to authenticated;

-- 5) Ranking de produtividade: mesma limpeza ----------------------------------
create or replace function public.central_ranking(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  with base as (
    select * from public.central_leads
    where org_id = public.current_org_id()
      and public.pode_ver_vendedor(vendedor_id)
      and vendedor_id is not null
      and recebido_em >= p_from and recebido_em < p_to
      and excluido_em is null
      and coalesce(teste, false) = false
  ),
  por as (
    select vendedor_id,
      count(*)                                          trabalhados,
      count(*) filter (where distribuido_em is not null) distribuidos,
      count(*) filter (where atendido_em is not null)    atendidos,
      count(*) filter (where status = 'convertido')      convertidos,
      avg(extract(epoch from (ligacao_iniciada_em - distribuido_em)))
        filter (where ligacao_iniciada_em is not null and distribuido_em is not null) tempo_resposta_seg
    from base group by vendedor_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'vendedor_id',       vendedor_id,
    'trabalhados',       trabalhados,
    'distribuidos',      distribuidos,
    'atendidos',         atendidos,
    'convertidos',       convertidos,
    'tempo_resposta_seg',tempo_resposta_seg
  ) order by convertidos desc, atendidos desc), '[]'::jsonb) into res from por;
  return coalesce(res, '[]'::jsonb);
end$$;
revoke all on function public.central_ranking(timestamptz, timestamptz) from public;
grant execute on function public.central_ranking(timestamptz, timestamptz) to authenticated;

-- ============================================================================
-- VERIFICAÇÃO — nenhum lead é apagado, só etiquetado
-- ============================================================================
select 'total de leads na Central'        as item, count(*)::text as valor from public.central_leads
union all
select 'marcados como TESTE',                    count(*)::text from public.central_leads where teste
union all
select 'excluídos (lógico)',                     count(*)::text from public.central_leads where excluido_em is not null
union all
select 'leads reais visíveis',                   count(*)::text from public.central_leads where not teste and excluido_em is null
union all
select 'colunas novas criadas',                  count(*)::text from information_schema.columns
 where table_name = 'central_leads'
   and column_name in ('excluido_em','excluido_por','excluido_motivo','teste');
