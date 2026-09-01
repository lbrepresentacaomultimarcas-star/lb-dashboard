-- ============================================================================
-- DIAGNÓSTICO — "compartilhei o negócio e o consultor não recebeu"
--
-- SOMENTE LEITURA. Não altera absolutamente nada.
--
-- A ideia: para um consultor ENXERGAR um negócio, o `leads.vendedor_id` tem
-- que ser exatamente o mesmo id que está no `profiles.vendedor_ref` dele.
-- São duas colunas diferentes em duas tabelas diferentes, ligadas por e-mail
-- lá atrás — e é exatamente aí que a coisa desalinha.
--
-- Se a mesma pessoa tiver DOIS registros na tabela `vendedores` (o que
-- acontece quando o cadastro foi feito à mão e depois o sistema criou o
-- automático), a lista do "Compartilhar" mostra os dois com o mesmo nome. O
-- admin escolhe um, o sistema grava aquele id, e o consultor — que está
-- ligado ao OUTRO id — não vê nada. O negócio existe, está gravado, e é
-- invisível para ele.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) O RETRATO DE CADA COLABORADOR
--
--    Olhe a coluna SITUAÇÃO. Qualquer coisa diferente de "ok" explica o
--    sumiço dos negócios daquela pessoa.
-- ----------------------------------------------------------------------------
select
  p.nome                                        as colaborador,
  p.email,
  p.papel,
  case when coalesce(p.ativo, true) then 'ativo' else 'BLOQUEADO' end as acesso,
  p.vendedor_ref                                as ligado_ao_vendedor,
  v.nome                                        as nome_no_cadastro_vendedor,
  (select count(*) from public.vendedores v2
     where lower(v2.email) = lower(p.email))    as registros_vendedor_com_esse_email,
  (select count(*) from public.leads l
     where l.vendedor_id = p.vendedor_ref)      as negocios_que_ele_ve,
  (select count(*) from public.leads l
     join public.vendedores v3 on v3.id = l.vendedor_id
    where lower(v3.email) = lower(p.email)
      and (p.vendedor_ref is null or l.vendedor_id <> p.vendedor_ref))
                                                as negocios_no_nome_dele_que_ele_NAO_ve,
  case
    when p.vendedor_ref is null                            then 'SEM VINCULO -> nao ve NADA'
    when v.id is null                                      then 'VINCULO QUEBRADO -> aponta p/ vendedor que nao existe'
    when (select count(*) from public.vendedores v2
            where lower(v2.email) = lower(p.email)) > 1    then 'CADASTRO DUPLICADO -> pode receber no id errado'
    when not coalesce(p.ativo, true)                       then 'bloqueado (nao deve receber)'
    else 'ok'
  end                                           as situacao
from public.profiles p
left join public.vendedores v on v.id = p.vendedor_ref
order by
  case
    when p.vendedor_ref is null then 0
    when v.id is null then 1
    when (select count(*) from public.vendedores v2 where lower(v2.email) = lower(p.email)) > 1 then 2
    else 9
  end,
  p.nome;

-- ----------------------------------------------------------------------------
-- 2) CADASTROS DUPLICADOS NA TABELA DE VENDEDORES
--
--    Se aparecer alguma linha aqui, é a causa mais provável: a lista do
--    "Compartilhar" mostra a mesma pessoa duas vezes, com nomes iguais.
-- ----------------------------------------------------------------------------
select
  lower(v.email)                as email,
  count(*)                      as quantos_registros,
  string_agg(v.nome, ' | ')     as nomes,
  string_agg(v.id::text, ' | ') as ids,
  string_agg(
    (select count(*)::text from public.leads l where l.vendedor_id = v.id),
    ' | '
  )                             as negocios_em_cada_um
from public.vendedores v
group by lower(v.email)
having count(*) > 1
order by count(*) desc;

-- ----------------------------------------------------------------------------
-- 3) NEGÓCIOS ÓRFÃOS — apontam para um vendedor que ninguém enxerga
--
--    São negócios gravados num `vendedor_id` que não é o `vendedor_ref` de
--    nenhum colaborador. Ficam invisíveis para todo mundo, menos admin.
-- ----------------------------------------------------------------------------
select
  v.nome            as vendedor_no_cadastro,
  v.email,
  case when coalesce(v.ativo, true) then 'ativo' else 'inativo' end as cadastro,
  count(l.id)       as negocios_presos,
  'nenhum colaborador tem vendedor_ref = ' || v.id::text as detalhe
from public.leads l
join public.vendedores v on v.id = l.vendedor_id
where not exists (
  select 1 from public.profiles p where p.vendedor_ref = l.vendedor_id
)
group by v.id, v.nome, v.email, v.ativo
order by count(l.id) desc;

-- ----------------------------------------------------------------------------
-- 4) A LISTA QUE O MODAL "COMPARTILHAR" MOSTRA HOJE
--
--    Repare se aparece alguém repetido, ou alguém que já saiu da empresa.
-- ----------------------------------------------------------------------------
select
  v.nome,
  v.email,
  case when coalesce(v.ativo, true) then 'ativo' else 'INATIVO' end as cadastro_vendedor,
  case
    when p.id is null then 'SEM LOGIN -> quem receber aqui nunca vai ver'
    when not coalesce(p.ativo, true) then 'LOGIN BLOQUEADO'
    else 'ok'
  end as login,
  (select count(*) from public.leads l where l.vendedor_id = v.id) as negocios
from public.vendedores v
left join public.profiles p on p.vendedor_ref = v.id
order by v.nome;
