-- ============================================================================
-- LB CRM — Resultados LB: realtime COMPLETO (insert + update + delete) sob RLS
-- Idempotente. Rode uma vez no SQL editor.
--
-- Por que: a tabela já está na publication supabase_realtime (o INSERT de uma
-- contemplação nova já chega em tempo real). MAS, com REPLICA IDENTITY DEFAULT,
-- o evento de UPDATE/DELETE só carrega a chave primária — sem `org_id` — então
-- o Realtime NÃO consegue avaliar a policy RLS (`org_id = current_org_id()`) e
-- o evento de "cancelamento"/"recuperação" de uma contemplação não é entregue
-- corretamente aos assinantes. REPLICA IDENTITY FULL inclui a linha inteira no
-- evento, deixando a RLS avaliar update/delete igual ao insert.
-- ============================================================================

alter table public.resultados_contemplacoes replica identity full;

-- Garante (de novo, idempotente) que a tabela está publicada no Realtime.
do $$
begin
  begin
    alter publication supabase_realtime add table public.resultados_contemplacoes;
  exception
    when duplicate_object then null;  -- já estava publicada (esperado)
  end;
end $$;

-- ============================================================================
-- VERIFICAÇÃO — me mande o resultado destas 3 consultas:
-- ============================================================================

-- (a) a tabela está na publicação do Realtime? (deve retornar 1 linha)
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'resultados_contemplacoes';

-- (b) replica identity = full? (relreplident deve ser 'f')
select relname, relreplident
  from pg_class
 where relname = 'resultados_contemplacoes';

-- (c) as 4 policies RLS existem e batem com o padrão das outras tabelas?
select policyname, cmd, qual
  from pg_policies
 where schemaname = 'public' and tablename = 'resultados_contemplacoes'
 order by cmd;
