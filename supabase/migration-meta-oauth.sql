-- ============================================================================
-- LB CRM — Integração nativa com a Meta (Facebook Lead Ads)
-- FASE 1: fundação — onde a conexão, as Páginas e os formulários ficam guardados.
--
-- 100% ADITIVA e IDEMPOTENTE. Rode no SQL Editor do Supabase (projeto
-- qjxmzttfdgivlsfxfwsc). NÃO altera nenhuma tabela existente — a Central de
-- Leads, o Pipeline e o webhook atual continuam funcionando sem mudança.
--
-- SEGURANÇA — leia antes de mexer:
--   · os tokens da Meta ficam CIFRADOS (AES-256-GCM) na coluna `token_cifrado`;
--     o banco nunca vê o valor original e a chave mora só no ambiente do servidor
--   · estas 3 tabelas têm RLS LIGADO e NENHUMA policy, de propósito: isso faz o
--     navegador (anon/authenticated) não conseguir ler NADA delas. Só o backend,
--     que usa a service role, enxerga — e ele expõe apenas o que é seguro
--     mostrar (nome da Página, nome do formulário, status). Não crie policy aqui.
-- ============================================================================

-- 1) A autorização que o administrador deu à Meta -----------------------------
--    Uma por empresa: reconectar SUBSTITUI a anterior (upsert por org_id).
create table if not exists public.meta_conexoes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default public.current_org_id(),
  meta_user_id    text,                    -- id do usuário na Meta
  meta_user_nome  text,                    -- nome exibido (só para a tela)
  business_id     text,                    -- Business/portfólio identificado
  business_nome   text,
  token_cifrado   text not null,           -- user access token de longa duração (CIFRADO)
  escopos         text[],                  -- permissões concedidas
  expira_em       timestamptz,             -- validade do token (≈60 dias)
  status          text not null default 'ativa'
                  check (status in ('ativa','expirada','revogada')),
  ultimo_erro     text,                    -- último problema visto ao usar o token
  conectado_por   text,                    -- e-mail do admin que autorizou
  conectado_em    timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (org_id)
);

-- 2) As Páginas do Facebook que a conexão enxerga ------------------------------
--    `selecionada` = a Página escolhida para receber leads.
--    `webhook_ativo` = o LB CRM já se inscreveu no leadgen dessa Página.
create table if not exists public.meta_paginas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.current_org_id(),
  conexao_id     uuid references public.meta_conexoes(id) on delete cascade,
  page_id        text not null,
  nome           text not null,
  categoria      text,
  foto_url       text,
  token_cifrado  text,                     -- page access token (CIFRADO)
  selecionada    boolean not null default false,
  webhook_ativo  boolean not null default false,
  webhook_em     timestamptz,
  ultimo_erro    text,
  atualizado_em  timestamptz not null default now(),
  unique (org_id, page_id)
);

create index if not exists meta_paginas_org_idx on public.meta_paginas (org_id, selecionada);
create index if not exists meta_paginas_page_idx on public.meta_paginas (page_id);

-- 3) Os formulários instantâneos de cada Página --------------------------------
--    `ativo` = esse formulário entrega leads para a Central. Desmarcar NÃO apaga
--    nada: só faz o webhook ignorar os próximos leads daquele formulário.
create table if not exists public.meta_formularios (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default public.current_org_id(),
  page_id          text not null,
  form_id          text not null,
  nome             text not null,
  status           text,                   -- ACTIVE / ARCHIVED / DRAFT (vem da Meta)
  ativo            boolean not null default true,
  leads_recebidos  integer not null default 0,
  ultimo_lead_em   timestamptz,
  atualizado_em    timestamptz not null default now(),
  unique (org_id, form_id)
);

create index if not exists meta_formularios_org_idx on public.meta_formularios (org_id, page_id);

-- 4) RLS: fechado para o navegador, aberto só para o backend -------------------
--    Sem policy = ninguém com chave pública lê. A service role ignora RLS.
alter table public.meta_conexoes    enable row level security;
alter table public.meta_paginas     enable row level security;
alter table public.meta_formularios enable row level security;

-- Remove qualquer policy que exista de uma execução anterior (mantém o fechamento)
do $rls$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('meta_conexoes','meta_paginas','meta_formularios')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $rls$;

-- 5) Carimbo de atualização ----------------------------------------------------
create or replace function public.meta_toca_atualizado_em()
returns trigger
language plpgsql
as $fn$
begin
  new.atualizado_em := now();
  return new;
end;
$fn$;

drop trigger if exists trg_meta_conexoes_touch on public.meta_conexoes;
create trigger trg_meta_conexoes_touch
  before update on public.meta_conexoes
  for each row execute function public.meta_toca_atualizado_em();

drop trigger if exists trg_meta_paginas_touch on public.meta_paginas;
create trigger trg_meta_paginas_touch
  before update on public.meta_paginas
  for each row execute function public.meta_toca_atualizado_em();

drop trigger if exists trg_meta_formularios_touch on public.meta_formularios;
create trigger trg_meta_formularios_touch
  before update on public.meta_formularios
  for each row execute function public.meta_toca_atualizado_em();

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'tabelas criadas' as item, count(*)::text as ok
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('meta_conexoes','meta_paginas','meta_formularios')
union all
select 'policies (tem que ser 0)', count(*)::text
  from pg_policies
 where schemaname = 'public'
   and tablename in ('meta_conexoes','meta_paginas','meta_formularios')
union all
select 'RLS ligado nas 3', count(*)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('meta_conexoes','meta_paginas','meta_formularios')
   and c.relrowsecurity;
