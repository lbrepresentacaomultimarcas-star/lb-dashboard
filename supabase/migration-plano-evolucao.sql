-- ============================================================================
-- LB CRM — PLANO PESSOAL DE EVOLUÇÃO
--
-- Uma linha por colaborador, escrita por ele mesmo: para onde quer ir, em
-- quanto tempo, qual a meta e qual o foco.
--
-- ISTO NÃO PROMOVE NINGUÉM. Não muda cargo, não muda permissão, não dispara
-- nada. É a intenção da pessoa, guardada — e um assunto pronto para a conversa
-- de desenvolvimento com o administrador. A promoção continua sendo decisão
-- da administração.
--
-- A META PODE SER MEDIDA OU NÃO
--
-- `metrica` + `alvo` -> dá para calcular progresso real (6 de 10 = 60%).
-- Só texto livre     -> nenhum percentual é exibido. Inventar % em cima de
--                       uma frase seria mentira com aparência de precisão.
--
-- 100% ADITIVA. Tabela nova; nada existente é tocado.
-- ============================================================================

create table if not exists public.planos_evolucao (
  -- o próprio profile é a chave: cada pessoa tem UM plano, não um histórico
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  org_id       uuid not null default public.current_org_id(),
  objetivo     text,          -- o cargo que ela quer alcançar
  prazo_meses  int,
  meta_texto   text,
  metrica      text,          -- fechados | agendamentos | propostas | oportunidades
  alvo         numeric,
  foco         text,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz
);

alter table public.planos_evolucao enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'planos_evolucao'
  loop
    execute format('drop policy %I on public.planos_evolucao;', pol.policyname);
  end loop;
end $$;

/*
 * QUEM LÊ: a própria pessoa, sempre. E quem já pode ver os dados dela pelo
 * escopo — reusa `pode_ver_vendedor`, a mesma regra do resto do CRM, em vez
 * de inventar uma segunda ideia de "quem enxerga quem".
 *
 * Na prática: o consultor vê o dele; o admin vê o de todos; o supervisor vê
 * o da equipe dele; o líder vê só o dele.
 */
create policy "planos leitura por escopo" on public.planos_evolucao
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (
      org_id = public.current_org_id()
      and public.pode_ver_vendedor(
        (select vendedor_ref from public.profiles where id = profile_id)
      )
    )
  );

-- QUEM ESCREVE: só o dono. O plano é dele; nem o admin escreve por cima.
create policy "planos escrita do dono" on public.planos_evolucao
  for insert to authenticated
  with check (profile_id = auth.uid() and org_id = public.current_org_id());

create policy "planos edicao do dono" on public.planos_evolucao
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'tabela planos_evolucao criada (tem que ser 1)' as item, count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public' and table_name = 'planos_evolucao'
union all
select 'policies criadas (tem que ser 3)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'planos_evolucao'
union all
select 'planos já cadastrados', count(*)::text from public.planos_evolucao;
