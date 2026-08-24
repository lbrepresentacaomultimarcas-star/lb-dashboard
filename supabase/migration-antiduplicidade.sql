-- ============================================================================
-- LB CRM — ANTI-DUPLICIDADE DE LEADS POR TELEFONE
--
-- 100% ADITIVA e IDEMPOTENTE. Rode no SQL Editor do Supabase.
-- NÃO apaga nada. NÃO altera lead nenhum além de preencher a coluna nova.
--
-- ----------------------------------------------------------------------------
-- O QUE ESTAVA ERRADO
--
-- O webhook já procurava lead repetido, mas comparava TEXTO com TEXTO:
--
--     .eq("telefone", lead.telefone)
--
-- E o mesmo número entra em formatos diferentes conforme a porta:
--
--     Meta Ads          "+5579999571712"
--     Site / simulação  "(79) 99957-1712"
--     WhatsApp          "5579999571712"
--
-- Para o banco eram três pessoas. Foi assim que um mesmo cliente foi parar
-- com três consultores ao mesmo tempo.
--
-- ----------------------------------------------------------------------------
-- A REGRA
--
--   UM CLIENTE ATIVO = UM CONSULTOR RESPONSÁVEL.
--
-- Lead ENCERRADO não bloqueia: cliente que volta meses depois é contato novo
-- e legítimo. Quem bloqueia é só lead vivo.
-- ============================================================================

-- 1) CHAVE DO TELEFONE ------------------------------------------------------
--    Mesma regra de src/lib/telefone.ts — as duas TÊM que concordar, senão a
--    proteção vaza pela diferença. DDD + 8 últimos dígitos:
--      • o DDI (55) sai: "+5579…" e "79…" são a mesma pessoa;
--      • o nono dígito sai: "9957-1712" e "99957-1712" são a mesma linha;
--      • o DDD fica: sem ele, um número de Aracaju colidiria com um de SP, e
--        bloquear cliente legítimo é pior do que deixar passar um duplicado.
create or replace function public.lb_chave_telefone(t text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare d text;
begin
  d := regexp_replace(coalesce(t, ''), '\D', '', 'g');
  if d = '' then return ''; end if;
  if length(d) > 13 and left(d, 2) = '00' then
    d := substr(d, 3);   -- prefixo internacional discado
  end if;
  if length(d) between 12 and 13 and left(d, 2) = '55' then
    d := substr(d, 3);
  end if;
  if length(d) in (10, 11) then
    return left(d, 2) || right(d, 8);
  end if;
  return d;  -- fora do formato brasileiro: compara como veio
end $$;

-- 2) COLUNA + BACKFILL ------------------------------------------------------
alter table public.central_leads
  add column if not exists telefone_chave text;

comment on column public.central_leads.telefone_chave is
  'DDD + 8 últimos dígitos do telefone. Identidade do cliente para a anti-duplicidade. Preenchida por trigger.';

update public.central_leads
   set telefone_chave = public.lb_chave_telefone(telefone)
 where telefone_chave is distinct from public.lb_chave_telefone(telefone);

create index if not exists central_leads_telefone_chave_idx
  on public.central_leads (org_id, telefone_chave)
  where telefone_chave <> '';

-- 3) A PROTEÇÃO -------------------------------------------------------------
--    Vale para QUALQUER caminho de escrita — webhook da Meta, site, importação,
--    cadastro manual — porque está no banco, não no aplicativo.
--
--    INSERT que colide NÃO dá erro: o registro é DESCARTADO e o contato novo
--    vira evento no histórico do lead que já existe. É de propósito. Se
--    levantasse exceção, o formulário do site quebraria na cara de um cliente
--    real; e o pedido era justamente "registrar o novo evento no histórico do
--    lead existente".
--
--    UPDATE que colide DÁ erro: mudar o telefone de um lead para o de outro
--    lead ativo é ação de gente, e gente precisa ser avisada.
create or replace function public.central_leads_antiduplicidade()
returns trigger
language plpgsql
as $$
declare
  existente record;
begin
  new.telefone_chave := public.lb_chave_telefone(new.telefone);

  -- sem telefone não dá para afirmar que é a mesma pessoa
  if new.telefone_chave = '' then
    return new;
  end if;
  -- lead encerrado, excluído ou de teste não disputa dono
  if new.encerrado_em is not null
     or new.excluido_em is not null
     or coalesce(new.teste, false) then
    return new;
  end if;

  select id, nome, vendedor_id, status, recebido_em
    into existente
    from public.central_leads
   where org_id = new.org_id
     and telefone_chave = new.telefone_chave
     and id <> new.id
     and encerrado_em is null
     and excluido_em is null
     and coalesce(teste, false) = false
   order by recebido_em asc
   limit 1;

  if not found then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.central_leads_eventos (org_id, central_lead_id, tipo, campo, valor_novo, detalhe, autor_nome)
    values (
      new.org_id,
      existente.id,
      'contato_repetido',
      'telefone',
      new.telefone,
      format('Novo contato do mesmo telefone (origem: %s). Não virou lead separado.', coalesce(new.origem, 'desconhecida')),
      'Sistema · anti-duplicidade'
    );
    return null;  -- descarta a linha nova, sem erro para quem escreveu
  end if;

  raise exception using
    errcode = 'unique_violation',
    message = format('Já existe lead ativo com este telefone (%s).', new.telefone),
    hint = 'Use REDISTRIBUIR no lead existente em vez de criar outro.';
end $$;

drop trigger if exists trg_central_leads_antiduplicidade on public.central_leads;
create trigger trg_central_leads_antiduplicidade
  before insert or update of telefone, encerrado_em, excluido_em, teste
  on public.central_leads
  for each row execute function public.central_leads_antiduplicidade();

-- ============================================================================
-- RELATÓRIO — o que JÁ está duplicado na base
--
-- A trigger só cuida do que entra de agora em diante; o que já está duplicado
-- continua como está, de propósito. Decidir qual consultor fica com o cliente
-- é decisão de gestão, não de migration.
-- ============================================================================
select
  telefone_chave                                            as "chave",
  count(*)                                                  as "linhas ativas",
  count(distinct vendedor_id) filter (where vendedor_id is not null) as "consultores diferentes",
  string_agg(distinct telefone, ' | ')                       as "formatos gravados",
  string_agg(nome || ' [' || status || ']', ' | ' order by recebido_em) as "leads"
from public.central_leads
where encerrado_em is null
  and excluido_em is null
  and coalesce(teste, false) = false
  and telefone_chave <> ''
group by org_id, telefone_chave
having count(*) > 1
order by count(distinct vendedor_id) desc, count(*) desc;
