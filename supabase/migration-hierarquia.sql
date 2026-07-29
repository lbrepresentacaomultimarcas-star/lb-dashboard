-- ============================================================================
-- LB CRM — Hierarquia de Gestão (Fase 1)
-- Papel "Líder" + Supervisor da equipe. 100% ADITIVO e IDEMPOTENTE.
-- Rode UMA vez no SQL editor do Supabase. Não remove nem altera dados.
-- ============================================================================

-- 1) Supervisor da equipe (o Líder já existe como equipes.lider_id) -------------
alter table public.equipes add column if not exists supervisor_id uuid;

-- 2) Vínculo colaborador↔vendedor (garante a coluna; já existe no banco vivo) ---
alter table public.profiles add column if not exists vendedor_ref uuid;

-- 3) Constraint de papel: incluir os 5 cargos ---------------------------------
--    Acha e remove QUALQUER check de papel (nome pode variar) e recria com os 5.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%papel%'
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_papel_check
  check (papel in ('admin', 'coordenador', 'supervisor', 'lider', 'vendedor'));

-- ============================================================================
-- VERIFICAÇÃO (opcional)
-- ============================================================================
select
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_papel_check') as papel_check,
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='equipes' and column_name='supervisor_id') as tem_supervisor_id;
