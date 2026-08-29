-- ============================================================================
-- LB CRM — ANÁLISE E FICHAS (Fase 1: base)
--
-- 100% ADITIVA e IDEMPOTENTE. Rode no SQL Editor do Supabase.
-- NÃO toca em nenhuma tabela existente. NÃO tem relação com a Central de
-- Tráfego: são módulos diferentes dentro do mesmo CRM.
--
-- O que entra aqui:
--   analises            — a análise interna + os dados que viram a ficha
--   analise_documentos  — metadados dos anexos (o arquivo vive no Storage privado)
--   analise_eventos     — histórico; nunca apaga nada
--   ficha_modelos       — o LAYOUT da ficha como DADO, não como código
--
-- A separação do item 11 do pedido está em `ficha_modelos`: trocar o desenho
-- da ficha depois é trocar uma linha de jsonb, não refazer o módulo.
-- ============================================================================

-- 1) ANÁLISES ---------------------------------------------------------------
create table if not exists public.analises (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null default public.current_org_id(),

  -- vínculo com quem já existe: a análise NUNCA cria cliente novo
  lead_id            uuid references public.leads(id) on delete set null,
  central_lead_id    uuid references public.central_leads(id) on delete set null,
  vendedor_id        uuid,                       -- consultor responsável
  criado_por         uuid,
  criado_por_nome    text,

  -- cliente
  nome               text not null,
  cpf                text,
  nascimento         date,
  email              text,
  telefone           text,
  telefone_chave     text,                       -- mesma regra da anti-duplicidade
  cidade             text,

  -- objetivo (texto livre de propósito: produto novo não pede migration)
  objetivo           text,

  -- operação
  credito            numeric(14,2),
  parcela            numeric(14,2),
  com_lance          boolean not null default false,
  lance_valor        numeric(14,2),
  lance_pct          numeric(9,4),               -- calculado; guardado para o histórico
  lance_embutido     numeric(14,2),
  observacoes        text,

  -- ANÁLISE INTERNA — nunca é aprovação da administradora
  status             text not null default 'em_analise'
                     check (status in ('em_analise', 'aprovado', 'nao_aprovado')),
  decisao_observacao text,
  decidido_por       uuid,
  decidido_por_nome  text,
  decidido_em        timestamptz,

  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

comment on table public.analises is
  'Análise INTERNA da LB. Não substitui a aprovação da administradora do consórcio.';

create index if not exists analises_org_idx on public.analises (org_id, criado_em desc);
create index if not exists analises_vendedor_idx on public.analises (org_id, vendedor_id);
create index if not exists analises_status_idx on public.analises (org_id, status);
create index if not exists analises_lead_idx on public.analises (lead_id) where lead_id is not null;
create index if not exists analises_telefone_idx
  on public.analises (org_id, telefone_chave) where telefone_chave <> '';

-- 2) DOCUMENTOS -------------------------------------------------------------
--    Só os METADADOS. O arquivo fica no bucket PRIVADO `analise-docs`, e é
--    servido por rota do servidor que confere permissão a cada acesso —
--    documento pessoal não pode ter link público.
create table if not exists public.analise_documentos (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default public.current_org_id(),
  analise_id        uuid not null references public.analises(id) on delete cascade,
  tipo              text not null,               -- identificacao | renda | residencia | outros
  rotulo            text,                        -- nome que o consultor deu
  nome_arquivo      text,
  caminho           text not null,               -- caminho dentro do bucket privado
  mime              text,
  tamanho           bigint,
  enviado_por       uuid,
  enviado_por_nome  text,
  criado_em         timestamptz not null default now()
);

create index if not exists analise_documentos_analise_idx
  on public.analise_documentos (analise_id, criado_em desc);

-- 3) HISTÓRICO --------------------------------------------------------------
--    Item 7: nunca apagar. Só INSERT — não existe update nem delete aqui.
create table if not exists public.analise_eventos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default public.current_org_id(),
  analise_id      uuid not null references public.analises(id) on delete cascade,
  tipo            text not null,                 -- criada | editada | documento | status | ficha | visualizacao
  campo           text,
  valor_anterior  text,
  valor_novo      text,
  detalhe         text,
  autor_id        uuid default auth.uid(),
  autor_nome      text,
  criado_em       timestamptz not null default now()
);

