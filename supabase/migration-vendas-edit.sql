-- ============================================================================
-- LB CRM — Edição administrativa de Vendas (correção de data/valor)
-- Idempotente. Aditivo: nada existente muda de comportamento.
--
-- A separação que o admin pediu JÁ EXISTE nesta tabela:
--   • data       timestamptz  → DATA EFETIVA DA VENDA (o que os relatórios usam)
--   • criado_em  timestamptz  → data de criação do registro (imutável)
-- Este script só adiciona o campo `status` (rótulo editável) e garante o
-- realtime/replica identity pra edição propagar em tempo real.
-- ============================================================================

alter table public.vendas
  add column if not exists status text not null default 'Confirmada';

-- Realtime completo (insert/update/delete sob RLS) pra edição de venda
-- refletir na hora em todos os aparelhos, igual aos Resultados LB.
alter table public.vendas replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.vendas;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================================
-- VERIFICAÇÃO (opcional) — deve listar as colunas data, criado_em e status:
-- ============================================================================
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'vendas'
   and column_name in ('data', 'criado_em', 'status')
 order by column_name;
