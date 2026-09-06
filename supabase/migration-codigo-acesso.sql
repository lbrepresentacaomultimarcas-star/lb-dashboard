-- ============================================================================
-- LB CRM — CÓDIGO DE ACESSO
--
-- O e-mail CONTINUA existindo e continua sendo a identidade real no Supabase
-- Auth: convite, recuperação de senha e segurança seguem por ele. O que muda
-- é só a rotina diária: o consultor digita um código em vez do e-mail.
--
-- Ninguém é recriado, nenhum e-mail é apagado, nenhuma senha é tocada.
--
-- ----------------------------------------------------------------------------
-- DUAS PERGUNTAS DIFERENTES, UMA RESPOSTA SÓ
--
-- `ativo`           -> o admin bloqueou esta pessoa?
-- `codigo_liberado` -> o admin já autorizou o primeiro acesso dela?
--
-- São coisas distintas, mas do ponto de vista do sistema a pergunta é a
-- mesma: ESTA PESSOA PODE USAR O CRM AGORA? Por isso as duas entram nas
-- MESMAS funções que já protegem tudo (`usuario_ativo`, `current_org_id`,
-- `pode_ver_vendedor`), em vez de virarem um segundo mecanismo.
--
-- Isso fecha um furo real: quem ainda não foi liberado poderia pedir
-- "esqueci minha senha" e a recuperação lhe daria uma sessão válida. Com a
-- trava aqui embaixo, essa sessão não enxerga nada.
--
-- ----------------------------------------------------------------------------
-- QUEM JÁ EXISTE ENTRA LIBERADO
--
-- Trancar quem já trabalha para resolver o acesso de quem ainda vai chegar
-- seria criar um problema maior que o resolvido. Todo mundo que já está no
-- sistema recebe código e liberação. Só os NOVOS nascem aguardando.
--
-- 100% ADITIVA e IDEMPOTENTE.
-- ============================================================================

alter table public.profiles
  add column if not exists codigo_acesso   text,
  add column if not exists codigo_liberado boolean not null default false;

comment on column public.profiles.codigo_acesso is
  'Código do dia a dia (V015, SUP001...). NÃO define permissão — quem define é `papel`.';
comment on column public.profiles.codigo_liberado is
  'O admin autorizou o acesso? Falso = cadastrado mas ainda não entra.';

-- Único no sistema inteiro, não por empresa: o login recebe SÓ o código, sem
-- saber de qual empresa é. Dois "V015" tornariam a busca ambígua.
create unique index if not exists profiles_codigo_acesso_uidx
  on public.profiles (upper(codigo_acesso))
  where codigo_acesso is not null;

-- ----------------------------------------------------------------------------
-- Prefixo por cargo — só leitura visual. O código NUNCA decide permissão.
-- ----------------------------------------------------------------------------
create or replace function public.prefixo_codigo(p_papel text)
returns text
language sql
immutable
as $$
  select case p_papel
    when 'admin'       then 'ADM'
    when 'coordenador' then 'COORD'
    when 'supervisor'  then 'SUP'
    when 'lider'       then 'LID'
    else 'V'
  end;
$$;

