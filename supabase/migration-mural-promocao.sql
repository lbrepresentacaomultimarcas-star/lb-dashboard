-- LB CRM — MURAL DE PROMOÇÃO (Dashboard)
--
-- RODE PRIMEIRO `ensaio-mural-promocao.sql`. Só rode este se o ensaio terminar
-- com "FALHAS: 0". Precisa da Promoção Agendada já aplicada.
--
-- 100% ADITIVA:
--   • `promocoes_agendadas` ganha `foto_url` e `legenda` (vazias);
--   • `lb_dev_mural_promocoes()`: a equipe inteira vê, no topo do Dashboard,
--     quem foi promovido nos últimos 3 dias — só nome, cargo, data, foto e
--     legenda (a orientação de preparação continua privada).
-- A foto é enviada pelo próprio promovido ou pelo admin, por uma rota do
-- servidor que confere quem está enviando.
-- É um único bloco: ou aplica tudo, ou não aplica nada.

do $lb$
begin
  execute 'alter table public.promocoes_agendadas add column if not exists foto_url text';
  execute 'alter table public.promocoes_agendadas add column if not exists legenda text';

  -- o colaborador continua só podendo marcar que viu a comemoração:
  -- foto e legenda também entram na lista do que só a administração/servidor muda
  execute $q$
    create or replace function public.lb_dev_promocao_antes()
    returns trigger language plpgsql security definer set search_path = public as $fn$
    begin
      if tg_op = 'INSERT' then
        new.org_id := public.lb_dev_org_de(new.profile_id);
        new.criado_por := auth.uid();
        new.cargo_atual := (select papel from public.profiles where id = new.profile_id);
        new.status := 'agendada';
        new.realizada_em := null;
        new.comemoracao_vista_em := null;
        return new;
      end if;
      new.atualizado_em := now();
      if auth.uid() is null or public.lb_dev_eh_admin(old.org_id) then
        if new.status = 'realizada' and old.status is distinct from 'realizada' then
          new.realizada_em := now();
          new.comemoracao_vista_em := null;
        end if;
        return new;
      end if;
      if row(new.profile_id, new.org_id, new.cargo_atual, new.cargo_novo, new.data_hora, new.mensagem,
             new.status, new.criado_por, new.realizada_em, new.foto_url, new.legenda)
         is distinct from row(old.profile_id, old.org_id, old.cargo_atual, old.cargo_novo, old.data_hora,
             old.mensagem, old.status, old.criado_por, old.realizada_em, old.foto_url, old.legenda) then
        raise exception 'Só a administração altera a promoção.';
      end if;
      new.comemoracao_vista_em := case when old.comemoracao_vista_em is null and new.comemoracao_vista_em is not null
                                       then now() else old.comemoracao_vista_em end;
      return new;
    end
    $fn$
  $q$;

  -- Mural: promoções feitas nos últimos 3 dias, para todos da empresa
  execute $q$
    create or replace function public.lb_dev_mural_promocoes()
    returns table (id uuid, profile_id uuid, nome text, cargo_atual text, cargo_novo text,
                   realizada_em timestamptz, foto_url text, legenda text)
    language sql stable security definer set search_path = public as $fn$
      select pa.id, pa.profile_id, public.lb_dev_nome(pa.profile_id), pa.cargo_atual, pa.cargo_novo,
             pa.realizada_em, pa.foto_url, pa.legenda
        from public.promocoes_agendadas pa
       where pa.org_id = public.current_org_id()
         and pa.status = 'realizada'
         and pa.realizada_em > now() - interval '3 days'
       order by pa.realizada_em desc
    $fn$
  $q$;
  execute 'revoke all on function public.lb_dev_mural_promocoes() from public';
  execute 'grant execute on function public.lb_dev_mural_promocoes() to authenticated';

  --@@FIM_MIGRACAO@@
end
$lb$;

select 'Mural de promoção aplicado' as resultado,
       (select count(*) from public.promocoes_agendadas) as promocoes,
       (select count(*) from public.planos_evolucao) as planos_intactos;
