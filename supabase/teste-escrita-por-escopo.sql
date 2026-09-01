-- ============================================================================
-- TESTE — o consultor consegue escrever num negócio que recebeu?
--
-- Roda como a PRÓPRIA consultora (não com poder de administrador), com a
-- regra de acesso LIGADA, e desfaz tudo no fim. Não altera nada.
--
-- Cole inteiro no SQL Editor e rode. O resultado sai como tabela.
-- ============================================================================

begin;

do $$
declare
  v_id     uuid;
  v_ref    uuid;
  v_lead   uuid;
  v_linhas int;
begin
  select id, vendedor_ref into v_id, v_ref
  from public.profiles where nome ilike '%julian%' limit 1;

  -- um negócio que é DELA mas que ela não cadastrou (ou seja: transferido)
  select id into v_lead
  from public.leads
  where vendedor_id = v_ref
  order by criado_em desc
  limit 1;

  create temp table resultado_teste(etapa text, valor text) on commit drop;

  if v_lead is null then
    insert into resultado_teste values ('ERRO', 'Nenhum negócio no nome dela para testar');
    return;
  end if;

  -- passa a responder como ela, COM a regra de acesso valendo
  perform set_config('request.jwt.claims', json_build_object('sub', v_id)::text, true);
  perform set_config('role', 'authenticated', true);

  update public.leads
     set observacao = coalesce(observacao, '') || ' [teste]'
   where id = v_lead;
  get diagnostics v_linhas = row_count;

  perform set_config('role', 'postgres', true);

  insert into resultado_teste values
    ('consultora testada', coalesce((select nome from public.profiles where id = v_id), '?')),
    ('negocio testado', v_lead::text),
    ('linhas gravadas', v_linhas::text),
    ('veredito', case when v_linhas > 0
                      then 'OK — ela consegue escrever no negocio que recebeu'
                      else 'BLOQUEADO — a regra de escrita ainda recusa' end);
end $$;

select * from resultado_teste;

rollback;
