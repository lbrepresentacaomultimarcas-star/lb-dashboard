-- ============================================================================
-- LB CRM — CADA POSIÇÃO DA FILA É DE UMA PESSOA SÓ
--
-- A fila de distribuição automática já impede a mesma pessoa de entrar duas
-- vezes (a chave primária é org_id + vendedor_id). O que faltava era o
-- contrário: impedir que DUAS pessoas fiquem com a MESMA posição.
--
-- COMO ISSO ACONTECERIA
--
-- A posição de quem entra é calculada como "a maior que existe hoje + 1". Se
-- duas pessoas forem adicionadas no mesmo instante — dois cliques, duas abas,
-- ou o admin e outro admin ao mesmo tempo — as duas leem a mesma posição
-- máxima e nascem com o mesmo número.
--
-- O ESTRAGO SERIA SILENCIOSO
--
-- O rodízio escolhe "a próxima posição maior que a última entregue". Com duas
-- pessoas na mesma posição, uma delas passa a ser pulada em todas as voltas —
-- sem erro, sem aviso, e a conta só aparece semanas depois, quando alguém
-- estranha que um consultor recebe menos que os outros.
--
-- Com este índice, a segunda inserção FALHA na hora e a tela mostra o erro.
-- Errar alto é melhor que errar quieto.
--
-- Não altera nenhum dado: só cria o índice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) ANTES: existe alguma posição repetida hoje?
--    Se esta consulta trouxer alguma linha, PARE e me chame — criar o índice
--    vai falhar, e o certo é decidir quem fica com qual posição.
-- ----------------------------------------------------------------------------
select org_id, ordem, count(*) as quantos
  from public.central_fila_membros
 group by org_id, ordem
having count(*) > 1;

-- ----------------------------------------------------------------------------
-- 2) A TRAVA
-- ----------------------------------------------------------------------------
create unique index if not exists central_fila_membros_ordem_unica
  on public.central_fila_membros (org_id, ordem);

-- ----------------------------------------------------------------------------
-- 3) CONFERÊNCIA — como a fila está agora, na ordem do rodízio
-- ----------------------------------------------------------------------------
select m.ordem,
       v.nome,
       v.ativo as cadastro_ativo,
       (select count(*) from public.central_fila_entregas e
         where e.vendedor_id = m.vendedor_id) as ja_recebeu,
       exists (select 1 from public.profiles p
                where p.vendedor_ref = m.vendedor_id
                  and p.ativo is not false) as tem_login_ligado
  from public.central_fila_membros m
  join public.vendedores v on v.id = m.vendedor_id
 order by m.ordem;
