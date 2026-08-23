-- ============================================================================
-- LB CRM — CENTRAL DE TRÁFEGO (Fase 1 + 2: coleta e histórico)
--
-- 100% ADITIVA e IDEMPOTENTE. Rode no SQL Editor do Supabase.
--
-- NÃO altera nenhuma tabela existente, exceto acrescentar a coluna `cidade`
-- em central_leads. NÃO toca na integração de leads, no webhook, no Pipeline,
-- na distribuição nem nos formulários.
--
-- SEGURANÇA (item 15 do pedido): as quatro tabelas novas ficam com RLS ligada
-- e SEM policy. Sem policy, ninguém com chave pública lê — nem consultor, nem
-- líder. Só a service role (backend, atrás de requireAdmin) enxerga. Isso é o
-- mesmo padrão de meta_conexoes/meta_paginas, e é o que garante que consultor
-- nunca veja investimento, orçamento ou custo de campanha.
-- ============================================================================

-- 1) CIDADE DO LEAD ----------------------------------------------------------
--    A Meta NÃO entrega cidade no detalhamento do Brasil (o recorte geográfico
--    dela para no estado). Então a cidade só existe se o formulário perguntar.
--    Guardamos a resposta LITERAL, como todas as outras da sondagem.
alter table public.central_leads
  add column if not exists cidade text;

comment on column public.central_leads.cidade is
  'Cidade informada pelo cliente no formulário. Resposta original, nunca normalizada pelo sistema.';

create index if not exists central_leads_cidade_idx
  on public.central_leads (org_id, cidade)
  where cidade is not null;

-- 2) HISTÓRICO DE MÍDIA ------------------------------------------------------
--    Uma linha por DIA por objeto. É o que permite comparar períodos depois.
--    A chave única é (org, conta, nível, objeto, data): recoletar o mesmo dia
--    ATUALIZA a linha em vez de duplicar — a Meta reprocessa números por até
--    72h, então o mesmo dia pode ser coletado várias vezes e sempre converge.
--    Dias antigos nunca são apagados.
create table if not exists public.trafego_snapshots (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.current_org_id(),
  conta_id       text not null,                    -- act_XXXXXXXX
  nivel          text not null check (nivel in ('conta', 'campanha', 'conjunto', 'anuncio')),
  objeto_id      text not null,
  objeto_nome    text,
  campanha_id    text,
  campanha_nome  text,
  conjunto_id    text,
  conjunto_nome  text,
  data           date not null,
  -- números de mídia
  gasto          numeric(12,2),
  impressoes     bigint,
  alcance        bigint,
  cliques        bigint,
  cliques_link   bigint,
  ctr            numeric(9,4),                     -- % de quem viu e clicou
  cpc            numeric(12,4),
  cpm            numeric(12,4),
  frequencia     numeric(9,4),                     -- quantas vezes a mesma pessoa viu
  leads          integer,
  cpl            numeric(12,4),
  -- resposta crua da Meta: nada se perde, mesmo o que ainda não sabemos usar
  bruto          jsonb,
  coletado_em    timestamptz not null default now(),
  unique (org_id, conta_id, nivel, objeto_id, data)
);

create index if not exists trafego_snapshots_busca_idx
  on public.trafego_snapshots (org_id, nivel, data desc);
create index if not exists trafego_snapshots_campanha_idx
  on public.trafego_snapshots (org_id, campanha_id, data desc)
  where campanha_id is not null;

-- 3) ANÁLISES ----------------------------------------------------------------
--    Cada clique em "Analisar agora" vira uma linha. Guarda o resumo em
--    linguagem simples E os dados que sustentaram a conclusão — sem isso não
--    dá para auditar depois por que a Central recomendou o que recomendou.
create table if not exists public.trafego_analises (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default public.current_org_id(),
  tipo         text not null,                      -- trafego | campanhas | anuncios | publicos | cidades | leads | conversoes | completa
  periodo_de   date not null,
  periodo_ate  date not null,
  titulo       text,
  resumo       text,                               -- o texto que o admin lê
  dados        jsonb,                              -- números usados, para conferência
  origem       text not null default 'claude',     -- claude | automatica
  pedido_por   uuid,
  criado_em    timestamptz not null default now()
);

create index if not exists trafego_analises_org_idx
  on public.trafego_analises (org_id, criado_em desc);

