-- ============================================================================
-- LB CRM — FINANCEIRO: CICLOS DE PRODUÇÃO E RECEBIMENTO
--
-- Duas tabelas NOVAS. Nada existente é alterado ou apagado: `fin_mes`,
-- `fin_gastos_fixos`, `fin_lancamentos`, `vendas`, `leads` e o ciclo de
-- produção do ranking ficam exatamente como estão.
--
-- POR QUE PRECISA DE TABELA
--
-- Quanto foi VENDIDO em cada ciclo o sistema calcula de `vendas` (não copia).
-- Quando o dinheiro DEVE entrar o sistema calcula pela regra (21/22 e 5º dia
-- útil). Mas quanto REALMENTE entrou, e em que dia, é fato que só o
-- administrador sabe — e fato tem que ser gravado, nunca deduzido.
--
-- É exatamente a separação que o módulo inteiro persegue:
--   previsto  = calculado    (nunca gravado)
--   recebido  = confirmado   (gravado aqui)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) O RECEBIMENTO DE CADA CICLO
--
-- `ciclo` é a chave do ciclo de produção:
--   "2026-10-A" → produção de 20/09 a 05/10, recebe dia 21/22 de outubro
--   "2026-10-B" → produção de 05/10 a 20/10, recebe até o 5º dia útil de nov.
--
-- `previsto` é opcional e serve para quando a administradora avisa um valor
-- diferente do vendido. Vazio (null) = usar o vendido calculado.
-- ----------------------------------------------------------------------------
create table if not exists public.fin_ciclos (
  org_id        uuid not null,
  ciclo         text not null,
  previsto      numeric(14,2) check (previsto is null or previsto >= 0),
  recebido      numeric(14,2) not null default 0 check (recebido >= 0),
  recebido_em   date,
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (org_id, ciclo),
  -- só aceita "AAAA-MM-A" ou "AAAA-MM-B": chave torta não entra
  constraint fin_ciclos_chave_valida check (ciclo ~ '^[0-9]{4}-(0[1-9]|1[0-2])-[AB]$'),
  -- dinheiro recebido sem data de entrada é o tipo de registro que mente depois
  constraint fin_ciclos_data_do_recebido check (recebido = 0 or recebido_em is not null)
);

comment on table public.fin_ciclos is
  'Recebimento REAL de cada ciclo de produção (20→5 e 5→20). O vendido e a previsão são calculados, não gravados.';
comment on column public.fin_ciclos.previsto is
  'Valor que a administradora avisou, quando diferente do vendido. Null = usar o vendido.';

-- ----------------------------------------------------------------------------
-- 2) A REGRA DE RECEBIMENTO, EDITÁVEL
--
-- A empresa recebe o ciclo 20→5 por volta do dia 21, e o ciclo 5→20 até o 5º
-- dia útil. "Por volta" muda, então a regra é cadastrada em vez de ficar
-- escondida no código.
-- ----------------------------------------------------------------------------
create table if not exists public.fin_config (
  org_id                    uuid primary key,
  dia_recebimento_a         int not null default 21 check (dia_recebimento_a between 1 and 28),
  dias_uteis_recebimento_b  int not null default 5  check (dias_uteis_recebimento_b between 1 and 15),
  atualizado_em             timestamptz not null default now()
);

comment on table public.fin_config is
  'Regra de recebimento dos ciclos: dia do ciclo A (21/22) e quantos dias úteis do ciclo B (5).';

-- ----------------------------------------------------------------------------
-- 3) RLS LIGADA, SEM POLICY — igual ao resto do financeiro
--
-- Sem policy nenhuma, nem o navegador de um admin lê estas tabelas direto: o
-- acesso é só pela rota /api/financeiro, que exige admin. É dinheiro da
-- empresa; vendedor não vê nem pelo DevTools.
-- ----------------------------------------------------------------------------
alter table public.fin_ciclos  enable row level security;
alter table public.fin_config  enable row level security;

-- ----------------------------------------------------------------------------
-- 4) CONFERÊNCIA
-- ----------------------------------------------------------------------------
do $$
declare
  n_tabelas int;
begin
  select count(*) into n_tabelas
    from information_schema.tables
   where table_schema = 'public'
     and table_name in ('fin_ciclos', 'fin_config');
  raise notice 'tabelas criadas: % de 2', n_tabelas;
end $$;

select table_name,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.table_name) as policies
  from information_schema.tables t
 where table_schema = 'public'
   and table_name in ('fin_ciclos', 'fin_config')
 order by table_name;
