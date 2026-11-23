-- LB Dashboard — Consultor escolhe o próprio apelido entre os AUTORIZADOS.
--
-- A tabela `temas` só aceita escrita do admin. Esta função é a única exceção, e
-- bem estreita: altera somente a entrada do PRÓPRIO consultor, e só aceita um
-- apelido que o admin já colocou na lista de opções dele.
--
-- Não cria tabela, não altera dados comerciais. Idempotente.
-- Rodar no SQL Editor do Supabase do LB.

create or replace function public.escolher_meu_apelido(
  p_slug text,
  p_apelido text default null,
  p_preferencia text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_tema uuid;
  v_estilo jsonb;
  v_entrada jsonb;
  v_apelido text := nullif(trim(coalesce(p_apelido, '')), '');
begin
  select vendedor_ref::text into v_ref
    from public.profiles
   where id = auth.uid()
     and coalesce(ativo, true)
     and coalesce(codigo_liberado, true);

  if v_ref is null then
    raise exception 'Seu usuário não está vinculado a um consultor.';
  end if;

  select id, estilo into v_tema, v_estilo
    from public.temas
   where org_id = public.current_org_id() and slug = p_slug
   for update;

  if v_tema is null then
    raise exception 'Tema não encontrado.';
  end if;

  v_entrada := coalesce(v_estilo -> 'apelidos' -> v_ref, '{}'::jsonb);

  if v_apelido is not null then
    if not coalesce(v_entrada -> 'opcoes', '[]'::jsonb) ? v_apelido then
      raise exception 'Este apelido não foi autorizado pelo administrador.';
    end if;
    v_entrada := v_entrada || jsonb_build_object('apelido', v_apelido);
  end if;

  if p_preferencia is not null then
    v_entrada := v_entrada || jsonb_build_object('preferencia', left(trim(p_preferencia), 120));
  end if;

  update public.temas
     set estilo = v_estilo || jsonb_build_object(
           'apelidos',
           coalesce(v_estilo -> 'apelidos', '{}'::jsonb) || jsonb_build_object(v_ref, v_entrada)
         ),
         atualizado_em = now()
   where id = v_tema;
end;
$$;

revoke all on function public.escolher_meu_apelido(text, text, text) from public;
grant execute on function public.escolher_meu_apelido(text, text, text) to authenticated;

-- COMO DESFAZER:
--   drop function public.escolher_meu_apelido(text, text, text);
