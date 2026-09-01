-- ============================================================================
-- TESTE DO BLOQUEIO IMEDIATO  —  seguro, não altera nada
--
-- Roda dentro de uma transação que termina em ROLLBACK: o colaborador é
-- bloqueado, testado e destravado automaticamente. Nada fica gravado, mesmo
-- se der erro no meio.
--
-- COMO RODAR: cole INTEIRO no SQL Editor do Supabase e execute de uma vez.
-- Ele escolhe sozinho um colaborador que NÃO seja admin.
--
-- O que ele prova, do jeito que o banco realmente enxerga:
--   • ativo   → current_org_id() devolve a org e pode_ver_vendedor() libera;
--   • BLOQUEADO → current_org_id() devolve NULL e pode_ver_vendedor() nega —
--     e é isso que derruba todas as policies de todas as tabelas.
-- ============================================================================

begin;

do $$
declare
  v_id     uuid;
  v_nome   text;
  v_ref    uuid;
  v_org    uuid;
  v_pode   boolean;
  v_falhas int := 0;
begin
  -- Um colaborador comum qualquer (nunca um admin, para não testar com você).
  select id, nome, vendedor_ref into v_id, v_nome, v_ref
  from public.profiles
  where papel <> 'admin'
  order by criado_em
  limit 1;

  if v_id is null then
    raise notice 'SEM COLABORADOR NAO-ADMIN PARA TESTAR. Crie um consultor e rode de novo.';
    return;
  end if;

  raise notice '--- Testando com: % ---', coalesce(v_nome, v_id::text);

  -- Finge ser essa pessoa: é assim que auth.uid() responde nas funções.
  perform set_config('request.jwt.claims', json_build_object('sub', v_id)::text, true);

  -- ============ 1) ATIVO: tem que funcionar normalmente ============
  update public.profiles set ativo = true where id = v_id;

  v_org  := public.current_org_id();
  v_pode := public.pode_ver_vendedor(v_ref);

  if v_org is null then
    raise notice 'FALHA  ativo: current_org_id() veio NULL (deveria ter org)';
    v_falhas := v_falhas + 1;
  else
    raise notice 'OK     ativo: current_org_id() = %', v_org;
  end if;

  if v_ref is not null and v_pode is not true then
    raise notice 'FALHA  ativo: pode_ver_vendedor() negou os proprios dados';
    v_falhas := v_falhas + 1;
  else
    raise notice 'OK     ativo: pode_ver_vendedor(proprio) = %', v_pode;
  end if;

  -- ============ 2) BLOQUEADO: tem que travar tudo ============
  update public.profiles set ativo = false where id = v_id;

  v_org  := public.current_org_id();
  v_pode := public.pode_ver_vendedor(v_ref);

  if v_org is not null then
    raise notice 'FALHA  bloqueado: current_org_id() = % (deveria ser NULL)', v_org;
    v_falhas := v_falhas + 1;
  else
    raise notice 'OK     bloqueado: current_org_id() = NULL  -> nenhuma policy casa';
  end if;

  if v_pode is not false then
    raise notice 'FALHA  bloqueado: pode_ver_vendedor() = % (deveria ser false)', v_pode;
    v_falhas := v_falhas + 1;
  else
    raise notice 'OK     bloqueado: pode_ver_vendedor() = false';
  end if;

  if public.usuario_ativo() is not false then
    raise notice 'FALHA  bloqueado: usuario_ativo() nao devolveu false';
    v_falhas := v_falhas + 1;
  else
    raise notice 'OK     bloqueado: usuario_ativo() = false';
  end if;

  -- ============ 3) REATIVADO: tem que voltar ao normal ============
  update public.profiles set ativo = true where id = v_id;

  if public.current_org_id() is null then
    raise notice 'FALHA  reativado: continuou bloqueado';
    v_falhas := v_falhas + 1;
  else
    raise notice 'OK     reativado: acesso voltou';
  end if;

  if v_falhas = 0 then
    raise notice '=========== TODOS OS TESTES PASSARAM ===========';
  else
    raise notice '=========== % FALHA(S) ===========', v_falhas;
  end if;
end $$;

-- Desfaz tudo: ninguém fica bloqueado por causa do teste.
rollback;
