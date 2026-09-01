-- ============================================================================
-- LB CRM — DISTRIBUIÇÃO EM MASSA DE NEGÓCIOS (Pipeline)
--
-- POR QUE ISTO É UMA FUNÇÃO DO BANCO, E NÃO UM LAÇO NO APP
--
-- Um laço no aplicativo mandando 30 UPDATEs faz exatamente o que não pode
-- acontecer: o 12º dá erro e ficam 11 distribuídos e 19 não. Aqui tudo roda
-- dentro de UMA transação — ou todos entram, ou nenhum entra.
--
-- E resolve a corrida de graça: dois admins clicando junto, duplo clique,
-- duas abas abertas. O `for update skip locked` faz cada negócio ser pego por
-- uma execução só; a segunda simplesmente não o encontra livre.
--
-- ----------------------------------------------------------------------------
-- OS TRÊS NÍVEIS DE UM NEGÓCIO
--
--   1. SEM RESPONSÁVEL      → entra na distribuição sempre.
--
--   2. COM CONSULTOR BLOQUEADO → entra também, e por decisão de negócio:
--      um consultor bloqueado não trabalha mais aquele contato. Deixar a
--      carteira dele congelada é ver o cliente esfriar e perder o dinheiro
--      que foi gasto para trazê-lo. Bloquear uma pessoa não pode sequestrar
--      os clientes junto. Estes são contados à parte, como "recuperados".
--
--   3. COM CONSULTOR ATIVO  → só sai do lugar se o admin pedir
--      explicitamente (`p_incluir_atribuidos`). É trabalho de alguém que
--      está tocando o negócio agora; não se tira por acidente.
--
-- ----------------------------------------------------------------------------
-- O QUE A FUNÇÃO GARANTE (não são regras da tela — a tela pode ser burlada):
--   • só ADMIN da própria empresa executa;
--   • consultor bloqueado ou sem login NÃO recebe nada;
--   • o mesmo negócio nunca vai para dois consultores;
--   • divisão equilibrada, com a sobra espalhada;
--   • histórico gravado junto, na mesma transação.
--
-- 100% ADITIVA: cria/atualiza uma função. Não altera tabela, policy ou dado.
-- ============================================================================

drop function if exists public.distribuir_leads(uuid[], uuid[]);

