-- ============================================================================
-- LB CRM — LÍDER VOLTA A ENXERGAR SÓ O QUE É DELE
--
-- DECISÃO DA OPERAÇÃO
--
-- O cargo de Líder, neste momento, é de FORMAÇÃO — não de gestão. Ele
-- desenvolve postura de liderança ajudando os consultores presencialmente, e
-- isso não exige que o login dele passe a enxergar a carteira dos outros o
-- tempo todo.
--
-- Virar Líder deixa de ser uma porta para os dados alheios e passa a ser o
-- que sempre deveria ter sido: um degrau da carreira.
--
-- A ESCADA FICA ASSIM
--
--   Vendedor                → só os próprios dados
--   Líder                   → só os próprios dados  (mudou aqui)
--   Supervisor COM equipe   → os dados da equipe dele
--   Admin / Representante   → a empresa inteira
--
-- Repare no "COM equipe": são DUAS condições, não uma. Cargo de supervisor
-- sem vínculo de equipe continua vendo só o próprio — não existe acesso por
-- cargo solto, nem por estar na mesma equipe que alguém.
--
-- POR QUE AQUI, E NÃO SÓ NA TELA
--
-- Esconder no aplicativo não protege: bastaria chamar a API direto. Esta
-- função é usada por TODAS as policies de leitura e escrita do CRM — é ela
-- que decide, linha por linha, o que sai do banco. Enquanto ela disser não,
-- não existe caminho que devolva o dado.
--
-- 100% IDEMPOTENTE. Nenhuma outra função, policy ou tabela é tocada.
-- ============================================================================

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

  -- Bloqueado ou ainda não liberado não vê nada, nem sendo admin.
  if found and not v_pode then
    return false;
  end if;

  -- Admin e Representante enxergam a empresa inteira.
  if v_papel in ('admin', 'coordenador') then
    return true;
  end if;

  -- Linha sem dono só aparece para quem vê tudo (acima).
  if alvo is null then
    return false;
  end if;

  -- SUPERVISOR com equipe → a equipe dele. O LÍDER saiu daqui: o cargo é de
  -- formação, não de gestão.
  if v_papel = 'supervisor' and v_equipe is not null then
    return alvo = v_ref
        or exists (
          select 1 from public.profiles p
          where p.equipe_id = v_equipe
            and p.vendedor_ref = alvo
        );
  end if;

  -- Vendedor, Líder, e supervisor ainda sem equipe → apenas os próprios.
  return alvo = v_ref;
end;
$$;

revoke all on function public.pode_ver_vendedor(uuid) from public;
grant execute on function public.pode_ver_vendedor(uuid) to authenticated;

-- ============================================================================
-- VERIFICAÇÃO — como cada cargo enxerga hoje
-- ============================================================================
select
  p.nome                                   as colaborador,
  p.papel                                  as cargo,
  coalesce(e.nome, '—')                    as equipe,
  case
    when p.papel in ('admin', 'coordenador')                 then 'empresa inteira'
    when p.papel = 'supervisor' and p.equipe_id is not null   then 'a equipe dele'
    when p.papel = 'supervisor'                              then 'só os próprios (sem equipe vinculada)'
    else 'só os próprios'
  end                                      as enxerga
from public.profiles p
left join public.equipes e on e.id = p.equipe_id
order by
  case p.papel when 'admin' then 0 when 'coordenador' then 1
               when 'supervisor' then 2 when 'lider' then 3 else 4 end,
  p.nome;
