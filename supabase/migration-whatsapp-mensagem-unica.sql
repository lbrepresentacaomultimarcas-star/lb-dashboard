-- ============================================================================
-- LB CRM — WHATSAPP: UMA MENSAGEM = UM REGISTRO (nunca dois)
--
-- Regra do negócio: 1 CLIENTE = 1 LEAD ATIVO. Mensagem nova do mesmo telefone
-- NÃO cria card novo — entra no histórico do lead que já existe.
--
-- A deduplicação por telefone já funciona no código (`telefone_chave`). O que
-- faltava era o outro lado: a Meta REENVIA o mesmo webhook quando demora a
-- receber o 200, e o código se protegia com um SELECT antes do INSERT.
--
-- SELECT-e-depois-INSERT não é atômico. Duas entregas simultâneas passam as
-- duas pelo SELECT (nenhuma vê a outra, que ainda não gravou) e gravam as duas.
-- É raro, mas é exatamente o caso que "seguro contra duplo processamento"
-- precisa cobrir — e quando acontece, o consultor vê a mesma mensagem duas
-- vezes na conversa do cliente.
--
-- Quem resolve isso é o BANCO, não o código: com índice único, a segunda
-- gravação é recusada pelo Postgres e o código só precisa ignorar o erro.
--
-- ESCOPO ESTREITO DE PROPÓSITO
--
-- `campo`/`valor_novo` são colunas de auditoria genéricas, usadas por todo o
-- CRM. Um índice único sobre elas quebraria o resto: `campo='produto'` com
-- `valor_novo='Carro'` se repete legitimamente em centenas de leads.
--
-- Por isso o índice é PARCIAL — vale só onde `campo` é o id da mensagem da
-- Meta ('wamid' para WhatsApp, 'leadgen' para formulário). Nenhum outro
-- histórico do sistema é afetado.
--
-- Não altera tabela, não altera coluna, não altera RLS. Rodar duas vezes não
-- faz mal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) O QUE JÁ ESTÁ DUPLICADO HOJE
--
-- Antes de qualquer limpeza, o número na tela: quantos registros são a MESMA
-- mensagem da Meta gravada mais de uma vez.
-- ----------------------------------------------------------------------------
select
  'mensagens da Meta gravadas em duplicidade' as item,
  coalesce(sum(qtd - 1), 0)::text            as registros_sobrando
from (
  select count(*) as qtd
    from public.central_leads_eventos
   where campo in ('wamid', 'leadgen')
     and valor_novo is not null
   group by org_id, campo, valor_novo
  having count(*) > 1
) d;

-- ----------------------------------------------------------------------------
-- 2) FICA A PRIMEIRA DE CADA
--
-- Só remove CÓPIA da mesma mensagem — o registro original de cada uma
-- permanece, com a data original. Nenhuma mensagem do cliente é perdida:
-- o que sai são gravações repetidas do mesmo evento, que existiam por causa da
-- reentrega da Meta.
--
-- É pré-requisito do índice: com duplicata na tabela, o índice único não nasce.
-- ----------------------------------------------------------------------------
with repetidas as (
  select id,
         row_number() over (
           partition by org_id, campo, valor_novo
           order by criado_em, id
         ) as n
    from public.central_leads_eventos
   where campo in ('wamid', 'leadgen')
     and valor_novo is not null
)
delete from public.central_leads_eventos e
 using repetidas r
 where e.id = r.id
   and r.n > 1;

-- ----------------------------------------------------------------------------
-- 3) O TRINCO
--
-- A partir daqui, a mesma mensagem não entra duas vezes nem com duas entregas
-- simultâneas. O código trata a recusa (23505) como "já processei" e segue.
-- ----------------------------------------------------------------------------
create unique index if not exists central_leads_eventos_mensagem_unica
  on public.central_leads_eventos (org_id, campo, valor_novo)
  where campo in ('wamid', 'leadgen') and valor_novo is not null;

-- ============================================================================
-- VERIFICAÇÃO — o estado depois
-- ============================================================================
select 'índice de mensagem única criado (tem que ser 1)' as item, count(*)::text as valor
  from pg_indexes
 where schemaname = 'public'
   and indexname = 'central_leads_eventos_mensagem_unica'
union all
select 'mensagens da Meta ainda duplicadas (tem que ser 0)', count(*)::text
  from (
    select 1
      from public.central_leads_eventos
     where campo in ('wamid', 'leadgen') and valor_novo is not null
     group by org_id, campo, valor_novo
    having count(*) > 1
  ) x
union all
select 'leads ativos do WhatsApp', count(*)::text
  from public.central_leads
 where origem like '%WhatsApp%'
   and encerrado_em is null
   and excluido_em is null
union all
select 'mensagens de WhatsApp no histórico', count(*)::text
  from public.central_leads_eventos
 where campo = 'wamid';
