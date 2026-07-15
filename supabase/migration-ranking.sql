-- ============================================================================
-- LB CRM — Ranking org-wide (fonte única p/ desktop e mobile)
-- ADITIVO: só cria 2 funções RPC. Nada existente muda. Idempotente.
--
-- Problema que resolve: o RLS faz o VENDEDOR logado enxergar só os próprios
-- dados → no celular o ranking aparecia apenas com ele mesmo, desatualizado e
-- diferente do desktop (admin vê tudo). Estas funções são SECURITY DEFINER e
-- devolvem, para QUALQUER usuário autenticado, o MESMO pacote de dados que o
-- admin usa — assim desktop e mobile calculam o ranking com a mesma consulta,
-- mesma ordenação, mesmos filtros e mesma pontuação.
--
-- Privacidade: as vendas saem ANÔNIMAS (vendedor, data, valor) — sem cliente
-- e sem observação. É o mínimo necessário pra reproduzir a bucketização por
-- ciclo de produção (fechamento dia 20) exatamente como o desktop faz.
-- Obs.: cada empresa tem seu próprio deploy + banco (LB e WR separados).
-- ============================================================================

-- 1) Pacote de dados do ranking para um intervalo (com folga p/ ciclos).
create or replace function public.ranking_dados(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'vendedores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'nome', v.nome, 'ativo', v.ativo,
        'comissaoPct', v.comissao_pct, 'metaMensal', v.meta_mensal
      ) order by v.nome)
      from public.vendedores v
    ), '[]'::jsonb),
    'metas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'vendedorId', m.vendedor_id, 'anoMes', m.ano_mes, 'valor', m.valor
      ))
      from public.metas m
    ), '[]'::jsonb),
    'vendas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'vendedorId', s.vendedor_id, 'data', s.data, 'valor', s.valor
      ))
      from public.vendas s
      where s.data >= p_from and s.data <= p_to
    ), '[]'::jsonb),
    'feriados', coalesce((
      select jsonb_agg(f.data order by f.data) from public.feriados f
    ), '[]'::jsonb),
    'config', (
      select jsonb_build_object(
        'diaBase', c.dia_base,
        'prorrogarDiaUtil', c.prorrogar_dia_util,
        'considerarSabDom', c.considerar_sab_dom,
        'considerarFeriados', c.considerar_feriados,
        'inicioProximoCiclo', c.inicio_proximo_ciclo,
        'dataInicioRegra', c.data_inicio_regra
      )
      from public.config_producao c
      limit 1
    )
  );
$$;

revoke all on function public.ranking_dados(timestamptz, timestamptz) from public;
grant execute on function public.ranking_dados(timestamptz, timestamptz) to authenticated;

-- 2) Ranking de um mês fechado ("AAAA-MM") — shape que o app já esperava
--    (use-ranking.ts referenciava esta RPC, que nunca havia sido criada).
create or replace function public.ranking_mensal(p_ano_mes text)
returns table (
  vendedor_id uuid,
  nome text,
  meta numeric,
  vendido numeric,
  vendas_count bigint,
  comissao numeric,
  pct_meta numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      v.id,
      v.nome,
      coalesce((select m.valor from public.metas m where m.vendedor_id = v.id and m.ano_mes = p_ano_mes), v.meta_mensal, 0)::numeric as meta,
      coalesce((
        select sum(s.valor) from public.vendas s
        where s.vendedor_id = v.id and to_char(s.data, 'YYYY-MM') = p_ano_mes
      ), 0)::numeric as vendido,
      coalesce((
        select count(*) from public.vendas s
        where s.vendedor_id = v.id and to_char(s.data, 'YYYY-MM') = p_ano_mes
      ), 0)::bigint as vendas_count,
      v.comissao_pct
    from public.vendedores v
    where v.ativo
  )
  select
    b.id,
    b.nome,
    b.meta,
    b.vendido,
    b.vendas_count,
    (b.vendido * b.comissao_pct / 100.0)::numeric as comissao,
    case when b.meta > 0 then (b.vendido / b.meta * 100.0) else 0 end::numeric as pct_meta
  from base b
  order by b.vendido desc;
$$;

revoke all on function public.ranking_mensal(text) from public;
grant execute on function public.ranking_mensal(text) to authenticated;
