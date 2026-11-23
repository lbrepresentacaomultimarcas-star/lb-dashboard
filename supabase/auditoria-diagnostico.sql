-- LB CRM — DIAGNÓSTICO DA AUDITORIA (SOMENTE LEITURA)
--
-- Não altera, não apaga e não cria nada. Devolve só contagens e nomes de regras:
-- nenhum nome de cliente, telefone, e-mail, valor ou credencial sai daqui.
-- Rodar no SQL Editor do Supabase e enviar o resultado.

with
regras as (
  select tablename, cmd, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as texto
    from pg_policies
   where schemaname = 'public'
),
escrita_ampla as (
  select tablename, string_agg(distinct cmd, ', ' order by cmd) as operacoes
    from regras
   where cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and tablename in ('vendas', 'metas', 'vendedores', 'clientes', 'leads', 'central_leads',
                       'audit_log', 'config_producao', 'dashboard_config', 'performance_config',
                       'performance_historico', 'feriados', 'mensagens_prontas', 'notificacoes')
     and texto not ilike '%admin%'
     and texto not ilike '%pode_ver_vendedor%'
     and texto not ilike '%auth.uid%'
   group by tablename
),
leitura_ampla as (
  select tablename
    from regras
   where cmd in ('SELECT', 'ALL')
     and tablename in ('vendas', 'metas', 'clientes', 'audit_log')
     and texto not ilike '%pode_ver_vendedor%'
     and texto not ilike '%admin%'
     and texto not ilike '%auth.uid%'
   group by tablename
),
tel as (
  select regexp_replace(coalesce(telefone, ''), '\D', '', 'g') as d from public.leads
  union all
  select regexp_replace(coalesce(telefone, ''), '\D', '', 'g') from public.central_leads
),
dup as (
  select public.lb_chave_telefone(telefone) as chave, count(distinct vendedor_id) as donos
    from public.central_leads
   where encerrado_em is null and excluido_em is null and coalesce(teste, false) = false
     and public.lb_chave_telefone(telefone) <> ''
   group by 1
  having count(*) > 1
)
select 1 as ordem, 'SEGURANCA' as area, 'Escrita sem restricao de cargo: ' || tablename as item, operacoes as resultado
  from escrita_ampla
union all select 2, 'SEGURANCA', 'Leitura por toda a empresa: ' || tablename, 'sim' from leitura_ampla
union all select 3, 'VOLUME', 'leads', count(*)::text from public.leads
union all select 3, 'VOLUME', 'central_leads ativos', count(*)::text from public.central_leads where encerrado_em is null and excluido_em is null
union all select 3, 'VOLUME', 'vendas', count(*)::text from public.vendas
union all select 3, 'VOLUME', 'clientes', count(*)::text from public.clientes
union all select 3, 'VOLUME', 'audit_log', count(*)::text from public.audit_log
union all select 4, 'INTEGRIDADE', 'leads com consultor inexistente', count(*)::text
  from public.leads l where l.vendedor_id is not null
   and not exists (select 1 from public.vendedores v where v.id = l.vendedor_id)
union all select 4, 'INTEGRIDADE', 'central com consultor inexistente', count(*)::text
  from public.central_leads c where c.vendedor_id is not null
   and not exists (select 1 from public.vendedores v where v.id = c.vendedor_id)
union all select 4, 'INTEGRIDADE', 'analises com consultor inexistente', count(*)::text
  from public.analises a where a.vendedor_id is not null
   and not exists (select 1 from public.vendedores v where v.id = a.vendedor_id)
union all select 4, 'INTEGRIDADE', 'contatos abertos com consultor inativo', count(*)::text
  from public.leads l join public.vendedores v on v.id = l.vendedor_id
 where not coalesce(v.ativo, true) and l.status not in ('fechamento', 'perdido')
union all select 4, 'INTEGRIDADE', 'central ativa com consultor inativo', count(*)::text
  from public.central_leads c join public.vendedores v on v.id = c.vendedor_id
 where not coalesce(v.ativo, true) and c.encerrado_em is null and c.excluido_em is null
union all select 5, 'TELEFONES', 'sem telefone', count(*)::text from tel where d = ''
union all select 5, 'TELEFONES', 'sem DDD (8 ou 9 digitos)', count(*)::text from tel where length(d) in (8, 9)
union all select 5, 'TELEFONES', 'com DDD 55 (link antigo errado)', count(*)::text from tel where length(d) in (10, 11) and left(d, 2) = '55'
union all select 5, 'TELEFONES', 'com zero na frente', count(*)::text from tel where left(d, 1) = '0'
union all select 5, 'TELEFONES', 'fora do padrao', count(*)::text from tel
 where d <> '' and length(d) not in (8, 9, 10, 11) and not (length(d) in (12, 13) and left(d, 2) = '55')
union all select 5, 'TELEFONES', 'mesmo telefone ativo na Central', count(*)::text from dup
union all select 5, 'TELEFONES', 'mesmo telefone com consultores diferentes', count(*)::text from dup where donos > 1
union all select 6, 'INDICES', 'leads sem indice por consultor',
  case when exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'leads' and indexdef ilike '%(vendedor_id%' or (schemaname = 'public' and tablename = 'leads' and indexdef ilike '%, vendedor_id%')) then 'ok' else 'FALTA' end
union all select 6, 'INDICES', 'metas sem indice por consultor',
  case when exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'metas' and indexdef ilike '%vendedor_id%') then 'ok' else 'FALTA' end
union all select 7, 'TEMPO REAL', 'tabelas publicadas', count(*)::text
  from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
union all select 7, 'TEMPO REAL', 'faltando: ' || t, 'FALTA'
  from unnest(array['leads','central_leads','vendas','metas','vendedores','clientes','notificacoes','temas','mensagens_prontas']) t
 where not exists (select 1 from pg_publication_tables p
                    where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = t)
order by 1, 3;
