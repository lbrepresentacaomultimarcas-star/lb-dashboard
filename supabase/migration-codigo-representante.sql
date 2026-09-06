-- ============================================================================
-- LB CRM — PREFIXO "REP" PARA REPRESENTANTE
--
-- A trilha da operação é: Vendedor → Líder → Supervisor → Representante.
--
-- "Representante" usa o papel `coordenador`, que já existia na hierarquia e
-- estava SEM USO. Reaproveitar em vez de criar um papel novo evita mexer na
-- constraint do banco, no motor de escopo e em toda a RBAC já testada — o
-- nome muda, a engrenagem não. Nenhuma permissão é alterada.
--
-- Só o PREFIXO do código muda: COORD → REP.
--
-- Não há ninguém com papel `coordenador` hoje, então nenhum código existente
-- é afetado. Ainda assim, o UPDATE abaixo cobre o caso — e é escrito de forma
-- a nunca colidir com um REP que já exista.
--
-- 100% IDEMPOTENTE. Não toca em login, senha, e-mail nem liberação.
-- ============================================================================

create or replace function public.prefixo_codigo(p_papel text)
returns text
language sql
immutable
as $$
  select case p_papel
    when 'admin'       then 'ADM'
    when 'coordenador' then 'REP'   -- Representante: topo da trilha comercial
    when 'supervisor'  then 'SUP'
    when 'lider'       then 'LID'
    else 'V'
  end;
$$;

-- Códigos COORD que porventura existam viram REP, mantendo o número.
-- O `where not exists` impede que a troca esbarre num REP já usado.
update public.profiles p
   set codigo_acesso = 'REP' || substring(upper(p.codigo_acesso) from '^COORD(\d+)$')
 where upper(p.codigo_acesso) ~ '^COORD\d+$'
   and not exists (
     select 1 from public.profiles q
     where upper(q.codigo_acesso)
           = 'REP' || substring(upper(p.codigo_acesso) from '^COORD(\d+)$')
   );

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'prefixo de Representante' as item, public.prefixo_codigo('coordenador') as valor
union all
select 'prefixo de Supervisor', public.prefixo_codigo('supervisor')
union all
select 'prefixo de Líder', public.prefixo_codigo('lider')
union all
select 'prefixo de Vendedor', public.prefixo_codigo('vendedor')
union all
select 'ainda restam códigos COORD (tem que ser 0)',
       count(*)::text from public.profiles where upper(codigo_acesso) ~ '^COORD\d+$'
union all
select 'códigos repetidos (tem que ser 0)', count(*)::text
  from (select upper(codigo_acesso) c from public.profiles
         where codigo_acesso is not null group by 1 having count(*) > 1) x;
