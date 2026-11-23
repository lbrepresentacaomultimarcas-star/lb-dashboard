-- LB Dashboard — Tema global: só o ADMINISTRADOR altera.
--
-- ANTES: a policy "temas rw" deixava qualquer usuário logado da organização
-- criar, editar, ativar ou excluir temas chamando a API direto.
-- DEPOIS: todos continuam LENDO o tema da própria organização (é o que pinta o
-- sistema), mas só um admin ativo escreve.
--
-- Não toca em dados, em outras tabelas nem em outras policies. Idempotente.
-- Rodar no SQL Editor do Supabase do LB.

create or replace function public.eh_admin_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select papel = 'admin'
            and coalesce(ativo, true)
            and coalesce(codigo_liberado, true)
       from public.profiles
      where id = auth.uid()),
    false
  );
$$;

revoke all on function public.eh_admin_ativo() from public;
grant execute on function public.eh_admin_ativo() to authenticated;

begin;

drop policy if exists "temas rw" on public.temas;
drop policy if exists "temas leitura" on public.temas;
drop policy if exists "temas admin insere" on public.temas;
drop policy if exists "temas admin altera" on public.temas;
drop policy if exists "temas admin exclui" on public.temas;

create policy "temas leitura" on public.temas for select
  using (org_id = public.current_org_id());

create policy "temas admin insere" on public.temas for insert
  with check (org_id = public.current_org_id() and public.eh_admin_ativo());

create policy "temas admin altera" on public.temas for update
  using (org_id = public.current_org_id() and public.eh_admin_ativo())
  with check (org_id = public.current_org_id() and public.eh_admin_ativo());

create policy "temas admin exclui" on public.temas for delete
  using (org_id = public.current_org_id() and public.eh_admin_ativo());

commit;

-- COMO DESFAZER (volta exatamente ao comportamento anterior):
--   drop policy "temas leitura" on public.temas;
--   drop policy "temas admin insere" on public.temas;
--   drop policy "temas admin altera" on public.temas;
--   drop policy "temas admin exclui" on public.temas;
--   create policy "temas rw" on public.temas for all
--     using (org_id = public.current_org_id())
--     with check (org_id = public.current_org_id());
