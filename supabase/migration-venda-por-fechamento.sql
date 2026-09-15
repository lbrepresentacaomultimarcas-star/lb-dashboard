-- ============================================================================
-- LB CRM — UM FECHAMENTO = UMA VENDA (trava no banco)
--
-- Hoje a proteção contra fechar duas vezes o mesmo negócio existe só no
-- NAVEGADOR, e compara TEXTO:
--
--     vendas.some(v => v.observacao === `Auto-gerada do lead ${leadId}`)
--
-- Três problemas nisso. `observacao` é editável na tela de Vendas, então um
-- ajuste de texto apaga a proteção. A checagem roda contra o estado em
-- memória, e duas abas não se enxergam. E o próprio código já tem um
-- `catch` para o erro 23505 de índice único — uma trava que NUNCA foi criada.
-- Ou seja: o código esperava esta migration.
--
-- Nenhuma venda é alterada em valor, data, vendedor ou status. Nada é apagado.
--
-- SITUAÇÃO ATUAL DO BANCO (auditada em 15/09/2026, 28 vendas):
--   19 já têm `lead_id` preenchido
--    9 têm só o texto "Auto-gerada do lead <uuid>" e `lead_id` vazio
--    0 duplicadas — a trava entra num banco limpo
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) O QUE EXISTE HOJE
-- ----------------------------------------------------------------------------
select 'vendas no total'                        as item, count(*)::text as valor from public.vendas
union all
select 'com lead_id preenchido', count(*)::text from public.vendas where lead_id is not null
union all
select 'só com o id no texto (vão receber lead_id)', count(*)::text
  from public.vendas
 where lead_id is null
   and observacao ~ '^Auto-gerada do lead [0-9a-fA-F-]{36}$'
union all
select 'lançadas à mão (seguem sem lead_id, e está certo)', count(*)::text
  from public.vendas
 where lead_id is null
   and coalesce(observacao, '') !~ '^Auto-gerada do lead [0-9a-fA-F-]{36}$';

-- ----------------------------------------------------------------------------
-- 2) BACKFILL — o id que estava no texto vira coluna
--
-- Só preenche onde está vazio, e SÓ quando o texto tem o formato exato que a
-- aplicação gravava. Texto digitado por gente nunca casa com esse padrão.
--
-- A segunda condição é a que protege: se o negócio já tem outra venda com
-- aquele `lead_id`, NÃO preenche — assim o backfill não cria a duplicidade que
-- a trava do passo 4 depois recusaria, e o caso fica visível na conferência
-- para ser decidido a mão.
-- ----------------------------------------------------------------------------
update public.vendas v
   set lead_id = substring(v.observacao from '^Auto-gerada do lead ([0-9a-fA-F-]{36})$')::uuid
 where v.lead_id is null
   and v.observacao ~ '^Auto-gerada do lead [0-9a-fA-F-]{36}$'
   and not exists (
     select 1
       from public.vendas o
      where o.org_id = v.org_id
        and o.id <> v.id
        and o.lead_id = substring(v.observacao from '^Auto-gerada do lead ([0-9a-fA-F-]{36})$')::uuid
   );

-- ----------------------------------------------------------------------------
-- 3) SOBROU DUPLICIDADE? (só relatório — nada é apagado)
--
-- Se aparecer alguma linha aqui, o passo 4 vai falhar de propósito: é melhor a
-- migration parar do que alguém decidir sozinho qual venda é a legítima.
-- ----------------------------------------------------------------------------
select
  'DUPLICADAS (precisa decidir a mão antes da trava)' as item,
  coalesce(string_agg(distinct lead_id::text, ', '), 'nenhuma') as valor
from (
  select lead_id
    from public.vendas
   where lead_id is not null
   group by org_id, lead_id
  having count(*) > 1
) d;

-- ----------------------------------------------------------------------------
-- 4) A TRAVA
--
-- PARCIAL de propósito: `where lead_id is not null`. Venda lançada à mão em
-- /vendas não tem negócio de origem e não pode ser impedida — só o fechamento
-- automático precisa ser único.
--
-- A partir daqui, duplo clique, refresh, duas abas, retry e duas requisições
-- simultâneas devolvem 23505, e o `catch` que já existe no código trata como
-- "já estava registrada". A proteção passa a ser do BANCO, não da tela.
-- ----------------------------------------------------------------------------
create unique index if not exists vendas_um_por_fechamento
  on public.vendas (org_id, lead_id)
  where lead_id is not null;

comment on index public.vendas_um_por_fechamento is
  'Um fechamento = uma venda. Parcial: venda lançada à mão (sem lead_id) não é afetada.';

-- ============================================================================
-- CONFERÊNCIA — o estado depois
-- ============================================================================
select 'trava criada (tem que ser 1)' as item, count(*)::text as valor
  from pg_indexes
 where schemaname = 'public' and indexname = 'vendas_um_por_fechamento'
union all
select 'vendas com lead_id agora', count(*)::text
  from public.vendas where lead_id is not null
union all
select 'duplicadas restantes (tem que ser 0)', count(*)::text
  from (
    select 1 from public.vendas
     where lead_id is not null
     group by org_id, lead_id
    having count(*) > 1
  ) x
union all
select 'total de vendas (não pode ter mudado: 28)', count(*)::text from public.vendas;
