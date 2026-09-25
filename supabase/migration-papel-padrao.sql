-- ============================================================================
-- LB CRM — O PAPEL PADRÃO NÃO PODE SER "ADMIN"
--
-- Uma linha, e é a correção mais importante do cadastro de colaborador.
--
-- O QUE ACONTECEU (25/09/2026)
--
-- `profiles.papel` foi criado com `default 'admin'`. O perfil nasce de um
-- gatilho no momento em que o login é criado, e só depois a rota
-- /api/admin/invite grava o cargo escolhido, o código e a equipe. Quando esse
-- segundo passo não pega, o perfil fica com o padrão da tabela — ou seja, a
-- pessoa nasce ADMINISTRADORA, com acesso a financeiro, configurações e a
-- todos os dados da empresa.
--
-- Foi exatamente o que aconteceu com uma colaboradora cadastrada como
-- vendedora: ficou `papel = admin`, sem código e sem vínculo.
--
-- A REGRA QUE FICA
--
-- Falha de cadastro tem que cair para o acesso MAIS FRACO, nunca para o mais
-- forte. Com o padrão em 'vendedor', o pior caso vira "a pessoa vê menos do
-- que devia" — problema que se corrige na tela, sem risco.
--
-- Não altera nenhum colaborador existente: `set default` só vale para linhas
-- novas. A verificação no fim mostra os papéis atuais para você conferir.
-- ============================================================================

alter table public.profiles
  alter column papel set default 'vendedor';

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA
-- ----------------------------------------------------------------------------

-- 1) o padrão agora é 'vendedor'
select column_name,
       column_default as padrao_agora
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'profiles'
   and column_name = 'papel';

-- 2) quem é o quê hoje (nenhuma linha foi alterada por esta migration)
select papel,
       count(*) as quantos,
       string_agg(nome, ', ' order by nome) as pessoas
  from public.profiles
 group by papel
 order by papel;

-- 3) ninguém pode estar sem código ou com código repetido
select nome, papel, codigo_acesso, codigo_liberado
  from public.profiles
 where codigo_acesso is null
    or codigo_acesso in (select codigo_acesso
                           from public.profiles
                          where codigo_acesso is not null
                          group by codigo_acesso
                         having count(*) > 1)
 order by nome;
