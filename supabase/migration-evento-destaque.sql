-- ============================================================================
-- LB CRM — EVENTO / DESAFIO EM DESTAQUE
--
-- Campanhas, gincanas e desafios comerciais aparecem no topo do Dashboard
-- enquanto estiverem ativos, e somem quando não houver nenhum.
--
-- DUAS METAS, NÃO UMA
--
-- `meta_geral` é a meta do evento inteiro (ex.: R$ 8 milhões da gincana entre
-- várias operações). `meta_lb` é a NOSSA — a que este time precisa buscar.
-- São colunas separadas de propósito: tratar os 8 milhões como se fossem da
-- LB desanima em vez de motivar, porque a conta nunca fecha.
--
-- O REALIZADO NÃO MORA AQUI
--
-- Nenhuma coluna guarda "quanto já vendemos". Esse número é calculado na hora,
-- a partir das vendas reais do período — o mesmo cálculo do Dashboard. Guardar
-- um total aqui criaria uma segunda verdade que um dia divergiria da primeira.
--
-- 100% ADITIVA. Tabela nova; nada existente é tocado.
-- ============================================================================

create table if not exists public.eventos_destaque (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.current_org_id(),
  nome           text not null,
  capa_url       text,
  frase          text,
  descricao      text,
  inicio         date not null,
  fim            date not null,
  meta_geral     numeric,        -- a meta do evento todo (opcional)
  meta_lb        numeric not null default 0,
  mensagem       text,
  ativo          boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz
);

create index if not exists eventos_destaque_ativo_idx
  on public.eventos_destaque (org_id, ativo, inicio desc);

alter table public.eventos_destaque enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'eventos_destaque'
  loop
    execute format('drop policy %I on public.eventos_destaque;', pol.policyname);
  end loop;
end $$;

-- LEITURA: todo mundo da empresa. É um chamado para o time inteiro — esconder
-- de parte dele não faria sentido nenhum.
create policy "eventos leitura da empresa" on public.eventos_destaque
  for select to authenticated
  using (org_id = public.current_org_id());

-- ESCRITA: nenhuma policy. Só a chave de serviço (rota /api/admin/eventos,
-- que confere admin) grava. É o mesmo padrão já usado no resto do CRM:
-- RLS ligada e sem policy = fechado para o navegador, aberto para o servidor.

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'tabela eventos_destaque criada (tem que ser 1)' as item, count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public' and table_name = 'eventos_destaque'
union all
select 'policy de leitura (tem que ser 1)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'eventos_destaque'
union all
select 'eventos cadastrados', count(*)::text from public.eventos_destaque;
