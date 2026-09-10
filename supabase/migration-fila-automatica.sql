-- ============================================================================
-- LB CRM — FILA DE DISTRIBUIÇÃO AUTOMÁTICA (Central de Leads)
--
-- O admin escolhe QUEM participa. Lead novo que chega pelo webhook é entregue
-- ao próximo da fila, em rodízio, sem ninguém precisar estar na tela.
--
-- O QUE ESTA MIGRATION **NÃO** FAZ
--
-- Não encosta na distribuição manual, na anti-duplicação por telefone, na
-- ingestão do WhatsApp, no Pipeline, nas permissões nem no histórico de
-- mensagens. Nenhuma tabela existente é alterada — só entram duas tabelas
-- novas e uma função.
--
-- POR QUE A POSIÇÃO MORA NO BANCO
--
-- Guardar "de quem é a vez" no navegador quebraria na primeira atualização de
-- página — e o lead chega pelo webhook, quando não há navegador nenhum aberto.
-- A posição é uma linha em `central_fila_config`, e é ela que dá continuidade
-- depois de recarregar, fechar o navegador ou reiniciar o sistema.
--
-- POR QUE A ENTREGA É UMA FUNÇÃO, E NÃO CÓDIGO NO APP
--
-- Dois leads podem chegar no mesmo segundo. Se cada um lesse "a vez é do
-- William" antes do outro gravar, os dois iriam para o William e a fila
-- pularia o Júlio. A função tranca a linha da configuração (`for update`)
-- antes de escolher: o segundo lead espera o primeiro terminar e recebe o
-- nome seguinte. É a mesma ideia do `for update skip locked` já usado na
-- distribuição em massa do Pipeline.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) A CONFIGURAÇÃO — uma linha por empresa
--
-- `ultima_ordem` é a memória da fila: a posição de quem recebeu por último.
-- Guardamos a POSIÇÃO, não a pessoa, porque tirar alguém da fila não pode
-- fazer o rodízio recomeçar do zero.
-- ----------------------------------------------------------------------------
create table if not exists public.central_fila_config (
  org_id             uuid primary key,
  ativa              boolean not null default false,
  ultima_ordem       int,
  ultimo_vendedor_id uuid,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid
);

comment on table public.central_fila_config is
  'Fila de distribuição automática da Central de Leads: liga/desliga e guarda de quem é a vez.';
comment on column public.central_fila_config.ultima_ordem is
  'Posição do último que recebeu. É a memória do rodízio entre execuções.';

-- ----------------------------------------------------------------------------
-- 2) QUEM PARTICIPA
--
-- Estar ativo no CRM NÃO coloca ninguém aqui: participar da fila é decisão do
-- admin, e é o que deixa ele segurar novato fora do rodízio.
--
-- `ordem` é fixa por pessoa. Quem sai e volta reentra no fim, e quem ficou
-- mantém o próprio lugar — a fila se adapta sem perder o ponto onde estava.
-- ----------------------------------------------------------------------------
create table if not exists public.central_fila_membros (
  org_id      uuid not null,
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  ordem       int  not null,
  criado_em   timestamptz not null default now(),
  primary key (org_id, vendedor_id)
);

create index if not exists central_fila_membros_ordem_idx
  on public.central_fila_membros (org_id, ordem);

-- Só o backend escreve (rota de admin com service role); leitura idem.
-- RLS ligada sem policy = fechada para o navegador, que é o padrão do projeto
-- para configuração administrativa.
alter table public.central_fila_config  enable row level security;
alter table public.central_fila_membros enable row level security;

-- ----------------------------------------------------------------------------
-- 2b) O QUE A FILA ENTREGOU
--
-- Tabela própria, e não um texto dentro do histórico, porque o painel precisa
-- CONTAR: "William 20, Júlio 20, Gabriel 20". Contar a partir de frase gravada
-- obrigaria a interpretar texto — e bastaria alguém trocar uma palavra para a
-- conta parar de fechar.
--
-- O histórico do lead continua recebendo o evento legível, como sempre. Esta
-- tabela é o registro estruturado da mesma entrega, para o admin conferir quem
-- recebeu o quê, em qual posição e quando.
-- ----------------------------------------------------------------------------
create table if not exists public.central_fila_entregas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  central_lead_id uuid not null references public.central_leads(id) on delete cascade,
  vendedor_id     uuid not null,
  ordem           int  not null,
  telefone        text,
  criado_em       timestamptz not null default now()
);

create index if not exists central_fila_entregas_org_idx
  on public.central_fila_entregas (org_id, criado_em desc);
create index if not exists central_fila_entregas_vend_idx
  on public.central_fila_entregas (org_id, vendedor_id);

alter table public.central_fila_entregas enable row level security;

