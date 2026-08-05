-- ============================================================
-- LB CRM — MÓDULO CENTRAL DE LEADS · Etapa 1 (Banco de Dados)
-- ============================================================
-- Módulo NOVO, dentro do MESMO CRM/banco. NÃO altera o Pipeline (tabela `leads`)
-- nem nada existente. Tabelas isoladas + RLS multiempresa + métricas por RPC.
--
-- ARQUITETURA (resumo p/ futuras expansões — Cloud API/discador/IA/distribuição
-- automática): os leads crus vivem em `central_leads` (separados do Pipeline).
-- O admin distribui a consultores; o consultor trabalha e, ao ATENDER, o lead é
-- PROMOVIDO pro Pipeline (insert em `leads` status 'primeiro_contato' — feito na
-- camada de app, Etapa 2). Todo o ciclo vira MARCOS EM COLUNAS (não depende de
-- texto), e cada movimentação vira um EVENTO em `central_leads_eventos` (timeline
-- + auditoria campo a campo). `notificacoes` = base p/ avisos internos (sem push).
-- Isolamento por empresa via org_id + RLS; leitura por vendedor reusa
-- public.pode_ver_vendedor() (Fase 4). Métricas/rankings por RPC SECURITY DEFINER
-- (agrega no banco → o navegador nunca baixa milhares de linhas).
--
-- Idempotente. Rode no SQL Editor do Supabase.
-- ============================================================

-- ============================================================
-- TABELA 1 — central_leads (os leads crus + ciclo de vida)
-- ============================================================
create table if not exists public.central_leads (
  id uuid primary key default gen_random_uuid(),
  org_id  uuid not null default public.current_org_id(),   -- empresa (multiempresa)
  owner_id uuid default auth.uid(),                          -- quem cadastrou/importou

  -- dados do lead
  nome        text not null,
  telefone    text,
  produto     text,          -- produto de interesse
  origem      text,          -- ex.: Tráfego Pago, Instagram, Indicação…
  observacoes text,
  prioridade  text not null default 'normal'
              check (prioridade in ('urgente', 'alta', 'normal', 'baixa')),

  -- distribuição / consultor dono (nulo = ainda não distribuído)
  vendedor_id     uuid,      -- → vendedores.id (mesmo vínculo do Pipeline)
  distribuido_por uuid,      -- profiles.id do admin que distribuiu

  -- ciclo de vida (estado + marcos automáticos, cada um em sua coluna)
  status text not null default 'novo'
         check (status in ('novo','aguardando','em_atendimento',
                           'aguardando_resposta','nao_atendeu','convertido','perdido')),
  recebido_em          timestamptz not null default now(),  -- entrou
  distribuido_em       timestamptz,                          -- distribuído
  ligacao_iniciada_em  timestamptz,                          -- clicou LIGAR
  atendido_em          timestamptz,                          -- marcou ATENDEU
  mensagem_enviada_em  timestamptz,                          -- "mensagem enviada"
  convertido_em        timestamptz,                          -- virou lead no Pipeline
  encerrado_em         timestamptz,                          -- convertido ou perdido
  motivo_perda         text,
  lead_id              uuid,                                 -- link → leads.id (quando convertido)

  -- PREPARO FUTURO — Cloud API Oficial da Meta (nulos por ora, sem integração)
  external_id text,          -- id da mensagem/contato na Meta (dedupe)
  wa_contato  jsonb,         -- payload bruto do WhatsApp

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- atualizado_em automático
create or replace function public.central_leads_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end$$;
drop trigger if exists trg_central_leads_touch on public.central_leads;
create trigger trg_central_leads_touch
  before update on public.central_leads
  for each row execute function public.central_leads_touch();

-- ============================================================
-- TABELA 2 — central_leads_eventos (timeline + auditoria campo a campo)
-- ============================================================
create table if not exists public.central_leads_eventos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  central_lead_id uuid not null references public.central_leads(id) on delete cascade,
  tipo   text not null,      -- criado|distribuido|ligar|atendeu|nao_atendeu|mensagem|perdido|convertido|prioridade|observacao|editado
  campo  text,               -- (auditoria) campo alterado
  valor_anterior text,       -- (auditoria) valor antes
  valor_novo     text,       -- (auditoria) valor depois
  detalhe    text,
  autor_id   uuid default auth.uid(),
  autor_nome text,           -- snapshot do nome (histórico legível)
  criado_em  timestamptz not null default now()
);

-- ============================================================
-- TABELA 3 — notificacoes (base p/ avisos internos — SEM push agora)
-- ============================================================
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  org_id  uuid not null default public.current_org_id(),
  user_id uuid not null,     -- destinatário (auth.users.id / profiles.id)
  tipo    text not null,     -- central_distribuicao | central_lembrete | ...
  titulo  text not null,
  mensagem text,
  link     text,             -- rota p/ abrir (ex.: /central?lead=…)
  entidade text,
  entidade_id uuid,
  lida    boolean not null default false,
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);

