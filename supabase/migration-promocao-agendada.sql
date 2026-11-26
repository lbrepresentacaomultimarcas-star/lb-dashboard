-- LB CRM — PROMOÇÃO AGENDADA (Meu Perfil)
--
-- RODE PRIMEIRO `ensaio-promocao-agendada.sql`. Só rode este se o ensaio
-- terminar com "FALHAS: 0". Precisa do Plano de Desenvolvimento já aplicado.
--
-- 100% ADITIVA. Cria `promocoes_agendadas`: o admin marca cargo novo, data,
-- horário e o que o colaborador deve preparar. O colaborador é avisado no sino,
-- lembrado na véspera e no dia. O CARGO SÓ MUDA quando o admin clica
-- "Promover agora" (decisão da administração, nunca automática). Ao ser
-- promovido, o colaborador vê uma comemoração na tela.
-- Não altera cargos, planos, avaliações nem dados existentes.
-- É um único bloco: ou aplica tudo, ou não aplica nada.

do $lb$
begin
  execute $q$
    create or replace function public.lb_dev_cargo_rotulo(p_papel text)
    returns text language sql immutable as $fn$
      select case p_papel when 'vendedor' then 'Vendedor' when 'lider' then 'Líder'
                          when 'supervisor' then 'Supervisor' when 'coordenador' then 'Representante'
                          when 'admin' then 'Administrador' else coalesce(p_papel, '—') end
    $fn$
  $q$;

  execute $q$
    create or replace function public.lb_dev_data_hora(p timestamptz)
    returns text language sql stable as $fn$
      select to_char(p at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
    $fn$
  $q$;

  -- 1) Tabela ---------------------------------------------------------------
  execute $q$
    create table if not exists public.promocoes_agendadas (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null default public.current_org_id(),
      profile_id uuid not null references public.profiles(id) on delete cascade,
      cargo_atual text,
      cargo_novo text not null check (cargo_novo in ('vendedor', 'lider', 'supervisor', 'coordenador')),
      data_hora timestamptz not null,
      mensagem text,
      status text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada')),
      criado_por uuid,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      realizada_em timestamptz,
      comemoracao_vista_em timestamptz
    )
  $q$;
  -- no máximo UMA promoção agendada por pessoa
  execute 'create unique index if not exists promocoes_uma_agendada on public.promocoes_agendadas (profile_id) where status = ''agendada''';
  execute 'create index if not exists promocoes_org_idx on public.promocoes_agendadas (org_id, data_hora)';
  execute 'alter table public.promocoes_agendadas enable row level security';
  execute 'drop policy if exists "promocoes leitura" on public.promocoes_agendadas';
  execute 'drop policy if exists "promocoes admin insere" on public.promocoes_agendadas';
  execute 'drop policy if exists "promocoes altera" on public.promocoes_agendadas';
  execute 'drop policy if exists "promocoes admin exclui" on public.promocoes_agendadas';
  execute 'create policy "promocoes leitura" on public.promocoes_agendadas for select to authenticated using (public.lb_dev_pode_ver(profile_id))';
  execute 'create policy "promocoes admin insere" on public.promocoes_agendadas for insert to authenticated with check (public.lb_dev_eh_admin(public.lb_dev_org_de(profile_id)))';
  -- o dono também atualiza, mas o gatilho só deixa ele marcar que viu a comemoração
  execute 'create policy "promocoes altera" on public.promocoes_agendadas for update to authenticated using (profile_id = auth.uid() or public.lb_dev_eh_admin(org_id)) with check (profile_id = auth.uid() or public.lb_dev_eh_admin(org_id))';
  execute 'create policy "promocoes admin exclui" on public.promocoes_agendadas for delete to authenticated using (public.lb_dev_eh_admin(org_id))';

  -- 2) Regras de gravação ------------------------------------------------------
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
      -- colaborador: só registra que viu a comemoração
      if row(new.profile_id, new.org_id, new.cargo_atual, new.cargo_novo, new.data_hora, new.mensagem,
             new.status, new.criado_por, new.realizada_em)
         is distinct from row(old.profile_id, old.org_id, old.cargo_atual, old.cargo_novo, old.data_hora,
             old.mensagem, old.status, old.criado_por, old.realizada_em) then
        raise exception 'Só a administração altera a promoção.';
      end if;
      new.comemoracao_vista_em := case when old.comemoracao_vista_em is null and new.comemoracao_vista_em is not null
                                       then now() else old.comemoracao_vista_em end;
      return new;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_dev_promocao_antes on public.promocoes_agendadas';
  execute 'create trigger trg_lb_dev_promocao_antes before insert or update on public.promocoes_agendadas for each row execute function public.lb_dev_promocao_antes()';

  -- 3) Avisos no sino ----------------------------------------------------------
  execute $q$
    create or replace function public.lb_dev_promocao_depois()
    returns trigger language plpgsql security definer set search_path = public as $fn$
    declare v_cargo text := public.lb_dev_cargo_rotulo(new.cargo_novo);
    begin
      if tg_op = 'INSERT' then
        perform public.lb_dev_notificar(new.org_id, new.profile_id, 'dev_promocao',
          '🎖️ Sua promoção para ' || v_cargo || ' está marcada!',
          'Dia ' || public.lb_dev_data_hora(new.data_hora) || '. Venha preparado(a).' ||
            coalesce(' ' || nullif(trim(new.mensagem), ''), ''), '/perfil', null);
        return null;
      end if;
      if new.profile_id = auth.uid() then
        return null;
      end if;
      if new.status = 'realizada' and old.status is distinct from 'realizada' then
        perform public.lb_dev_notificar(new.org_id, new.profile_id, 'dev_promocao',
          '🏆 Parabéns! Agora você é ' || v_cargo,
          'Promoção feita pela administração em ' || public.lb_dev_data_hora(now()) || '. Merecido!', '/perfil', null);
      elsif new.status = 'cancelada' and old.status = 'agendada' then
        perform public.lb_dev_notificar(new.org_id, new.profile_id, 'dev_promocao',
          '📅 A data da sua promoção saiu da agenda',
          'A administração vai combinar uma nova data com você.', '/perfil', null);
      elsif new.status = 'agendada'
            and (new.data_hora is distinct from old.data_hora or new.cargo_novo is distinct from old.cargo_novo
                 or new.mensagem is distinct from old.mensagem) then
        perform public.lb_dev_notificar(new.org_id, new.profile_id, 'dev_promocao',
          '📅 Sua promoção para ' || v_cargo || ' foi atualizada',
          'Nova data: ' || public.lb_dev_data_hora(new.data_hora) || '.' ||
            coalesce(' ' || nullif(trim(new.mensagem), ''), ''), '/perfil', null);
      end if;
      return null;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_dev_promocao_depois on public.promocoes_agendadas';
  execute 'create trigger trg_lb_dev_promocao_depois after insert or update on public.promocoes_agendadas for each row execute function public.lb_dev_promocao_depois()';

  -- 4) Lembretes: o mesmo de antes + véspera/dia da promoção ------------------
  execute $q$
    create or replace function public.lb_dev_lembretes()
    returns int language plpgsql security definer set search_path = public as $fn$
    declare
      v_me record;
      v_org uuid;
      v_dia int;
      v_primeiro text;
      v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
      v_inicio_hoje timestamptz := ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
      v_ref text;
      v_n int;
      v_criados int := 0;
      v_p record;
    begin
      if auth.uid() is null then return 0; end if;
      select * into v_me from public.profiles where id = auth.uid();
      if not found or not coalesce(v_me.ativo, true) then return 0; end if;
      v_org := coalesce(v_me.vendedor_id, v_me.id);
      select dia_avaliacao, primeiro_mes into v_dia, v_primeiro from public.config_desenvolvimento where org_id = v_org;
      v_dia := coalesce(v_dia, 5);
      v_primeiro := coalesce(v_primeiro, '2026-11');
      v_ref := to_char(
        (date_trunc('month', v_hoje) - case when extract(day from v_hoje) >= v_dia
                                            then interval '1 month' else interval '2 months' end)::date, 'YYYY-MM');

      if v_me.papel = 'admin' then
        if v_ref >= v_primeiro then
          select count(*) into v_n from public.profiles p
           where coalesce(p.vendedor_id, p.id) = v_org and p.papel <> 'admin'
             and coalesce(p.ativo, true) and coalesce(p.codigo_liberado, true)
             and not exists (select 1 from public.avaliacoes_mensais a where a.profile_id = p.id and a.mes = v_ref);
          if v_n > 0 and not exists (
               select 1 from public.notificacoes where user_id = auth.uid() and tipo = 'dev_avaliacoes_pendentes'
                  and criado_em >= v_inicio_hoje) then
            perform public.lb_dev_notificar(v_org, auth.uid(), 'dev_avaliacoes_pendentes',
              '📝 ' || v_n || ' avaliaç' || case when v_n = 1 then 'ão pendente' else 'ões pendentes' end ||
                ' de ' || to_char(to_date(v_ref || '-01', 'YYYY-MM-DD'), 'MM/YYYY'),
              'Abra o Desenvolvimento da equipe para avaliar.', '/admin/desenvolvimento', null);
            v_criados := v_criados + 1;
          end if;
        end if;
        -- promoções do dia (ou que já passaram da hora e não foram feitas)
        for v_p in
          select pa.profile_id, pa.cargo_novo, pa.data_hora from public.promocoes_agendadas pa
           where pa.org_id = v_org and pa.status = 'agendada'
             and (pa.data_hora at time zone 'America/Sao_Paulo')::date <= v_hoje
        loop
          if not exists (select 1 from public.notificacoes where user_id = auth.uid() and tipo = 'dev_promocao_hoje'
                            and criado_em >= v_inicio_hoje and link = '/perfil?de=' || v_p.profile_id) then
            perform public.lb_dev_notificar(v_org, auth.uid(), 'dev_promocao_hoje',
              '🎖️ Promoção de ' || public.lb_dev_nome(v_p.profile_id) || ' para ' || public.lb_dev_cargo_rotulo(v_p.cargo_novo),
              'Marcada para ' || public.lb_dev_data_hora(v_p.data_hora) || '. Abra o perfil e clique em "Promover agora".',
              '/perfil?de=' || v_p.profile_id, null);
            v_criados := v_criados + 1;
          end if;
        end loop;
        return v_criados;
      end if;

      -- colaborador: objetivo, passos atrasados, avaliação sem ciência
      if not exists (select 1 from public.planos_evolucao pe
                      where pe.profile_id = auth.uid() and nullif(trim(pe.objetivo), '') is not null)
         and not exists (select 1 from public.notificacoes where user_id = auth.uid() and tipo = 'dev_lembrete_objetivo'
                            and criado_em > now() - interval '3 days') then
        perform public.lb_dev_notificar(v_org, auth.uid(), 'dev_lembrete_objetivo', '🎯 Defina seu objetivo',
          'Em Meu Perfil, escreva o cargo que quer alcançar, o prazo, a meta e o foco.', '/perfil', null);
        v_criados := v_criados + 1;
      end if;
      select count(*) into v_n from public.plano_passos
       where profile_id = auth.uid() and status in ('pendente', 'ajustar') and prazo < v_hoje;
      if v_n > 0 and not exists (select 1 from public.notificacoes where user_id = auth.uid()
                                    and tipo = 'dev_lembrete_passos' and criado_em > now() - interval '2 days') then
        perform public.lb_dev_notificar(v_org, auth.uid(), 'dev_lembrete_passos',
          '⏰ ' || v_n || ' passo' || case when v_n = 1 then '' else 's' end || ' do seu plano com prazo vencido',
          'Abra Meu Perfil → Plano de passos.', '/perfil', null);
        v_criados := v_criados + 1;
      end if;
      if exists (select 1 from public.avaliacoes_mensais where profile_id = auth.uid() and ciencia_em is null
                    and atualizado_em < now() - interval '1 day')
         and not exists (select 1 from public.notificacoes where user_id = auth.uid()
                            and tipo = 'dev_lembrete_ciencia' and criado_em > now() - interval '2 days') then
        perform public.lb_dev_notificar(v_org, auth.uid(), 'dev_lembrete_ciencia', '📋 Você tem avaliação para ler',
          'Abra Meu Perfil → Como a empresa te enxerga e clique em "Li e estou ciente".', '/perfil', null);
        v_criados := v_criados + 1;
      end if;
      -- véspera e dia da promoção
      select pa.cargo_novo, pa.data_hora into v_p from public.promocoes_agendadas pa
       where pa.profile_id = auth.uid() and pa.status = 'agendada'
         and (pa.data_hora at time zone 'America/Sao_Paulo')::date between v_hoje and v_hoje + 1
       order by pa.data_hora limit 1;
      if found and not exists (select 1 from public.notificacoes where user_id = auth.uid()
                                  and tipo = 'dev_lembrete_promocao' and criado_em >= v_inicio_hoje) then
        perform public.lb_dev_notificar(v_org, auth.uid(), 'dev_lembrete_promocao',
          case when (v_p.data_hora at time zone 'America/Sao_Paulo')::date = v_hoje
               then '🎖️ Hoje é o dia da sua promoção!' else '🎖️ Amanhã é o dia da sua promoção!' end,
          public.lb_dev_cargo_rotulo(v_p.cargo_novo) || ' · ' || public.lb_dev_data_hora(v_p.data_hora) ||
            '. Venha preparado(a).', '/perfil', null);
        v_criados := v_criados + 1;
      end if;
      return v_criados;
    end
    $fn$
  $q$;
  execute 'revoke all on function public.lb_dev_lembretes() from public';
  execute 'grant execute on function public.lb_dev_lembretes() to authenticated';

  begin
    execute 'alter publication supabase_realtime add table public.promocoes_agendadas';
  exception when others then null;
  end;

  --@@FIM_MIGRACAO@@
end
$lb$;

select 'Promoção agendada aplicada' as resultado,
       (select count(*) from public.promocoes_agendadas) as promocoes,
       (select count(*) from public.planos_evolucao) as planos_intactos;
