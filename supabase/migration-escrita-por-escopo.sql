-- ============================================================================
-- LB CRM — QUEM PODE VER O NEGÓCIO PODE TRABALHAR NELE
--
-- O PROBLEMA
--
-- A regra de ESCRITA em `leads` era:
--
--   org_id = current_org_id() AND (is_gestor() OR owner_id = auth.uid())
--
-- Ou seja: só grava quem é gestor ou quem CADASTROU o registro. Ficou de
-- antes de existir escopo por consultor — a regra de LEITURA já tinha sido
-- modernizada para `pode_ver_vendedor(vendedor_id)`, a de escrita não.
--
-- Consequência no dia a dia: o consultor escreve normalmente nos negócios que
-- ele mesmo cadastrou, e é recusado em TODOS os que o admin transferiu para
-- ele — comentário, mudança de etapa, valor, telefone. E, até a correção de
-- hoje, isso acontecia em SILÊNCIO: o Postgres não devolve erro quando a
-- regra recusa, devolve "0 linhas alteradas". A tela dizia "salvo" e nada era
-- salvo.
--
-- A CORREÇÃO
--
-- A escrita passa a usar a MESMA regra da leitura. Quem enxerga o negócio
-- pelo escopo pode trabalhar nele — que é o significado de ser o responsável.
--
-- ISTO NÃO AFROUXA A SEGURANÇA; APERTA:
--
--   ANTES  qualquer gestor gravava em QUALQUER negócio da empresa, mesmo os
--          que ele nem pode ver (supervisor de outra equipe, por exemplo).
--   AGORA  cada um grava exatamente no que enxerga: admin e coordenador em
--          tudo, supervisor e líder na equipe deles, consultor no que é dele.
--
-- O QUE NÃO MUDA
--
-- DELETE fica como está (gestor ou quem cadastrou). Apagar é destrutivo e
-- merece ser mais restrito que editar — de propósito.
-- INSERT fica como está.
--
-- 100% IDEMPOTENTE.
-- ============================================================================

-- Remove só a policy de UPDATE (qualquer que seja o nome dela) e recria.
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'leads' and cmd = 'UPDATE'
  loop
    execute format('drop policy %I on public.leads;', pol.policyname);
  end loop;
end $$;

create policy "leads escrita por escopo" on public.leads
  for update
  to authenticated
  using      (org_id = public.current_org_id() and public.pode_ver_vendedor(vendedor_id))
  with check (org_id = public.current_org_id() and public.pode_ver_vendedor(vendedor_id));

-- ============================================================================
-- VERIFICAÇÃO — a regra de escrita tem que ser igual à de leitura
-- ============================================================================
select cmd as operacao, policyname as regra, qual as condicao
  from pg_policies
 where schemaname = 'public' and tablename = 'leads'
   and cmd in ('SELECT', 'UPDATE')
 order by cmd;