-- 4) RECOMENDAÇÕES -----------------------------------------------------------
--    O formato do item 9: status + o que aconteceu + por quê + o que fazer.
--    `meta_recomendou` guarda o que a PRÓPRIA Meta sugeriu, para a tela mostrar
--    lado a lado — a Central nunca aceita a sugestão da Meta sem analisar.
create table if not exists public.trafego_recomendacoes (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default public.current_org_id(),
  analise_id       uuid references public.trafego_analises(id) on delete cascade,
  status           text not null check (status in
                     ('manter', 'observar', 'testar', 'reduzir', 'pausar', 'escalar', 'aguardar')),
  prioridade       integer not null default 5,     -- 1 = mostrar primeiro
  escopo           text not null check (escopo in
                     ('conta', 'campanha', 'conjunto', 'anuncio', 'cidade', 'produto', 'formulario', 'operacao')),
  objeto_id        text,
  objeto_nome      text,
  o_que_aconteceu  text not null,
  por_que          text not null,
  o_que_fazer      text not null,
  meta_recomendou  text,
  confianca        text check (confianca in ('alta', 'media', 'baixa', 'insuficiente')),
  amostra          jsonb,                          -- dias, leads, gasto — o que sustenta a confiança
  acao             jsonb,                          -- ação executável, quando existir
  executavel       boolean not null default false,
  situacao         text not null default 'pendente' check (situacao in
                     ('pendente', 'autorizada', 'ignorada', 'executada', 'manual')),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create index if not exists trafego_recomendacoes_fila_idx
  on public.trafego_recomendacoes (org_id, situacao, prioridade, criado_em desc);

-- 5) DECISÕES ----------------------------------------------------------------
--    O item 11. Registra o que foi autorizado e o valor antes/depois, para
--    responder daqui a alguns meses: "as mudanças que eu autorizei melhoraram
--    o resultado?". `resultado` é preenchido depois, medindo o efeito.
create table if not exists public.trafego_decisoes (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null default public.current_org_id(),
  recomendacao_id     uuid references public.trafego_recomendacoes(id) on delete set null,
  acao                text not null,               -- ex.: "aumentar_orcamento"
  descricao           text not null,               -- em português, para o histórico
  escopo              text not null,
  objeto_id           text,
  objeto_nome         text,
  valor_anterior      text,
  valor_novo          text,
  motivo              text not null,
  autorizado_por      uuid,
  autorizado_por_nome text,
  autorizado_em       timestamptz not null default now(),
  executado_em        timestamptz,
  executado_como      text check (executado_como in ('api', 'chrome', 'manual')),
  execucao_erro       text,
  resultado           jsonb,                       -- medição do efeito, depois
  criado_em           timestamptz not null default now()
);

create index if not exists trafego_decisoes_org_idx
  on public.trafego_decisoes (org_id, autorizado_em desc);

-- 6) RLS: fechado para o navegador, aberto só para o backend ------------------
--    Sem policy = nenhuma chave pública lê. A service role ignora RLS.
--    É isto que cumpre "consultor não vê investimento nem orçamento".
alter table public.trafego_snapshots      enable row level security;
alter table public.trafego_analises       enable row level security;
alter table public.trafego_recomendacoes  enable row level security;
alter table public.trafego_decisoes       enable row level security;

do $rls$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('trafego_snapshots','trafego_analises','trafego_recomendacoes','trafego_decisoes')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $rls$;

-- 7) touch de atualizado_em nas recomendações --------------------------------
create or replace function public.trafego_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

drop trigger if exists trg_trafego_recomendacoes_touch on public.trafego_recomendacoes;
create trigger trg_trafego_recomendacoes_touch
  before update on public.trafego_recomendacoes
  for each row execute function public.trafego_touch();

-- ============================================================================
-- VERIFICAÇÃO — nada existente foi alterado
-- ============================================================================
select 'tabelas novas criadas' as item, count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('trafego_snapshots','trafego_analises','trafego_recomendacoes','trafego_decisoes')
union all
select 'coluna cidade em central_leads', count(*)::text
  from information_schema.columns
 where table_name = 'central_leads' and column_name = 'cidade'
union all
select 'RLS ligada nas 4 (sem policy = só backend)', count(*)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relrowsecurity
   and c.relname in ('trafego_snapshots','trafego_analises','trafego_recomendacoes','trafego_decisoes')
union all
select 'policies nessas tabelas (deve ser 0)', count(*)::text
  from pg_policies
 where schemaname = 'public'
   and tablename in ('trafego_snapshots','trafego_analises','trafego_recomendacoes','trafego_decisoes')
union all
select 'leads na Central (deve seguir igual)', count(*)::text from public.central_leads;
