-- ============================================================================
-- LB CRM — ANÁLISE DE PROPOSTAS: CADA UM VÊ O QUE É SEU
--
-- Relato: consultor e líder estão vendo as propostas de todo mundo.
--
-- A regra escrita em `migration-analises.sql` já é a correta
-- (`org_id = current_org_id() and pode_ver_vendedor(vendedor_id)`). Então o
-- problema está no ESTADO do banco, não no desenho — e há três estados
-- possíveis que produzem esse sintoma:
--
--   1. a RLS foi desligada em algum momento (sem RLS, todo mundo vê tudo);
--   2. a policy de leitura foi derrubada por alguma execução posterior;
--   3. `pode_ver_vendedor` está numa versão antiga.
--
-- Esta migration corrige os três de uma vez, sem depender de descobrir qual
-- era. Tudo é `create or replace` / re-`enable`: rodar duas vezes não faz mal.
--
-- E FECHA O LADO OPOSTO
--
-- Há um segundo defeito, silencioso: análises gravadas com `vendedor_id` NULO
-- não aparecem para NINGUÉM além do admin — nem para quem as criou. O
-- backfill no fim usa `criado_por` para devolver cada proposta ao seu dono.
--
-- Não altera layout, cards, status, simulador, fluxo de aprovação nem a Ficha.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RLS LIGADA. Sem isto, policy nenhuma vale.
-- ----------------------------------------------------------------------------
alter table public.analises            enable row level security;
alter table public.analise_documentos  enable row level security;
alter table public.analise_eventos     enable row level security;
alter table public.fichas              enable row level security;

-- ----------------------------------------------------------------------------
-- 2) POLICIES recriadas do zero, iguais às originais.
-- ----------------------------------------------------------------------------
do $rls$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and tablename in ('analises','analise_documentos','analise_eventos','fichas')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $rls$;

-- A PROPOSTA. `pode_ver_vendedor` é a mesma função que governa leads e vendas:
-- admin/representante veem tudo; supervisor, a equipe dele; líder e vendedor,
-- só o que é deles. Uma regra só para o CRM inteiro.
create policy "analises scope read" on public.analises
  for select to authenticated
  using (org_id = public.current_org_id() and public.pode_ver_vendedor(vendedor_id));

create policy "analises insert" on public.analises
  for insert to authenticated
  with check (org_id = public.current_org_id());

create policy "analises update" on public.analises
  for update to authenticated
  using (org_id = public.current_org_id() and public.pode_ver_vendedor(vendedor_id));

-- DOCUMENTOS: só os metadados, e só de análise que a pessoa já pode ver.
create policy "analise_documentos scope read" on public.analise_documentos
  for select to authenticated
  using (
    exists (select 1 from public.analises a
             where a.id = analise_id
               and a.org_id = public.current_org_id()
               and public.pode_ver_vendedor(a.vendedor_id))
  );

-- HISTÓRICO: lê quem pode ver a análise. Sem update nem delete — histórico
-- não se apaga.
create policy "analise_eventos scope read" on public.analise_eventos
  for select to authenticated
  using (
    exists (select 1 from public.analises a
             where a.id = analise_id
               and a.org_id = public.current_org_id()
               and public.pode_ver_vendedor(a.vendedor_id))
  );
create policy "analise_eventos insert" on public.analise_eventos
  for insert to authenticated
  with check (org_id = public.current_org_id());

-- FICHA: acompanha a análise. Ver a ficha de outro é ver a proposta de outro.
create policy "fichas scope read" on public.fichas
  for select to authenticated
  using (
    exists (select 1 from public.analises a
             where a.id = analise_id
               and a.org_id = public.current_org_id()
               and public.pode_ver_vendedor(a.vendedor_id))
  );
create policy "fichas insert" on public.fichas
  for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and exists (select 1 from public.analises a
                 where a.id = analise_id
                   and a.org_id = public.current_org_id()
                   and public.pode_ver_vendedor(a.vendedor_id))
  );
create policy "fichas update" on public.fichas
  for update to authenticated
  using (
    exists (select 1 from public.analises a
             where a.id = analise_id
               and a.org_id = public.current_org_id()
               and public.pode_ver_vendedor(a.vendedor_id))
  );

-- ----------------------------------------------------------------------------
-- 3) DONO DE VOLTA
--
-- Proposta com `vendedor_id` nulo some para todo mundo menos o admin — nem
-- quem a criou consegue ver. `criado_por` guarda o profile de quem criou;
-- dele se chega ao `vendedor_ref`, que é o dono de verdade.
--
-- Só preenche o que está vazio. Nada é reatribuído.
-- ----------------------------------------------------------------------------
update public.analises a
   set vendedor_id = p.vendedor_ref
  from public.profiles p
 where a.criado_por = p.id
   and a.vendedor_id is null
   and p.vendedor_ref is not null;

-- ============================================================================
-- VERIFICAÇÃO — o estado real, depois da correção
-- ============================================================================
select 'RLS ligada nas 4 tabelas (tem que ser 4)' as item, count(*)::text as valor
  from pg_tables
 where schemaname = 'public'
   and tablename in ('analises','analise_documentos','analise_eventos','fichas')
   and rowsecurity
union all
select 'policies de analises (tem que ser 3)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'analises'
union all
select 'propostas SEM dono (invisíveis p/ o consultor)', count(*)::text
  from public.analises where vendedor_id is null
union all
select 'propostas COM dono', count(*)::text
  from public.analises where vendedor_id is not null;

-- Quem enxerga quantas propostas, hoje:
select
  p.nome                                  as colaborador,
  p.papel                                 as cargo,
  (select count(*) from public.analises a
    where a.vendedor_id = p.vendedor_ref) as propostas_dele,
  case
    when p.papel in ('admin','coordenador')                then 'todas da empresa'
    when p.papel = 'supervisor' and p.equipe_id is not null then 'as dele + as da equipe'
    else 'apenas as dele'
  end                                     as enxerga
from public.profiles p
order by
  case p.papel when 'admin' then 0 when 'coordenador' then 1
               when 'supervisor' then 2 when 'lider' then 3 else 4 end,
  p.nome;