create or replace function public.distribuir_leads(
  p_lead_ids            uuid[],
  p_vendedor_ids        uuid[],
  p_incluir_atribuidos  boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_papel       text;
  v_ativo       boolean;
  v_org         uuid;
  v_email       text;
  v_validos     uuid[];
  v_n           int;
  v_i           int := 0;
  v_lead        record;
  v_destino     uuid;
  v_feitos      int := 0;
  v_recuperados int := 0;
  v_preservados int := 0;
  v_resumo      jsonb := '[]'::jsonb;
  v_contagem    jsonb := '{}'::jsonb;  -- {vendedor_id: quantos}
begin
  -- ------------------------------------------------------------------
  -- 1) Quem está pedindo? (security definer passa por cima do RLS, então
  --    a conferência precisa ser explícita aqui.)
  -- ------------------------------------------------------------------
  select papel, coalesce(ativo, true), coalesce(vendedor_id, id), email
    into v_papel, v_ativo, v_org, v_email
  from public.profiles
  where id = auth.uid();

  if not found then
    return jsonb_build_object('erro', 'Sessão não encontrada.');
  end if;
  if not v_ativo then
    return jsonb_build_object('erro', 'Seu acesso foi bloqueado. Entre em contato com o administrador.');
  end if;
  if v_papel <> 'admin' then
    -- Preparado para o dia em que supervisor puder distribuir: basta abrir
    -- esta condição. Hoje, de propósito, só admin.
    return jsonb_build_object('erro', 'Apenas o administrador pode distribuir negócios.');
  end if;

  if p_lead_ids is null or array_length(p_lead_ids, 1) is null then
    return jsonb_build_object('erro', 'Nenhum negócio selecionado.');
  end if;

  -- ------------------------------------------------------------------
  -- 2) Quais consultores realmente podem RECEBER.
  --
  --    Não basta o cadastro de vendedor estar ativo: o LOGIN dele também
  --    precisa estar liberado. Mandar negócio para quem está bloqueado é
  --    esconder o cliente de todo mundo — foi exatamente o que aconteceu.
  -- ------------------------------------------------------------------
  select array_agg(v.id order by array_position(p_vendedor_ids, v.id))
    into v_validos
  from public.vendedores v
  join public.profiles p on p.vendedor_ref = v.id
  where v.id = any(p_vendedor_ids)
    and v.org_id = v_org
    and coalesce(v.ativo, true)
    and coalesce(p.ativo, true);

  v_n := coalesce(array_length(v_validos, 1), 0);
  if v_n = 0 then
    return jsonb_build_object(
      'erro', 'Nenhum consultor válido na seleção. Consultores bloqueados ou sem login não recebem negócios.'
    );
  end if;

  -- ------------------------------------------------------------------
  -- 3) Distribui.
  --
  --    `dono_bloqueado`: o negócio tem responsável, mas esse responsável
  --    não tem login ativo (ou não tem login nenhum). Na prática ninguém
  --    está trabalhando esse cliente.
  --
  --    `skip locked`: se outra distribuição estiver segurando a linha
  --    neste instante, esta aqui não espera nem duplica.
  -- ------------------------------------------------------------------
  for v_lead in
    select
      l.id,
      l.vendedor_id is null as sem_dono,
      (l.vendedor_id is not null and not exists (
         select 1 from public.profiles p
         where p.vendedor_ref = l.vendedor_id
           and coalesce(p.ativo, true)
       )) as dono_bloqueado
    from public.leads l
    where l.id = any(p_lead_ids)
      and l.org_id = v_org
    order by l.criado_em
    for update skip locked
  loop
    -- Negócio com consultor ATIVO só se move a pedido explícito.
    if not v_lead.sem_dono and not v_lead.dono_bloqueado and not p_incluir_atribuidos then
      v_preservados := v_preservados + 1;
      continue;
    end if;

    v_destino := v_validos[(v_i % v_n) + 1];

    -- A linha já está travada pelo `for update` acima: ninguém consegue
    -- mexer nela até esta transação terminar. É essa trava — e não uma
    -- condição no WHERE — que impede duplo clique e dois admins ao mesmo
    -- tempo de atribuírem o mesmo negócio duas vezes.
    update public.leads
       set vendedor_id = v_destino
     where id = v_lead.id;

    if found then
      v_i      := v_i + 1;
      v_feitos := v_feitos + 1;
      if v_lead.dono_bloqueado then
        v_recuperados := v_recuperados + 1;
      end if;

      -- conta aqui, na hora: é o único lugar que sabe a verdade. Remontar
      -- isso depois pelo histórico, casando por NOME, quebraria justamente
      -- quando há dois cadastros com o mesmo nome.
      v_contagem := jsonb_set(
        v_contagem,
        array[v_destino::text],
        to_jsonb(coalesce((v_contagem ->> v_destino::text)::int, 0) + 1)
      );

      insert into public.audit_log (org_id, acao, entidade, entidade_id, usuario_email, detalhes)
      values (
        v_org,
        'distribuir_massa',
        'lead',
        v_lead.id,
        v_email,
        case
          when v_lead.dono_bloqueado then 'Recuperado de consultor bloqueado → '
          when v_lead.sem_dono       then 'Distribuição em massa → '
          else 'Redistribuído (admin) → '
        end ||
        coalesce((select nome from public.vendedores where id = v_destino), v_destino::text)
      );
    end if;
  end loop;

  -- ------------------------------------------------------------------
  -- 4) Quanto cada um recebeu — direto do que foi contado no laço.
  -- ------------------------------------------------------------------
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'vendedorId', c.key,
             'nome',       coalesce(v.nome, c.key),
             'quantos',    c.value::int
           ) order by (c.value::int) desc, v.nome),
           '[]'::jsonb
         )
    into v_resumo
  from jsonb_each_text(v_contagem) as c(key, value)
  left join public.vendedores v on v.id = c.key::uuid;

  return jsonb_build_object(
    'distribuidos',  v_feitos,
    'recuperados',   v_recuperados,
    'jaTinhamDono',  v_preservados,
    'porConsultor',  v_resumo
  );
end;
$$;

revoke all on function public.distribuir_leads(uuid[], uuid[], boolean) from public;
grant execute on function public.distribuir_leads(uuid[], uuid[], boolean) to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'função distribuir_leads criada' as item, count(*)::text as valor
  from pg_proc where proname = 'distribuir_leads'
union all
select 'negócios presos com consultor bloqueado (para recuperar)',
       count(*)::text
  from public.leads l
 where l.vendedor_id is not null
   and not exists (
     select 1 from public.profiles p
     where p.vendedor_ref = l.vendedor_id and coalesce(p.ativo, true)
   );
