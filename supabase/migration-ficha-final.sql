-- ============================================================================
-- LB CRM — FICHA FINAL DA OPERAÇÃO
--
-- 100% ADITIVA e IDEMPOTENTE. Rode no SQL Editor do Supabase.
-- Não altera nenhuma tabela existente além de acrescentar duas colunas em
-- `analises`. Nada é apagado.
--
-- ----------------------------------------------------------------------------
-- POR QUE UMA TABELA NOVA, E POR QUE ELA NÃO DUPLICA CLIENTE
--
-- O item 11 do pedido manda reaproveitar o que já existe. Foi verificado:
-- RG, órgão emissor, naturalidade, estado civil, filiação, cônjuge, endereço,
-- dados bancários, contrato, cota e grupo NÃO EXISTEM em nenhuma tabela do
-- CRM hoje. Então precisam de lugar.
--
-- `fichas` é 1:1 com `analises` (unique em analise_id) e guarda SÓ o que não
-- existia. Nome, CPF, telefone, e-mail, cidade, crédito, parcela e lance
-- continuam morando em `analises` — a ficha lê de lá, não copia. Não há
-- segundo cadastro de cliente.
-- ============================================================================

-- 1) RESULTADO DA PROPOSTA --------------------------------------------------
--    A frase da aprovação fica gravada NA análise: o documento de amanhã
--    precisa mostrar a mesma frase que foi mostrada no dia da decisão, mesmo
--    que a lista de frases mude depois.
alter table public.analises
  add column if not exists mensagem_aprovacao text;

--    Só existe ficha depois da proposta concluída (item 10). Esta coluna marca
--    o momento em que a proposta virou "concluída" — é diferente de
--    `decidido_em`, que muda a cada troca de status.
alter table public.analises
  add column if not exists concluida_em timestamptz;

-- 2) A FICHA ----------------------------------------------------------------
create table if not exists public.fichas (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null default public.current_org_id(),
  -- 1:1 com a análise. É isto que impede uma segunda ficha do mesmo negócio.
  analise_id         uuid not null unique references public.analises(id) on delete cascade,

  -- consorciado: só o que o CRM ainda não tinha
  rg                 text,
  orgao_emissor      text,
  naturalidade       text,
  nacionalidade      text default 'Brasileira',
  estado_civil       text,
  nome_mae           text,
  nome_pai           text,

  -- cônjuge
  tem_conjuge        boolean not null default false,
  conjuge_nome       text,
  conjuge_cpf        text,
  conjuge_nascimento date,

  -- endereço
  cep                text,
  endereco           text,
  numero             text,
  complemento        text,
  bairro             text,
  cidade             text,
  estado             text,

  -- dados bancários
  banco_tipo_conta   text,
  banco_nome         text,
  banco_agencia      text,
  banco_conta        text,

  -- operação (o que não estava na análise)
  contrato           text,
  cota               text,
  grupo              text,
  forma_pagamento    text,
  valor_entrada      numeric(14,2),
  mes_participacao   text,

  -- estado da ficha: sem confirmação não sai PDF definitivo (item 8)
  status             text not null default 'rascunho' check (status in ('rascunho', 'confirmada')),
  confirmada_por     uuid,
  confirmada_por_nome text,
  confirmada_em      timestamptz,
  pdf_gerado_em      timestamptz,
  pdf_geracoes       integer not null default 0,

  criado_por         uuid,
  criado_por_nome    text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

comment on table public.fichas is
  'Ficha final da operação. 1:1 com analises; guarda só os campos que não existem em outro lugar do CRM.';

create index if not exists fichas_org_idx on public.fichas (org_id, criado_em desc);

create or replace function public.fichas_touch()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;

drop trigger if exists trg_fichas_touch on public.fichas;
create trigger trg_fichas_touch
  before update on public.fichas
  for each row execute function public.fichas_touch();

-- 3) SEGURANÇA --------------------------------------------------------------
--    Mesma regra da análise a que a ficha pertence: quem vê a análise vê a
--    ficha. Reusar `pode_ver_vendedor` mantém o RBAC com uma regra só.
alter table public.fichas enable row level security;

do $rls$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname='public' and tablename='fichas'
  loop execute format('drop policy %I on public.fichas', r.policyname); end loop;
end $rls$;

create policy "fichas scope read" on public.fichas
  for select using (
    exists (select 1 from public.analises a
             where a.id = analise_id
               and a.org_id = public.current_org_id()
               and public.pode_ver_vendedor(a.vendedor_id))
  );
create policy "fichas insert" on public.fichas
  for insert with check (
    org_id = public.current_org_id()
    and exists (select 1 from public.analises a
                 where a.id = analise_id
                   and a.org_id = public.current_org_id()
                   and public.pode_ver_vendedor(a.vendedor_id))
  );
create policy "fichas update" on public.fichas
  for update using (
    exists (select 1 from public.analises a
             where a.id = analise_id
               and a.org_id = public.current_org_id()
               and public.pode_ver_vendedor(a.vendedor_id))
  );

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'tabela fichas' as item, count(*)::text as valor
  from information_schema.tables where table_schema='public' and table_name='fichas'
union all
select 'colunas novas em analises', count(*)::text
  from information_schema.columns
 where table_name='analises' and column_name in ('mensagem_aprovacao','concluida_em')
union all
select 'policies de fichas', count(*)::text
  from pg_policies where schemaname='public' and tablename='fichas'
union all
select 'analises (deve seguir igual)', count(*)::text from public.analises
union all
select 'leads (deve seguir igual)', count(*)::text from public.leads;