create index if not exists analise_eventos_analise_idx
  on public.analise_eventos (analise_id, criado_em desc);

-- 4) MODELOS DE FICHA -------------------------------------------------------
--    O LAYOUT é dado, não código (item 11). Quando o modelo real chegar, é
--    aqui que ele entra: seções, campos, ordem, cabeçalho, assinaturas.
--    O gerador de PDF lê isto e desenha — ele não conhece campo nenhum por nome.
create table if not exists public.ficha_modelos (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.current_org_id(),
  nome           text not null,
  versao         integer not null default 1,
  ativo          boolean not null default false,
  definicao      jsonb not null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create unique index if not exists ficha_modelos_ativo_idx
  on public.ficha_modelos (org_id) where ativo;

-- 5) toque de atualizado_em -------------------------------------------------
create or replace function public.analises_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  new.telefone_chave = public.lb_chave_telefone(new.telefone);
  return new;
end $$;

drop trigger if exists trg_analises_touch on public.analises;
create trigger trg_analises_touch
  before insert or update on public.analises
  for each row execute function public.analises_touch();

create or replace function public.ficha_modelos_touch()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;

drop trigger if exists trg_ficha_modelos_touch on public.ficha_modelos;
create trigger trg_ficha_modelos_touch
  before update on public.ficha_modelos
  for each row execute function public.ficha_modelos_touch();

-- 6) SEGURANÇA --------------------------------------------------------------
--    Item 6 e 15. O consultor enxerga o que é dele; o admin enxerga tudo.
--    `pode_ver_vendedor` é a mesma função que já governa leads e vendas —
--    reusar em vez de inventar outra regra é o que mantém o RBAC coerente.
alter table public.analises            enable row level security;
alter table public.analise_documentos  enable row level security;
alter table public.analise_eventos     enable row level security;
alter table public.ficha_modelos       enable row level security;

do $rls$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and tablename in ('analises','analise_documentos','analise_eventos','ficha_modelos')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $rls$;

-- ANÁLISES: leitura e escrita dentro do escopo de quem está logado
create policy "analises scope read" on public.analises
  for select using (org_id = public.current_org_id() and public.pode_ver_vendedor(vendedor_id));
create policy "analises insert" on public.analises
  for insert with check (org_id = public.current_org_id());
create policy "analises update" on public.analises
  for update using (org_id = public.current_org_id() and public.pode_ver_vendedor(vendedor_id));

-- DOCUMENTOS: só os metadados, e só de análise que a pessoa já pode ver.
-- O ARQUIVO em si nunca é servido daqui — vem por rota do servidor.
create policy "analise_documentos scope read" on public.analise_documentos
  for select using (
    exists (select 1 from public.analises a
             where a.id = analise_id
               and a.org_id = public.current_org_id()
               and public.pode_ver_vendedor(a.vendedor_id))
  );

-- HISTÓRICO: lê quem pode ver a análise; escreve qualquer um do escopo;
-- não existe policy de update nem de delete — histórico não se apaga.
create policy "analise_eventos scope read" on public.analise_eventos
  for select using (
    exists (select 1 from public.analises a
             where a.id = analise_id
               and a.org_id = public.current_org_id()
               and public.pode_ver_vendedor(a.vendedor_id))
  );
create policy "analise_eventos insert" on public.analise_eventos
  for insert with check (org_id = public.current_org_id());

-- MODELOS DE FICHA: todo mundo lê (é layout, não é dado de cliente);
-- escrever é pelo backend, atrás de requireAdmin.
create policy "ficha_modelos read" on public.ficha_modelos
  for select using (org_id = public.current_org_id());

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'tabelas novas' as item, count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('analises','analise_documentos','analise_eventos','ficha_modelos')
union all
select 'policies criadas', count(*)::text
  from pg_policies where schemaname = 'public'
   and tablename in ('analises','analise_documentos','analise_eventos','ficha_modelos')
union all
select 'leads (deve seguir igual)', count(*)::text from public.leads
union all
select 'central_leads (deve seguir igual)', count(*)::text from public.central_leads;
