-- ============================================================================
-- LB CRM — Central de Recuperação de Leads
-- 100% ADITIVO e IDEMPOTENTE. Rode UMA vez no SQL editor do Supabase
-- ANTES de publicar o código novo.
--
-- Não remove nem altera nada existente: só adiciona colunas OPCIONAIS na
-- tabela `leads` e um gatilho que carimba `perdido_em` quando um lead entra
-- em "perdido" (base do "dias parado"). Todo o histórico é preservado.
-- ============================================================================

-- 1) Colunas novas (todas nuláveis / com default seguro) -----------------------
alter table public.leads
  add column if not exists nivel_recuperacao text,          -- facil | medio | dificil | sem_info (null = sem info)
  add column if not exists motivo_perda      text,          -- motivo da perda (texto livre)
  add column if not exists em_recuperacao    boolean not null default false, -- redistribuído pela Central
  add column if not exists perdido_em         timestamptz,   -- quando virou "perdido"
  add column if not exists recuperado_em      timestamptz;   -- quando fechou após recuperação (reservado)

-- 2) Gatilho: carimba `perdido_em` ao ENTRAR em "perdido" ----------------------
--    (assim o app NÃO precisa mudar o fluxo do funil — o banco cuida disso)
create or replace function public.lead_marca_perdido_em()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'perdido'
     and (tg_op = 'INSERT' or old.status is distinct from 'perdido')
     and new.perdido_em is null then
    new.perdido_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_perdido_em on public.leads;
create trigger trg_lead_perdido_em
  before insert or update on public.leads
  for each row execute function public.lead_marca_perdido_em();

-- 3) Backfill: leads JÁ perdidos ganham um perdido_em aproximado ----------------
--    (usa atualizado_em; se nulo, cai no criado_em). Só preenche o que está vazio.
update public.leads
   set perdido_em = coalesce(atualizado_em, criado_em)
 where status = 'perdido'
   and perdido_em is null;

-- 4) Realtime — garante que `leads` está publicado (idempotente) ---------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.leads;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================================
-- VERIFICAÇÃO (opcional): confere as colunas novas
-- ============================================================================
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'leads'
   and column_name in ('nivel_recuperacao','motivo_perda','em_recuperacao','perdido_em','recuperado_em')
 order by column_name;
