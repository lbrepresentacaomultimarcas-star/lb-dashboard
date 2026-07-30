-- ============================================================
-- LB CRM — FASE 4 do RBAC: RLS por vendedor/equipe na LEITURA de LEADS
-- ============================================================
-- Leva o recorte "cada um vê só o seu" pra DENTRO do banco (defesa extra).
-- Espelha exatamente o motor lib/scope.ts do app.
--
-- ESCOPO (deliberadamente mínimo pra ser seguro):
--   • Aperta SOMENTE o SELECT (leitura) da tabela `leads`.
--   • NÃO mexe em insert/update/delete de leads (seguem por org).
--   • NÃO mexe em vendas (ranking é placar público de propósito),
--     clientes (lista compartilhada, sem dono), metas, nem nada mais.
--   • Ranking segue 100% (usa RPC SECURITY DEFINER, que passa por cima da RLS).
--   • NÃO precisa de deploy de código — o app já funciona; isto é blindagem.
--
-- Idempotente (pode rodar de novo) e REVERSÍVEL (bloco no fim).
-- Rode no SQL Editor do Supabase.
-- ============================================================

-- 1) HELPER: o usuário logado pode VER as linhas do vendedor `alvo`?
--    admin/coordenador → tudo · supervisor/líder → a equipe · vendedor → só o seu.
create or replace function public.pode_ver_vendedor(alvo uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel  text;
  v_equipe uuid;
  v_ref    uuid;
begin
  select papel, equipe_id, vendedor_ref
    into v_papel, v_equipe, v_ref
  from public.profiles
  where id = auth.uid();

  -- Admin e Coordenador enxergam a empresa inteira.
  if v_papel in ('admin', 'coordenador') then
    return true;
  end if;

  -- Linha sem dono (vendedor_id nulo) só aparece p/ quem vê tudo (acima).
  if alvo is null then
    return false;
  end if;

  -- Supervisor e Líder enxergam a própria equipe (vendedor_ref dos membros).
  if v_papel in ('supervisor', 'lider') and v_equipe is not null then
    return alvo = v_ref
        or exists (
          select 1 from public.profiles p
          where p.equipe_id = v_equipe
            and p.vendedor_ref = alvo
        );
  end if;

  -- Vendedor comum → apenas os próprios registros.
  return alvo = v_ref;
end;
$$;

revoke all on function public.pode_ver_vendedor(uuid) from public;
grant execute on function public.pode_ver_vendedor(uuid) to authenticated;

-- 2) Substitui a policy de SELECT de `leads` pela versão escopada.
--    Remove TODAS as policies de SELECT existentes (pra não sobrar nenhuma
--    permissiva que anularia o efeito) e cria a nova. As de insert/update/
--    delete continuam intactas (seguem por org_id).
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'leads' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.leads;', pol.policyname);
  end loop;

  create policy "leads_scope_read" on public.leads
    for select
    using (
      org_id = public.current_org_id()
      and public.pode_ver_vendedor(vendedor_id)
    );
end$$;

-- ============================================================
-- VERIFICAÇÃO (opcional) — quantos leads cada usuário enxergaria.
-- Roda simulando cada pessoa. Descomente pra conferir.
-- ============================================================
-- do $$
-- declare r record; n int;
-- begin
--   for r in select id, nome, papel from public.profiles order by papel, nome loop
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', r.id, 'role', 'authenticated')::text, true);
--     execute 'set local role authenticated';
--     select count(*) into n from public.leads;
--     raise notice '% (%): % leads', r.nome, r.papel, n;
--     execute 'reset role';
--   end loop;
-- end$$;

-- ============================================================
-- REVERTER (se algo parecer estranho, rode SÓ este bloco pra voltar ao normal:
-- leitura de leads volta a ser por empresa, como era antes da Fase 4)
-- ============================================================
-- do $$
-- declare pol record;
-- begin
--   for pol in
--     select policyname from pg_policies
--     where schemaname = 'public' and tablename = 'leads' and cmd = 'SELECT'
--   loop
--     execute format('drop policy %I on public.leads;', pol.policyname);
--   end loop;
--   create policy "leads read" on public.leads
--     for select using (org_id = public.current_org_id());
-- end$$;