-- ============================================================
-- ÍNDICES (suportam filtro, ordenação, paginação e escala)
-- ============================================================
create index if not exists idx_central_leads_org_vend_status
  on public.central_leads (org_id, vendedor_id, status);
create index if not exists idx_central_leads_org_recebido
  on public.central_leads (org_id, recebido_em desc);
create index if not exists idx_central_leads_org_prioridade
  on public.central_leads (org_id, prioridade);
create index if not exists idx_central_leads_org_status
  on public.central_leads (org_id, status);
create unique index if not exists uq_central_leads_external
  on public.central_leads (org_id, external_id) where external_id is not null;
create index if not exists idx_central_eventos_lead
  on public.central_leads_eventos (central_lead_id, criado_em);
create index if not exists idx_notificacoes_user
  on public.notificacoes (user_id, lida, criado_em desc);

-- ============================================================
-- RLS — isolamento por empresa + escopo por consultor
-- ============================================================
alter table public.central_leads         enable row level security;
alter table public.central_leads_eventos enable row level security;
alter table public.notificacoes          enable row level security;

-- central_leads: LEITURA escopada (admin/coord = empresa · supervisor/líder =
-- equipe · vendedor = só os seus) reusando pode_ver_vendedor(). Escrita por org
-- (distribuição é controlada no app + é admin; consultor só age no que enxerga).
drop policy if exists "central_leads scope read" on public.central_leads;
create policy "central_leads scope read" on public.central_leads for select
  using (org_id = public.current_org_id() and public.pode_ver_vendedor(vendedor_id));
drop policy if exists "central_leads org insert" on public.central_leads;
create policy "central_leads org insert" on public.central_leads for insert
  with check (org_id = public.current_org_id());
drop policy if exists "central_leads org update" on public.central_leads;
create policy "central_leads org update" on public.central_leads for update
  using (org_id = public.current_org_id());
drop policy if exists "central_leads org delete" on public.central_leads;
create policy "central_leads org delete" on public.central_leads for delete
  using (org_id = public.current_org_id());

-- eventos: leitura só de leads que o usuário enxerga; inserção por org
drop policy if exists "central_eventos read" on public.central_leads_eventos;
create policy "central_eventos read" on public.central_leads_eventos for select
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.central_leads cl
      where cl.id = central_lead_id and public.pode_ver_vendedor(cl.vendedor_id)
    )
  );
drop policy if exists "central_eventos insert" on public.central_leads_eventos;
create policy "central_eventos insert" on public.central_leads_eventos for insert
  with check (org_id = public.current_org_id());

-- notificacoes: cada um lê/atualiza as suas; inserção por org
drop policy if exists "notificacoes self read" on public.notificacoes;
create policy "notificacoes self read" on public.notificacoes for select
  using (user_id = auth.uid());
drop policy if exists "notificacoes self update" on public.notificacoes;
create policy "notificacoes self update" on public.notificacoes for update
  using (user_id = auth.uid());
drop policy if exists "notificacoes org insert" on public.notificacoes;
create policy "notificacoes org insert" on public.notificacoes for insert
  with check (org_id = public.current_org_id());

-- ============================================================
-- REALTIME (push de mudanças p/ o app, escopado pela RLS)
-- ============================================================
do $$
begin
  begin alter publication supabase_realtime add table public.central_leads;         exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.central_leads_eventos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notificacoes;          exception when duplicate_object then null; end;
end$$;

-- ============================================================
-- RPC 1 — central_dashboard(from, to): métricas do gestor, por período.
-- SECURITY DEFINER: agrega no banco e respeita o escopo do chamador
-- (admin=empresa, gestor=equipe, vendedor=os seus). Coorte = leads RECEBIDOS
-- no período.
-- ============================================================
create or replace function public.central_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  with base as (
    select * from public.central_leads
    where org_id = public.current_org_id()
      and public.pode_ver_vendedor(vendedor_id)
      and recebido_em >= p_from and recebido_em < p_to
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

-- ============================================================
-- RPC 2 — central_ranking(from, to): ranking de PRODUTIVIDADE por consultor
-- (separado do ranking de VENDAS, que fica intacto).
-- ============================================================
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
    'taxa_atendimento',  case when distribuidos > 0 then round(100.0 * atendidos   / distribuidos, 1) else 0 end,
    'taxa_conversao',    case when distribuidos > 0 then round(100.0 * convertidos / distribuidos, 1) else 0 end,
    'taxa_qualificacao', case when atendidos   > 0 then round(100.0 * convertidos / atendidos,   1) else 0 end,
    'tempo_resposta_seg', tempo_resposta_seg
  ) order by convertidos desc, atendidos desc), '[]'::jsonb) into res from por;
  return coalesce(res, '[]'::jsonb);
end$$;
revoke all on function public.central_ranking(timestamptz, timestamptz) from public;
grant execute on function public.central_ranking(timestamptz, timestamptz) to authenticated;

-- ============================================================
-- FIM DA ETAPA 1. Depois de rodar, me avise: eu verifico no banco
-- (tabelas, RLS, isolamento por empresa e as RPCs) antes da Etapa 2.
-- ============================================================
