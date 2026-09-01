-- ============================================================================
-- LB CRM — BLOQUEIO IMEDIATO DE COLABORADOR
--
-- O PROBLEMA
--
-- Desativar um colaborador na tela do Administrativo gravava `profiles.ativo
-- = false` e mais nada. Nenhuma camada lia esse campo: nem a RLS, nem as
-- rotas de API, nem a tela. Na prática a bolinha ficava cinza e a pessoa
-- continuava trabalhando normalmente até resolver sair da conta.
--
-- Pior: como o navegador fala DIRETO com o Supabase usando o token do
-- usuário, bastava a página já estar aberta (ou o DevTools) para seguir
-- lendo e gravando dados.
--
-- A CORREÇÃO, AQUI
--
-- O bloqueio passa a valer no lugar mais fundo possível: as duas funções que
-- toda policy de RLS usa. Se a pessoa está inativa:
--   • `current_org_id()` devolve NULL  → `org_id = null` é falso em toda
--     policy, de leitura e de escrita, em TODAS as tabelas de uma vez;
--   • `pode_ver_vendedor()` devolve false.
--
-- Isso não depende do token, nem do app, nem da tela. Vale para requisição
-- direta, aba antiga esquecida aberta e DevTools.
--
-- SEGURANÇA CONTRA TRANCAR TODO MUNDO PRA FORA
--
-- A coluna `ativo` foi criada direto no banco e não está em nenhuma migration
-- deste repositório — então não dá para saber daqui se existe linha com NULL.
-- Por isso **NULL é tratado como ATIVO** (`coalesce(ativo, true)`) em todo
-- lugar. Bloquear é sempre um ato explícito: só `ativo = false` bloqueia.
--
-- 100% IDEMPOTENTE. Não altera dado de ninguém além de normalizar NULL → true.
-- ============================================================================

-- 1) Garante a coluna. Se já existir, este comando não faz nada.
alter table public.profiles
  add column if not exists ativo boolean not null default true;

-- 2) Normaliza qualquer NULL herdado para ATIVO (nunca para bloqueado).
update public.profiles set ativo = true where ativo is null;

-- ----------------------------------------------------------------------------
-- 3) Uma fonte única de verdade: "quem está pedindo está ativo?"
-- ----------------------------------------------------------------------------
create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Sem profile (usuário recém-criado, por exemplo) não é motivo para
  -- bloquear: só `ativo = false` bloqueia.
  select coalesce(
    (select ativo from public.profiles where id = auth.uid()),
    true
  );
$$;

revoke all on function public.usuario_ativo() from public;
grant execute on function public.usuario_ativo() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) current_org_id(): o coração da RLS multiempresa.
--
--    Devolver NULL para quem está bloqueado derruba TODAS as policies de uma
--    vez — `org_id = current_org_id()` vira NULL, que a RLS trata como falso.
--    É por isso que a correção não precisou tocar em policy nenhuma.
-- ----------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ativo boolean;
  v_org   uuid;
begin
  select coalesce(ativo, true), coalesce(vendedor_id, id)
    into v_ativo, v_org
  from public.profiles
  where id = auth.uid();

  -- Sem profile: mantém o comportamento antigo (a própria conta é a org).
  if not found then
    return auth.uid();
  end if;

  -- BLOQUEADO: nenhuma linha, em nenhuma tabela, para ninguém.
  if not v_ativo then
    return null;
  end if;

  return v_org;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) pode_ver_vendedor(): o escopo por equipe. Bloqueado não vê nada — nem
--    o que é dele. A checagem vem ANTES da regra de admin, de propósito:
--    administrador bloqueado também está bloqueado.
-- ----------------------------------------------------------------------------
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
  v_ativo  boolean;
begin
  select papel, equipe_id, vendedor_ref, coalesce(ativo, true)
    into v_papel, v_equipe, v_ref, v_ativo
  from public.profiles
  where id = auth.uid();

  -- Bloqueado não enxerga nada, independentemente do cargo.
  if found and not v_ativo then
    return false;
  end if;

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

-- ----------------------------------------------------------------------------
-- 6) FECHA A PORTA DOS FUNDOS (achado durante esta correção)
--
--    A policy `profiles self write` deixa cada usuário atualizar a PRÓPRIA
--    linha de `profiles`. RLS controla a LINHA, não a COLUNA — então, do
--    navegador, uma pessoa podia gravar em si mesma:
--
--        update profiles set ativo = true   where id = <eu>   → desfaz o bloqueio
--        update profiles set papel = 'admin' where id = <eu>  → vira administrador
--
--    Sem fechar isso, o bloqueio inteiro seria desfeito com uma linha no
--    DevTools, e o RBAC não valeria nada.
--
--    A correção é por COLUNA (grant), não por policy: o usuário continua
--    podendo mudar o próprio nome; `ativo`, `papel`, `equipe_id`,
--    `vendedor_ref` e `vendedor_id` passam a ser só do servidor. Nada quebra:
--    o navegador apenas LÊ profiles — toda gravação já passa por
--    /api/admin/users com a chave de serviço, que ignora grants.
-- ----------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;
grant  update (nome) on public.profiles to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'colaboradores ATIVOS'   as item, count(*)::text as valor
  from public.profiles where coalesce(ativo, true)
union all
select 'colaboradores BLOQUEADOS', count(*)::text
  from public.profiles where ativo = false
union all
select 'ainda com ativo NULL (tem que ser 0)', count(*)::text
  from public.profiles where ativo is null
union all
select 'as 3 funções existem (tem que ser 3)', count(*)::text
  from pg_proc
 where proname in ('usuario_ativo', 'current_org_id', 'pode_ver_vendedor')
union all
select 'colunas que o navegador ainda pode gravar em profiles (tem que ser só "nome")',
       coalesce(string_agg(column_name, ', ' order by column_name), 'nenhuma')
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'profiles'
   and grantee = 'authenticated' and privilege_type = 'UPDATE';
