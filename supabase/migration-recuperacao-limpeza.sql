-- ============================================================================
-- LB CRM — Limpeza da Central de Recuperação de Leads
-- 100% ADITIVO e IDEMPOTENTE. Rode UMA vez no SQL editor do Supabase
-- ANTES de publicar o código novo.
--
-- "Limpar" NÃO exclui o lead do CRM: só marca `recuperacao_removido_em`, o que
-- tira o cliente da Central de Recuperação. O lead e todo o histórico ficam
-- intactos (inclusive na coluna Perdidos do funil).
-- ============================================================================

-- 1) Coluna nova (nulável) — null = está no banco; com data = removido da Central
alter table public.leads
  add column if not exists recuperacao_removido_em timestamptz;

-- 2) Gatilho: ao (re)entrar em "perdido", carimba perdido_em E LIMPA
--    recuperacao_removido_em — assim, se um lead já limpo for perdido de novo
--    no futuro, ele volta a aparecer na Central (banco sempre "fresco").
--    Só muda comportamento na transição para "perdido"; nada mais é afetado.
create or replace function public.lead_marca_perdido_em()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'perdido'
     and (tg_op = 'INSERT' or old.status is distinct from 'perdido') then
    if new.perdido_em is null then
      new.perdido_em := now();
    end if;
    new.recuperacao_removido_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_perdido_em on public.leads;
create trigger trg_lead_perdido_em
  before insert or update on public.leads
  for each row execute function public.lead_marca_perdido_em();

-- ============================================================================
-- VERIFICAÇÃO (opcional):
-- ============================================================================
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'leads'
   and column_name = 'recuperacao_removido_em';
