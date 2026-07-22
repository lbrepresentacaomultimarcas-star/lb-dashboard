-- ============================================================================
-- LB CRM — Edição administrativa de Vendas + Status (Cancelada sai dos números)
-- Idempotente. Rode uma vez no SQL editor.
--
-- A separação que o admin pediu JÁ EXISTE nesta tabela:
--   • data       timestamptz  → DATA EFETIVA DA VENDA (o que os relatórios usam)
--   • criado_em  timestamptz  → data de criação do registro (imutável)
-- Este script adiciona `status` (Confirmada/Pendente/Cancelada), liga o
-- realtime completo da edição, e faz o RANKING (RPC org-wide) ignorar as
-- vendas Canceladas — assim faturamento, ranking, IA e metas não as contam.
-- ============================================================================

-- 1) Campo status (default Confirmada) + realtime completo pra edição refletir
--    em tempo real em todos os aparelhos.
alter table public.vendas
  add column if not exists status text not null default 'Confirmada';

alter table public.vendas replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.vendas;
  exception when duplicate_object then null;
  end;
end $$;

-- 2) RPC do ranking org-wide: exclui vendas Canceladas (mesma assinatura →
--    sem 42P13). O app-side já exclui no cliente; aqui garante o server-side.
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
        and coalesce(s.status, 'Confirmada') <> 'Cancelada'
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

-- 3) Ranking mensal fechado: mesma exclusão de Canceladas.
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
          and coalesce(s.status, 'Confirmada') <> 'Cancelada'
      ), 0)::numeric as vendido,
      coalesce((
        select count(*) from public.vendas s
        where s.vendedor_id = v.id and to_char(s.data, 'YYYY-MM') = p_ano_mes
          and coalesce(s.status, 'Confirmada') <> 'Cancelada'
      ), 0)::bigint as vendas_count,
      v.comissao_pct
    from public.vendedores v
    where v.ativo
  )
  select
    b.id, b.nome, b.meta, b.vendido, b.vendas_count,
    (b.vendido * b.comissao_pct / 100.0)::numeric as comissao,
    case when b.meta > 0 then (b.vendido / b.meta * 100.0) else 0 end::numeric as pct_meta
  from base b
  order by b.vendido desc;
$$;

revoke all on function public.ranking_mensal(text) from public;
grant execute on function public.ranking_mensal(text) to authenticated;

-- ============================================================================
-- VERIFICAÇÃO (opcional):
-- ============================================================================
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'vendas'
   and column_name in ('data', 'criado_em', 'status')
 order by column_name;
