-- ============================================================================
-- LB CRM — Sincronização em tempo real + trava anti-duplicata de venda
-- Idempotente: pode rodar quantas vezes quiser.
--
-- 1) Garante TODAS as tabelas que o app assina na publication do Realtime.
--    Sem isso o canal conecta mas NUNCA recebe evento (falha silenciosa) —
--    e a interface só atualiza ao recarregar a página. Obs.: `metas` nunca
--    tinha sido publicada em migration nenhuma.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'vendedores','vendas','clientes','leads','metas','feriados',
    'config_producao','performance_config','performance_historico',
    'temas','audit_log','resultados_contemplacoes'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;  -- já publicada
      when undefined_table  then null;  -- tabela não existe nesse ambiente
    end;
  end loop;
end $$;

-- ============================================================================
-- 2) Trava anti-duplicata da venda automática de fechamento: a MESMA cota de
--    negócio nunca gera duas vendas (arrastar pra fora e de volta, cliques
--    duplos, dois aparelhos ao mesmo tempo).
-- ============================================================================
create unique index if not exists vendas_auto_lead_unq
  on public.vendas (org_id, observacao)
  where observacao like 'Auto-gerada do lead %';

-- ============================================================================
-- 3) VERIFICAÇÃO — me mande o resultado destas duas consultas:
-- ============================================================================
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
 order by 1;

select count(*) as vendas_auto_duplicadas
  from (
    select observacao
      from public.vendas
     where observacao like 'Auto-gerada do lead %'
     group by org_id, observacao
    having count(*) > 1
  ) d;
