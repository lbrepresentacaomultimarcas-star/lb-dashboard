-- ============================================================================
-- LB CRM — FINANCEIRO ESTRATÉGICO
--
-- Três tabelas novas. NENHUMA tabela existente é alterada: `vendas`,
-- `vendedores`, `leads`, `metas` e o ciclo de produção ficam exatamente como
-- estão. O faturamento continua saindo de `vendas` pelo `cicloDeData` — este
-- módulo NÃO cria um segundo cadastro de vendas.
--
-- POR QUE UM LIVRO ÚNICO E NÃO QUATRO TABELAS
--
-- Gasto fixo, gasto variável, conta a pagar e conta a receber são a MESMA
-- pergunta com respostas diferentes: quanto, quando, saiu ou entrou. Em
-- tabelas separadas, "quanto tenho a pagar" viraria três consultas somadas à
-- mão — e um dia uma delas seria esquecida. Num livro só, é um `where`.
--
-- "ATRASADO" É DERIVADO, NÃO GRAVADO
--
-- Atrasado = pendente E o vencimento já passou. Se fosse uma coluna, alguém
-- teria que rodar uma rotina toda madrugada para virar o status — e no dia que
-- a rotina falhasse o painel mentiria. Calculado na hora, nunca mente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) O MÊS
--
-- `chave` é a do CICLO de produção ("AAAA-MM", mês do fechamento dia 20), a
-- mesma que o ranking e as metas já usam. Assim o faturamento informado aqui
-- fala do mesmo período que o resto do CRM.
--
-- Guarda o que foi REALIZADO. Os limites (10/50/18/22) NÃO são gravados: são
-- calculados a partir do faturamento por `lib/financeiro.ts`. Gravar os dois
-- deixaria o banco poder discordar da regra.
-- ----------------------------------------------------------------------------
create table if not exists public.fin_mes (
  org_id            uuid not null,
  chave             text not null,                  -- "2026-09" (ciclo)
  faturamento       numeric(14,2) not null default 0 check (faturamento >= 0),
  guardado          numeric(14,2) not null default 0 check (guardado >= 0),
  prolabore_usado   numeric(14,2) not null default 0 check (prolabore_usado >= 0),
  imposto_separado  numeric(14,2) not null default 0 check (imposto_separado >= 0),
  observacao        text,
  fechado_em        timestamptz,
  fechado_por       uuid,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  primary key (org_id, chave)
);

comment on table public.fin_mes is
  'Financeiro por ciclo de produção: faturamento informado e o que foi realizado em cada destinação.';
comment on column public.fin_mes.prolabore_usado is
  'Quanto foi retirado. Os 50% são LIMITE — o que não sai fica na empresa.';

-- ----------------------------------------------------------------------------
-- 2) GASTOS FIXOS — o molde, cadastrado UMA vez
--
-- Não guarda mês: é o modelo. A ocorrência de cada mês nasce no livro (tabela
-- 3), para o admin não recadastrar aluguel todo mês e para o histórico de um
-- mês fechado não mudar quando o valor do aluguel subir.
-- ----------------------------------------------------------------------------
create table if not exists public.fin_gastos_fixos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  nome            text not null,
  valor           numeric(14,2) not null check (valor >= 0),
  dia_vencimento  int not null check (dia_vencimento between 1 and 31),
  categoria       text not null default 'Outros',
  observacao      text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists fin_gastos_fixos_org_idx
  on public.fin_gastos_fixos (org_id, ativo);

-- ----------------------------------------------------------------------------
-- 3) O LIVRO — tudo que entra e tudo que sai
--
-- `direcao`  entrada = dinheiro a receber · saida = compromisso a pagar
-- `tipo`     de onde veio: fixo (gerado do molde), variavel, recebimento
-- `operacao` conta contra o limite de 22%? Aluguel e salário são da empresa,
--            não da operação comercial — por isso é uma escolha, não uma
--            dedução automática pela categoria.
-- `venda_id` liga o recebimento à venda que já existe, SEM copiá-la.
-- ----------------------------------------------------------------------------
create table if not exists public.fin_lancamentos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  chave           text not null,                    -- ciclo a que pertence
  direcao         text not null check (direcao in ('entrada','saida')),
  tipo            text not null check (tipo in ('fixo','variavel','recebimento')),
  descricao       text not null,
  categoria       text not null default 'Outros',
  valor           numeric(14,2) not null check (valor >= 0),
  vencimento      date not null,
  operacao        boolean not null default false,
  gasto_fixo_id   uuid references public.fin_gastos_fixos(id) on delete set null,
  venda_id        uuid references public.vendas(id) on delete set null,
  -- liquidado = pago (saída) ou recebido (entrada). "Atrasado" é derivado.
  status          text not null default 'pendente' check (status in ('pendente','liquidado')),
  liquidado_em    date,
  valor_pago      numeric(14,2) check (valor_pago >= 0),
  forma_pagamento text,
  observacao      text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists fin_lancamentos_mes_idx
  on public.fin_lancamentos (org_id, chave);
create index if not exists fin_lancamentos_venc_idx
  on public.fin_lancamentos (org_id, status, vencimento);

-- UM gasto fixo gera UMA ocorrência por mês. Gerar o mês duas vezes (duplo
-- clique, duas abas, reabrir a tela) não duplica o aluguel.
create unique index if not exists fin_lancamentos_fixo_por_mes
  on public.fin_lancamentos (org_id, gasto_fixo_id, chave)
  where gasto_fixo_id is not null;

-- ----------------------------------------------------------------------------
-- 4) FECHADO PARA O NAVEGADOR
--
-- RLS ligada SEM policy: nem o navegador de um admin lê estas tabelas direto.
-- Tudo passa pela rota `/api/financeiro`, que exige admin. É o mesmo padrão da
-- fila automática e da configuração de produção — e aqui vale dobrado, porque
-- é o dinheiro da empresa: vendedor não pode ler nem pelo DevTools.
-- ----------------------------------------------------------------------------
alter table public.fin_mes            enable row level security;
alter table public.fin_gastos_fixos   enable row level security;
alter table public.fin_lancamentos    enable row level security;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'tabelas do financeiro criadas (tem que ser 3)' as item, count(*)::text as valor
  from pg_tables
 where schemaname = 'public'
   and tablename in ('fin_mes','fin_gastos_fixos','fin_lancamentos')
union all
select 'RLS ligada nas 3 (tem que ser 3)', count(*)::text
  from pg_tables
 where schemaname = 'public'
   and tablename in ('fin_mes','fin_gastos_fixos','fin_lancamentos')
   and rowsecurity
union all
select 'trava de gasto fixo por mês (tem que ser 1)', count(*)::text
  from pg_indexes
 where schemaname = 'public' and indexname = 'fin_lancamentos_fixo_por_mes'
union all
select 'vendas (NÃO pode ter mudado)', count(*)::text from public.vendas
union all
select 'meses financeiros cadastrados', count(*)::text from public.fin_mes;