-- ----------------------------------------------------------------------------
-- Próximo código livre para um cargo. Sequencial, com 3 dígitos.
-- ----------------------------------------------------------------------------
create or replace function public.proximo_codigo_acesso(p_papel text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pref text := public.prefixo_codigo(p_papel);
  v_n    int;
begin
  -- Maior número já usado com este prefixo. O `~` garante que só entram
  -- códigos no formato esperado — um código digitado à mão não quebra a conta.
  select coalesce(max(substring(upper(codigo_acesso) from '^' || v_pref || '(\d+)$')::int), 0)
    into v_n
  from public.profiles
  where upper(codigo_acesso) ~ ('^' || v_pref || '\d+$');

  return v_pref || lpad((v_n + 1)::text, 3, '0');
end;
$$;

-- ----------------------------------------------------------------------------
-- BACKFILL — todo mundo que já existe ganha código E liberação.
-- Mais antigo primeiro, para os números seguirem a ordem de entrada na casa.
-- ----------------------------------------------------------------------------
do $$
declare
  r      record;
  v_pref text;
  v_n    int;
begin
  for r in
    select id, papel
    from public.profiles
    where codigo_acesso is null
    order by criado_em
  loop
    v_pref := public.prefixo_codigo(r.papel);
    select coalesce(max(substring(upper(codigo_acesso) from '^' || v_pref || '(\d+)$')::int), 0)
      into v_n
    from public.profiles
    where upper(codigo_acesso) ~ ('^' || v_pref || '\d+$');

    update public.profiles
       set codigo_acesso   = v_pref || lpad((v_n + 1)::text, 3, '0'),
           codigo_liberado = true          -- já trabalha hoje: não trancar
     where id = r.id;
  end loop;
end $$;

-- Quem já tinha código de alguma rodada anterior também fica liberado.
update public.profiles
   set codigo_liberado = true
 where codigo_acesso is not null
   and codigo_liberado is not true
   and criado_em < now() - interval '1 minute';

-- ============================================================================
-- AS TRAVAS — "liberado" passa a valer onde "ativo" já valia
-- ============================================================================

create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Sem profile não é motivo para bloquear. Bloqueiam: `ativo = false` e
  -- `codigo_liberado = false` — cadastrado, mas ainda não autorizado.
  select coalesce(
    (select coalesce(ativo, true) and coalesce(codigo_liberado, true)
       from public.profiles where id = auth.uid()),
    true
  );
$$;

revoke all on function public.usuario_ativo() from public;
grant execute on function public.usuario_ativo() to authenticated;

create or replace function public.current_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pode boolean;
  v_org  uuid;
begin
  select coalesce(ativo, true) and coalesce(codigo_liberado, true),
         coalesce(vendedor_id, id)
    into v_pode, v_org
  from public.profiles
  where id = auth.uid();

  if not found then
    return auth.uid();   -- sem profile: comportamento antigo
  end if;

  -- Bloqueado OU ainda não liberado: nenhuma linha, em nenhuma tabela.
  if not v_pode then
    return null;
  end if;

  return v_org;
end;
$$;

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
  v_pode   boolean;
begin
  select papel, equipe_id, vendedor_ref,
         coalesce(ativo, true) and coalesce(codigo_liberado, true)
    into v_papel, v_equipe, v_ref, v_pode
  from public.profiles
  where id = auth.uid();

  -- Vem ANTES da regra de admin, de propósito: admin bloqueado também está
  -- bloqueado.
  if found and not v_pode then
    return false;
  end if;

  if v_papel in ('admin', 'coordenador') then
    return true;
  end if;

  if alvo is null then
    return false;
  end if;

  if v_papel in ('supervisor', 'lider') and v_equipe is not null then
    return alvo = v_ref
        or exists (
          select 1 from public.profiles p
          where p.equipe_id = v_equipe
            and p.vendedor_ref = alvo
        );
  end if;

  return alvo = v_ref;
end;
$$;

revoke all on function public.pode_ver_vendedor(uuid) from public;
grant execute on function public.pode_ver_vendedor(uuid) to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'colaboradores COM código (tem que ser o total)' as item, count(*)::text as valor
  from public.profiles where codigo_acesso is not null
union all
select 'colaboradores SEM código (tem que ser 0)', count(*)::text
  from public.profiles where codigo_acesso is null
union all
select 'liberados (os que já existiam)', count(*)::text
  from public.profiles where codigo_liberado
union all
select 'aguardando liberação', count(*)::text
  from public.profiles where not codigo_liberado
union all
select 'códigos repetidos (tem que ser 0)', count(*)::text
  from (select upper(codigo_acesso) c from public.profiles
         where codigo_acesso is not null
         group by 1 having count(*) > 1) x;