-- ----------------------------------------------------------------------------
-- 3) DE QUEM É A VEZ
--
-- Fica numa função própria porque DUAS coisas precisam da resposta: a entrega
-- (aqui embaixo) e a tela do admin, que mostra "PRÓXIMO DA FILA". Se cada uma
-- tivesse a própria conta, um dia a tela diria um nome e o sistema entregaria
-- a outro — e ninguém saberia qual dos dois está certo.
--
-- Elegível = está na fila E tem cadastro de vendedor ativo E tem login ativo.
-- É a MESMA regra da distribuição manual: entregar para quem não tem login
-- ativo é perder o lead, porque ninguém consegue enxergá-lo.
--
-- Primeiro tenta quem vem DEPOIS da última posição usada; não havendo, volta
-- ao começo. É isso que faz o rodízio dar a volta sem recomeçar a cada lote.
-- ----------------------------------------------------------------------------
create or replace function public.proximo_da_fila(p_org uuid, p_depois_de int default null)
returns table (vendedor_id uuid, ordem int)
language sql
stable
security definer
set search_path = public
as $$
  with elegiveis as (
    select m.vendedor_id, m.ordem
      from public.central_fila_membros m
      join public.vendedores v on v.id = m.vendedor_id and v.ativo
     where m.org_id = p_org
       and exists (select 1 from public.profiles p
                    where p.vendedor_ref = m.vendedor_id
                      and p.ativo is not false)
  )
  select t.vendedor_id, t.ordem
    from (
      select e.vendedor_id, e.ordem, 0 as prioridade
        from elegiveis e
       where e.ordem > coalesce(p_depois_de, -1)
      union all
      select e.vendedor_id, e.ordem, 1 as prioridade
        from elegiveis e
    ) t
   order by t.prioridade, t.ordem
   limit 1;
$$;

comment on function public.proximo_da_fila(uuid, int) is
  'De quem é a vez na fila automática. Usada pela entrega E pela tela do admin, para as duas nunca discordarem.';

-- ----------------------------------------------------------------------------
-- 4) A ENTREGA
--
-- Devolve o vendedor que recebeu, ou NULL quando não entregou — e não entregar
-- é um resultado normal: fila desligada, fila vazia, ou lead que já tem dono.
--
-- `security definer` porque quem chama é o webhook, que não tem sessão de
-- usuário nenhuma.
-- ----------------------------------------------------------------------------
create or replace function public.distribuir_automatico(p_lead_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_cfg   record;
  v_prox  record;
  v_nome  text;
  v_prof  uuid;
begin
  select org_id into v_org from public.central_leads where id = p_lead_id;
  if v_org is null then return null; end if;

  -- A TRAVA. Daqui até o fim, mais ninguém mexe na fila desta empresa.
  select * into v_cfg
    from public.central_fila_config
   where org_id = v_org
     for update;

  if not found or not v_cfg.ativa then return null; end if;

  select * into v_prox from public.proximo_da_fila(v_org, v_cfg.ultima_ordem);
  if not found then return null; end if;  -- ninguém elegível na fila

  /*
   * Só lead SEM DONO. Mensagem nova de cliente que já tem consultor não
   * redistribui nada — e a condição vai DENTRO do update, não numa conferência
   * antes, para que uma distribuição manual feita no mesmo instante não seja
   * sobrescrita.
   */
  update public.central_leads
     set vendedor_id    = v_prox.vendedor_id,
         distribuido_em = now(),
         status         = 'aguardando',
         atualizado_em  = now()
   where id = p_lead_id
     and vendedor_id is null
     and encerrado_em is null
     and excluido_em is null;

  -- Não gravou: alguém pegou o lead primeiro. A fila NÃO avança — a vez
  -- continua sendo de quem ainda não recebeu.
  if not found then return null; end if;

  update public.central_fila_config
     set ultima_ordem       = v_prox.ordem,
         ultimo_vendedor_id = v_prox.vendedor_id,
         atualizado_em      = now()
   where org_id = v_org;

  select nome into v_nome from public.vendedores where id = v_prox.vendedor_id;

  -- HISTÓRICO. Quem recebeu, em que posição da fila e quando — e marcado como
  -- AUTOMÁTICA, para não se confundir com o que o admin enviou à mão.
  insert into public.central_leads_eventos
    (org_id, central_lead_id, tipo, campo, valor_novo, detalhe, autor_nome)
  values
    (v_org, p_lead_id, 'distribuido', 'fila_automatica', v_prox.ordem::text,
     format('Distribuição AUTOMÁTICA → %s (posição %s da fila)',
            coalesce(v_nome, 'consultor'), v_prox.ordem),
     'Fila automática');

  -- O registro estruturado da entrega — é ele que o painel do admin conta.
  insert into public.central_fila_entregas (org_id, central_lead_id, vendedor_id, ordem, telefone)
  select v_org, p_lead_id, v_prox.vendedor_id, v_prox.ordem, c.telefone
    from public.central_leads c where c.id = p_lead_id;

  -- Aviso para o consultor, igual ao da distribuição manual.
  select p.id into v_prof
    from public.profiles p
   where p.vendedor_ref = v_prox.vendedor_id
   limit 1;

  if v_prof is not null then
    insert into public.notificacoes (org_id, user_id, tipo, titulo, mensagem, link, entidade, entidade_id)
    values (v_org, v_prof, 'central_distribuicao', 'Novo lead para você',
            'Um lead novo chegou e foi direcionado para você pela fila automática.',
            '/central', 'central_lead', p_lead_id);
  end if;

  return v_prox.vendedor_id;
end $$;

comment on function public.distribuir_automatico(uuid) is
  'Entrega um lead novo ao próximo da fila. Tranca a configuração para dois leads simultâneos não caírem no mesmo consultor.';

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'tabelas da fila criadas (tem que ser 3)' as item, count(*)::text as valor
  from pg_tables
 where schemaname = 'public'
   and tablename in ('central_fila_config', 'central_fila_membros', 'central_fila_entregas')
union all
select 'funções criadas (tem que ser 2)', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('distribuir_automatico', 'proximo_da_fila')
union all
select 'empresas com fila configurada', count(*)::text
  from public.central_fila_config
union all
select 'consultores na fila', count(*)::text
  from public.central_fila_membros
union all
select 'fila ligada?', coalesce((select case when ativa then 'sim' else 'não' end
                                   from public.central_fila_config limit 1), 'ainda não configurada');
