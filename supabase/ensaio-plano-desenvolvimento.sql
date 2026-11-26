-- LB CRM — ENSAIO DO PLANO DE DESENVOLVIMENTO (NÃO ALTERA NADA)
--
-- Aplica a estrutura nova, simula administrador, colaborador, outro
-- colaborador e líder com pessoas reais, e DESFAZ TUDO. O resultado aparece
-- como uma mensagem de ERRO em vermelho, começando por
-- "ENSAIO CONCLUIDO - NADA FOI ALTERADO". Esse erro é proposital.

do $lb$
declare
  v_org uuid;
  v_a uuid;
  v_c uuid;
  v_c2 uuid;
  v_l uuid;
  v_passo uuid;
  v_aval uuid;
  v_planos_antes bigint;
  v_planos_depois bigint;
  v_n bigint;
  v_res text;
  v_ok int := 0;
  v_falhas int := 0;
  v_sem int := 0;
  v_linhas text := '';
  v_t record;
begin
  select count(*) into v_planos_antes from public.planos_evolucao;
  -- 1) Funções de apoio ------------------------------------------------------
  execute $q$
    create or replace function public.lb_dev_org_de(p_profile uuid)
    returns uuid language sql stable security definer set search_path = public as $fn$
      select coalesce(vendedor_id, id) from public.profiles where id = p_profile
    $fn$
  $q$;

  -- Quem pode LER o desenvolvimento de alguém: a própria pessoa; o admin da
  -- empresa; o supervisor (ou acima) que já enxerga aquele vendedor. Líder não.
  execute $q$
    create or replace function public.lb_dev_pode_ver(p_profile uuid)
    returns boolean language sql stable security definer set search_path = public as $fn$
      select p_profile = auth.uid()
          or exists (
            select 1 from public.profiles p
             where p.id = p_profile
               and coalesce(p.vendedor_id, p.id) = public.current_org_id()
               and (public.tem_cargo('admin')
                    or (public.tem_cargo('supervisor') and public.pode_ver_vendedor(p.vendedor_ref)))
          )
    $fn$
  $q$;

  execute $q$
    create or replace function public.lb_dev_eh_admin(p_org uuid)
    returns boolean language sql stable security definer set search_path = public as $fn$
      select public.tem_cargo('admin') and public.current_org_id() = p_org
    $fn$
  $q$;

  execute $q$
    create or replace function public.lb_dev_nome(p_profile uuid)
    returns text language sql stable security definer set search_path = public as $fn$
      select coalesce(nullif(trim(nome), ''), email, 'Colaborador') from public.profiles where id = p_profile
    $fn$
  $q$;

  -- Notifica uma pessoa. `p_janela` evita repetir o mesmo aviso em sequência.
  execute $q$
    create or replace function public.lb_dev_notificar(
      p_org uuid, p_user uuid, p_tipo text, p_titulo text, p_mensagem text, p_link text,
      p_janela interval default null)
    returns void language plpgsql security definer set search_path = public as $fn$
    begin
      if p_user is null then return; end if;
      if p_janela is not null and exists (
           select 1 from public.notificacoes n
            where n.user_id = p_user and n.tipo = p_tipo and not n.lida
              and n.criado_em > now() - p_janela) then
        return;
      end if;
      insert into public.notificacoes (org_id, user_id, tipo, titulo, mensagem, link, entidade)
      values (p_org, p_user, p_tipo, p_titulo, p_mensagem, p_link, 'desenvolvimento');
    end
    $fn$
  $q$;

  execute $q$
    create or replace function public.lb_dev_notificar_admins(
      p_org uuid, p_tipo text, p_titulo text, p_mensagem text, p_link text, p_exceto uuid default null)
    returns void language plpgsql security definer set search_path = public as $fn$
    declare r record;
    begin
      for r in
        select p.id from public.profiles p
         where p.papel = 'admin' and coalesce(p.ativo, true)
           and coalesce(p.vendedor_id, p.id) = p_org
           and p.id is distinct from p_exceto
      loop
        perform public.lb_dev_notificar(p_org, r.id, p_tipo, p_titulo, p_mensagem, p_link, null);
      end loop;
    end
    $fn$
  $q$;

  -- 2) Configuração: dia fixo da avaliação mensal ---------------------------
  execute $q$
    create table if not exists public.config_desenvolvimento (
      org_id uuid primary key default public.current_org_id(),
      dia_avaliacao int not null default 5 check (dia_avaliacao between 1 and 28),
      primeiro_mes text not null default to_char(now(), 'YYYY-MM') check (primeiro_mes ~ '^\d{4}-\d{2}$'),
      atualizado_em timestamptz not null default now()
    )
  $q$;
  execute 'alter table public.config_desenvolvimento enable row level security';
  execute 'drop policy if exists "config dev leitura" on public.config_desenvolvimento';
  execute 'drop policy if exists "config dev admin insere" on public.config_desenvolvimento';
  execute 'drop policy if exists "config dev admin altera" on public.config_desenvolvimento';
  execute 'create policy "config dev leitura" on public.config_desenvolvimento for select to authenticated using (org_id = public.current_org_id())';
  execute 'create policy "config dev admin insere" on public.config_desenvolvimento for insert to authenticated with check (org_id = public.current_org_id() and public.tem_cargo(''admin''))';
  execute 'create policy "config dev admin altera" on public.config_desenvolvimento for update to authenticated using (org_id = public.current_org_id() and public.tem_cargo(''admin'')) with check (org_id = public.current_org_id() and public.tem_cargo(''admin''))';
  -- a 1ª avaliação é a de novembro/2026 (feita no dia 5 de dezembro)
  insert into public.config_desenvolvimento (org_id, dia_avaliacao, primeiro_mes)
  select distinct coalesce(p.vendedor_id, p.id), 5, '2026-11' from public.profiles p where p.papel = 'admin'
  on conflict (org_id) do nothing;

  -- 3) Passos do plano --------------------------------------------------------
  execute $q$
    create table if not exists public.plano_passos (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null default public.current_org_id(),
      profile_id uuid not null references public.profiles(id) on delete cascade,
      ordem int not null default 0,
      titulo text not null check (length(trim(titulo)) > 0),
      descricao text,
      prazo date,
      criterio text,
      status text not null default 'pendente' check (status in ('pendente', 'concluido', 'aprovado', 'ajustar')),
      comentario text,
      concluido_em timestamptz,
      nota numeric check (nota between 0 and 10),
      feedback text,
      validado_em timestamptz,
      validado_por uuid,
      criado_por uuid,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now()
    )
  $q$;
  execute 'create index if not exists plano_passos_profile_idx on public.plano_passos (profile_id, ordem)';
  execute 'alter table public.plano_passos enable row level security';
  execute 'drop policy if exists "passos leitura" on public.plano_passos';
  execute 'drop policy if exists "passos admin insere" on public.plano_passos';
  execute 'drop policy if exists "passos altera" on public.plano_passos';
  execute 'drop policy if exists "passos admin exclui" on public.plano_passos';
  execute 'create policy "passos leitura" on public.plano_passos for select to authenticated using (public.lb_dev_pode_ver(profile_id))';
  execute 'create policy "passos admin insere" on public.plano_passos for insert to authenticated with check (public.lb_dev_eh_admin(public.lb_dev_org_de(profile_id)))';
  -- o dono também atualiza, mas o gatilho abaixo só deixa ele marcar "concluí" e comentar
  execute 'create policy "passos altera" on public.plano_passos for update to authenticated using (profile_id = auth.uid() or public.lb_dev_eh_admin(org_id)) with check (profile_id = auth.uid() or public.lb_dev_eh_admin(org_id))';
  execute 'create policy "passos admin exclui" on public.plano_passos for delete to authenticated using (public.lb_dev_eh_admin(org_id))';

  execute $q$
    create or replace function public.lb_dev_passo_antes()
    returns trigger language plpgsql security definer set search_path = public as $fn$
    begin
      if tg_op = 'INSERT' then
        new.org_id := public.lb_dev_org_de(new.profile_id);
        new.criado_por := auth.uid();
        new.status := coalesce(new.status, 'pendente');
        return new;
      end if;
      new.atualizado_em := now();
      -- SQL Editor / sistema (sem usuário logado): livre
      if auth.uid() is null or public.lb_dev_eh_admin(old.org_id) then
        if new.status is distinct from old.status and new.status in ('aprovado', 'ajustar') then
          new.validado_em := now();
          new.validado_por := auth.uid();
        end if;
        return new;
      end if;
      -- colaborador: só marca "concluí" (ou desfaz) e comenta
      if new.profile_id <> old.profile_id or new.org_id <> old.org_id
         or new.titulo is distinct from old.titulo or new.descricao is distinct from old.descricao
         or new.prazo is distinct from old.prazo or new.criterio is distinct from old.criterio
         or new.ordem is distinct from old.ordem or new.nota is distinct from old.nota
         or new.feedback is distinct from old.feedback or new.validado_em is distinct from old.validado_em
         or new.validado_por is distinct from old.validado_por or new.criado_por is distinct from old.criado_por then
        raise exception 'Só a administração altera o passo, a nota e a validação.';
      end if;
      if new.status is distinct from old.status then
        if new.status = 'concluido' and old.status in ('pendente', 'ajustar') then
          new.concluido_em := now();
        elsif new.status = 'pendente' and old.status = 'concluido' then
          new.concluido_em := null;
        else
          raise exception 'Só a administração aprova ou pede ajuste no passo.';
        end if;
      end if;
      return new;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_dev_passo_antes on public.plano_passos';
  execute 'create trigger trg_lb_dev_passo_antes before insert or update on public.plano_passos for each row execute function public.lb_dev_passo_antes()';

  execute $q$
    create or replace function public.lb_dev_passo_depois()
    returns trigger language plpgsql security definer set search_path = public as $fn$
    begin
      if tg_op = 'INSERT' then
        perform public.lb_dev_notificar(new.org_id, new.profile_id, 'dev_passos',
          '📌 Seu plano de desenvolvimento foi atualizado',
          'Novo passo: ' || new.titulo, '/perfil', interval '10 minutes');
        return null;
      end if;
      if new.profile_id = auth.uid() then
        if new.status = 'concluido' and old.status is distinct from 'concluido' then
          perform public.lb_dev_notificar_admins(new.org_id, 'dev_passo_concluido',
            '☑️ ' || public.lb_dev_nome(new.profile_id) || ' concluiu um passo',
            new.titulo || coalesce(' — "' || nullif(trim(new.comentario), '') || '"', ''),
            '/perfil?de=' || new.profile_id, new.profile_id);
        end if;
        return null;
      end if;
      if new.status is distinct from old.status and new.status = 'aprovado' then
        perform public.lb_dev_notificar(new.org_id, new.profile_id, 'dev_passo_validado',
          '✅ Passo aprovado: ' || new.titulo,
          coalesce('Nota ' || trim(to_char(new.nota, 'FM90D0')) || '. ', '') || coalesce(new.feedback, ''), '/perfil', null);
      elsif new.status is distinct from old.status and new.status = 'ajustar' then
        perform public.lb_dev_notificar(new.org_id, new.profile_id, 'dev_passo_validado',
          '🔁 Passo precisa de ajuste: ' || new.titulo, coalesce(new.feedback, ''), '/perfil', null);
      elsif row(new.titulo, new.descricao, new.prazo, new.criterio, new.nota, new.feedback)
            is distinct from row(old.titulo, old.descricao, old.prazo, old.criterio, old.nota, old.feedback) then
        perform public.lb_dev_notificar(new.org_id, new.profile_id, 'dev_passos',
          '📌 Seu plano de desenvolvimento foi atualizado', 'Passo: ' || new.titulo, '/perfil', interval '10 minutes');
      end if;
      return null;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_dev_passo_depois on public.plano_passos';
  execute 'create trigger trg_lb_dev_passo_depois after insert or update on public.plano_passos for each row execute function public.lb_dev_passo_depois()';

  -- 4) Avaliação mensal: "Como a empresa te enxerga" --------------------------
  execute $q$
    create table if not exists public.avaliacoes_mensais (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null default public.current_org_id(),
      profile_id uuid not null references public.profiles(id) on delete cascade,
      mes text not null check (mes ~ '^\d{4}-\d{2}$'),
      situacao text not null check (situacao in ('verde', 'amarelo', 'vermelho')),
      proximidade int not null default 0 check (proximidade between 0 and 100),
      reconhecimento text not null check (length(trim(reconhecimento)) > 0),
      pontos_fortes text,
      melhorar text,
      proximos_passos text,
      nota numeric not null check (nota between 0 and 10),
      avaliador_id uuid,
      avaliador_nome text,
      ciencia_em timestamptz,
      resposta text,
      resposta_em timestamptz,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      unique (profile_id, mes)
    )
  $q$;
  execute 'create index if not exists avaliacoes_mensais_org_mes_idx on public.avaliacoes_mensais (org_id, mes)';
  execute 'alter table public.avaliacoes_mensais enable row level security';
  execute 'drop policy if exists "avaliacoes leitura" on public.avaliacoes_mensais';
  execute 'drop policy if exists "avaliacoes admin insere" on public.avaliacoes_mensais';
  execute 'drop policy if exists "avaliacoes altera" on public.avaliacoes_mensais';
  execute 'drop policy if exists "avaliacoes admin exclui" on public.avaliacoes_mensais';
  execute 'create policy "avaliacoes leitura" on public.avaliacoes_mensais for select to authenticated using (public.lb_dev_pode_ver(profile_id))';
  execute 'create policy "avaliacoes admin insere" on public.avaliacoes_mensais for insert to authenticated with check (public.lb_dev_eh_admin(public.lb_dev_org_de(profile_id)))';
  execute 'create policy "avaliacoes altera" on public.avaliacoes_mensais for update to authenticated using (profile_id = auth.uid() or public.lb_dev_eh_admin(org_id)) with check (profile_id = auth.uid() or public.lb_dev_eh_admin(org_id))';
  execute 'create policy "avaliacoes admin exclui" on public.avaliacoes_mensais for delete to authenticated using (public.lb_dev_eh_admin(org_id))';

  execute $q$
    create or replace function public.lb_dev_avaliacao_antes()
    returns trigger language plpgsql security definer set search_path = public as $fn$
    begin
      if tg_op = 'INSERT' then
        new.org_id := public.lb_dev_org_de(new.profile_id);
        new.avaliador_id := auth.uid();
        new.avaliador_nome := public.lb_dev_nome(auth.uid());
        new.ciencia_em := null;
        new.resposta := null;
        new.resposta_em := null;
        return new;
      end if;
      new.atualizado_em := now();
      if auth.uid() is null or public.lb_dev_eh_admin(old.org_id) then
        -- a resposta e a ciência são do colaborador
        new.resposta := old.resposta;
        new.resposta_em := old.resposta_em;
        if row(new.situacao, new.proximidade, new.reconhecimento, new.pontos_fortes, new.melhorar,
               new.proximos_passos, new.nota)
           is distinct from row(old.situacao, old.proximidade, old.reconhecimento, old.pontos_fortes,
               old.melhorar, old.proximos_passos, old.nota) then
          -- avaliação mudou: o colaborador precisa ler de novo
          new.ciencia_em := null;
          new.avaliador_id := coalesce(auth.uid(), old.avaliador_id);
          new.avaliador_nome := coalesce(public.lb_dev_nome(auth.uid()), old.avaliador_nome);
        else
          new.ciencia_em := old.ciencia_em;
        end if;
        return new;
      end if;
      -- colaborador: só "Li e estou ciente" e a resposta
      if row(new.profile_id, new.org_id, new.mes, new.situacao, new.proximidade, new.reconhecimento,
             new.pontos_fortes, new.melhorar, new.proximos_passos, new.nota, new.avaliador_id, new.avaliador_nome)
         is distinct from row(old.profile_id, old.org_id, old.mes, old.situacao, old.proximidade, old.reconhecimento,
             old.pontos_fortes, old.melhorar, old.proximos_passos, old.nota, old.avaliador_id, old.avaliador_nome) then
        raise exception 'Só a administração altera a avaliação.';
      end if;
      if new.ciencia_em is not null and old.ciencia_em is null then
        new.ciencia_em := now();
      else
        new.ciencia_em := old.ciencia_em;
      end if;
      if new.resposta is distinct from old.resposta then
        new.resposta_em := now();
      else
        new.resposta_em := old.resposta_em;
      end if;
      return new;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_dev_avaliacao_antes on public.avaliacoes_mensais';
  execute 'create trigger trg_lb_dev_avaliacao_antes before insert or update on public.avaliacoes_mensais for each row execute function public.lb_dev_avaliacao_antes()';

  execute $q$
    create or replace function public.lb_dev_avaliacao_depois()
    returns trigger language plpgsql security definer set search_path = public as $fn$
    declare v_mes text := to_char(to_date(new.mes || '-01', 'YYYY-MM-DD'), 'MM/YYYY');
    begin
      if tg_op = 'INSERT' then
        perform public.lb_dev_notificar(new.org_id, new.profile_id, 'dev_avaliacao',
          '📋 Sua avaliação de ' || v_mes || ' está disponível',
          'Veja em Meu Perfil → Como a empresa te enxerga e confirme a leitura.', '/perfil', null);
        return null;
      end if;
      if new.profile_id = auth.uid() then
        if (new.ciencia_em is not null and old.ciencia_em is null) or new.resposta is distinct from old.resposta then
          perform public.lb_dev_notificar_admins(new.org_id, 'dev_ciencia',
            '👍 ' || public.lb_dev_nome(new.profile_id) || ' leu a avaliação de ' || v_mes,
            coalesce('Resposta: "' || nullif(trim(new.resposta), '') || '"', 'Deu ciência, sem comentário.'),
            '/perfil?de=' || new.profile_id, new.profile_id);
        end if;
        return null;
      end if;
      if old.ciencia_em is not null and new.ciencia_em is null then
        perform public.lb_dev_notificar(new.org_id, new.profile_id, 'dev_avaliacao',
          '📋 Sua avaliação de ' || v_mes || ' foi atualizada',
          'Leia de novo e confirme em Meu Perfil.', '/perfil', null);
      end if;
      return null;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_dev_avaliacao_depois on public.avaliacoes_mensais';
  execute 'create trigger trg_lb_dev_avaliacao_depois after insert or update on public.avaliacoes_mensais for each row execute function public.lb_dev_avaliacao_depois()';

  -- 5) Objetivo definido/alterado → avisa a administração ---------------------
  -- (gatilho novo na tabela existente; nenhum plano é alterado)
  execute $q$
    create or replace function public.lb_dev_objetivo_depois()
    returns trigger language plpgsql security definer set search_path = public as $fn$
    begin
      if tg_op = 'UPDATE'
         and row(new.objetivo, new.prazo_meses, new.meta_texto, new.foco)
             is not distinct from row(old.objetivo, old.prazo_meses, old.meta_texto, old.foco) then
        return null;
      end if;
      perform public.lb_dev_notificar_admins(new.org_id, 'dev_objetivo',
        '🎯 ' || public.lb_dev_nome(new.profile_id) ||
          case when tg_op = 'INSERT' or old.objetivo is null then ' definiu o objetivo' else ' atualizou o objetivo' end,
        'Objetivo: ' || coalesce(nullif(trim(new.objetivo), ''), '—') ||
          coalesce(' · prazo: ' || new.prazo_meses || ' meses', ''),
        '/perfil?de=' || new.profile_id, new.profile_id);
      return null;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_dev_objetivo_depois on public.planos_evolucao';
  execute 'create trigger trg_lb_dev_objetivo_depois after insert or update on public.planos_evolucao for each row execute function public.lb_dev_objetivo_depois()';

  -- 6) Lembretes (chamado pelo app ao abrir; no máximo 1 aviso por tipo/período)
  execute $q$
    create or replace function public.lb_dev_lembretes()
    returns int language plpgsql security definer set search_path = public as $fn$
    declare
      v_me record;
      v_org uuid;
      v_dia int;
      v_primeiro text;
      v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
      v_ref text;
      v_n int;
      v_criados int := 0;
    begin
      if auth.uid() is null then return 0; end if;
      select * into v_me from public.profiles where id = auth.uid();
      if not found or not coalesce(v_me.ativo, true) then return 0; end if;
      v_org := coalesce(v_me.vendedor_id, v_me.id);
      select dia_avaliacao, primeiro_mes into v_dia, v_primeiro from public.config_desenvolvimento where org_id = v_org;
      v_dia := coalesce(v_dia, 5);
      v_primeiro := coalesce(v_primeiro, '2026-11');
      -- mês que já deveria estar avaliado hoje
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
                  and criado_em >= (v_hoje::timestamp at time zone 'America/Sao_Paulo')) then
            perform public.lb_dev_notificar(v_org, auth.uid(), 'dev_avaliacoes_pendentes',
              '📝 ' || v_n || ' avaliaç' || case when v_n = 1 then 'ão pendente' else 'ões pendentes' end ||
                ' de ' || to_char(to_date(v_ref || '-01', 'YYYY-MM-DD'), 'MM/YYYY'),
              'Abra o Desenvolvimento da equipe para avaliar.', '/admin/desenvolvimento', null);
            v_criados := v_criados + 1;
          end if;
        end if;
        return v_criados;
      end if;

      -- colaborador: objetivo, passos atrasados e avaliação sem ciência
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
      return v_criados;
    end
    $fn$
  $q$;
  execute 'revoke all on function public.lb_dev_lembretes() from public';
  execute 'grant execute on function public.lb_dev_lembretes() to authenticated';


  -- ===================== ENSAIO (tudo abaixo é desfeito) =====================
  select p.id, coalesce(p.vendedor_id, p.id) into v_a, v_org from public.profiles p
   where p.papel = 'admin' and coalesce(p.ativo, true) order by p.criado_em limit 1;
  select p.id into v_c from public.profiles p
   where p.papel = 'vendedor' and coalesce(p.ativo, true) and coalesce(p.codigo_liberado, true)
     and coalesce(p.vendedor_id, p.id) = v_org order by p.criado_em limit 1;
  select p.id into v_c2 from public.profiles p
   where p.papel = 'vendedor' and coalesce(p.ativo, true) and coalesce(p.codigo_liberado, true)
     and coalesce(p.vendedor_id, p.id) = v_org and p.id <> v_c order by p.criado_em limit 1;
  select p.id into v_l from public.profiles p
   where p.papel = 'lider' and coalesce(p.ativo, true) and coalesce(p.vendedor_id, p.id) = v_org
     and p.id <> v_c limit 1;

  if v_c is not null then
    insert into public.plano_passos (profile_id, titulo, criterio, prazo)
    values (v_c, 'ENSAIO passo', 'ENSAIO criterio', current_date - 3) returning id into v_passo;
    insert into public.avaliacoes_mensais (profile_id, mes, situacao, proximidade, reconhecimento, nota)
    values (v_c, '2026-10', 'verde', 40, 'ENSAIO parabéns', 8) returning id into v_aval;
    -- os avisos da preparação não contam nos testes
    delete from public.notificacoes where user_id = v_c and tipo in ('dev_passos', 'dev_avaliacao')
       and criado_em > now() - interval '1 minute';
  end if;

  for v_t in
    select * from (values
      ('admin',  'permitido', 'cadastrar passo do colaborador'),
      ('admin',  'permitido', 'notificacao de passo chega ao colaborador'),
      ('colab',  'permitido', 'ver o proprio passo'),
      ('colab',  'bloqueado', 'cadastrar passo'),
      ('colab',  'permitido', 'marcar passo como concluido'),
      ('colab',  'permitido', 'admin avisado do passo concluido'),
      ('colab',  'bloqueado', 'mudar titulo do passo'),
      ('colab',  'bloqueado', 'aprovar o proprio passo'),
      ('admin',  'permitido', 'aprovar passo com nota'),
      ('admin',  'permitido', 'publicar avaliacao com reconhecimento'),
      ('admin',  'bloqueado', 'publicar avaliacao sem reconhecimento'),
      ('admin',  'permitido', 'colaborador avisado da avaliacao'),
      ('colab',  'bloqueado', 'criar a propria avaliacao'),
      ('colab',  'bloqueado', 'mudar a propria nota'),
      ('colab',  'permitido', 'li e estou ciente com resposta'),
      ('colab',  'permitido', 'admin avisado da ciencia'),
      ('admin',  'permitido', 'editar avaliacao zera a ciencia'),
      ('outro',  'bloqueado', 'ver avaliacao de outro consultor'),
      ('outro',  'bloqueado', 'ver passo de outro consultor'),
      ('lider',  'bloqueado', 'ver avaliacao do consultor'),
      ('colab',  'permitido', 'definir objetivo avisa o admin'),
      ('colab',  'permitido', 'lembretes do colaborador'),
      ('admin',  'permitido', 'lembretes do admin'),
      ('colab',  'bloqueado', 'mudar dia da avaliacao'),
      ('admin',  'permitido', 'mudar dia da avaliacao')
    ) as x(quem, esperado, descricao)
  loop
    if v_a is null or v_c is null
       or (v_t.quem = 'outro' and v_c2 is null) or (v_t.quem = 'lider' and v_l is null) then
      v_sem := v_sem + 1;
      continue;
    end if;
    v_n := 0;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub',
        case v_t.quem when 'admin' then v_a when 'outro' then v_c2 when 'lider' then v_l else v_c end,
        'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);

      if v_t.descricao = 'cadastrar passo do colaborador' then
        insert into public.plano_passos (profile_id, titulo) values (v_c, 'ENSAIO novo');
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'notificacao de passo chega ao colaborador' then
        insert into public.plano_passos (profile_id, titulo) values (v_c, 'ENSAIO novo 2');
        perform set_config('role', 'postgres', true);
        select count(*) into v_n from public.notificacoes where user_id = v_c and tipo = 'dev_passos' and mensagem like '%ENSAIO novo 2%';
      elsif v_t.descricao = 'ver o proprio passo' then
        select count(*) into v_n from public.plano_passos where id = v_passo;
      elsif v_t.descricao = 'cadastrar passo' then
        insert into public.plano_passos (profile_id, titulo) values (v_c, 'ENSAIO meu');
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'marcar passo como concluido' then
        update public.plano_passos set status = 'concluido', comentario = 'ENSAIO feito' where id = v_passo;
        select count(*) into v_n from public.plano_passos where id = v_passo and status = 'concluido' and concluido_em is not null;
      elsif v_t.descricao = 'admin avisado do passo concluido' then
        update public.plano_passos set status = 'concluido' where id = v_passo;
        perform set_config('role', 'postgres', true);
        select count(*) into v_n from public.notificacoes where user_id = v_a and tipo = 'dev_passo_concluido' and criado_em > now() - interval '1 minute';
      elsif v_t.descricao = 'mudar titulo do passo' then
        update public.plano_passos set titulo = 'HACK' where id = v_passo;
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'aprovar o proprio passo' then
        update public.plano_passos set status = 'aprovado', nota = 10 where id = v_passo;
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'aprovar passo com nota' then
        update public.plano_passos set status = 'aprovado', nota = 9, feedback = 'ENSAIO' where id = v_passo;
        select count(*) into v_n from public.plano_passos where id = v_passo and status = 'aprovado' and validado_em is not null;
      elsif v_t.descricao = 'publicar avaliacao com reconhecimento' then
        insert into public.avaliacoes_mensais (profile_id, mes, situacao, proximidade, reconhecimento, nota)
        values (v_c, '2026-09', 'amarelo', 30, 'ENSAIO elogio', 7);
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'publicar avaliacao sem reconhecimento' then
        insert into public.avaliacoes_mensais (profile_id, mes, situacao, proximidade, reconhecimento, nota)
        values (v_c, '2026-08', 'amarelo', 30, '   ', 7);
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'colaborador avisado da avaliacao' then
        insert into public.avaliacoes_mensais (profile_id, mes, situacao, proximidade, reconhecimento, nota)
        values (v_c, '2026-07', 'verde', 50, 'ENSAIO elogio', 9);
        perform set_config('role', 'postgres', true);
        select count(*) into v_n from public.notificacoes where user_id = v_c and tipo = 'dev_avaliacao' and titulo like '%07/2026%';
      elsif v_t.descricao = 'criar a propria avaliacao' then
        insert into public.avaliacoes_mensais (profile_id, mes, situacao, proximidade, reconhecimento, nota)
        values (v_c, '2026-06', 'verde', 100, 'eu mesmo', 10);
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'mudar a propria nota' then
        update public.avaliacoes_mensais set nota = 10 where id = v_aval;
        get diagnostics v_n = row_count;
      elsif v_t.descricao = 'li e estou ciente com resposta' then
        update public.avaliacoes_mensais set ciencia_em = now(), resposta = 'ENSAIO obrigado' where id = v_aval;
        select count(*) into v_n from public.avaliacoes_mensais where id = v_aval and ciencia_em is not null and resposta_em is not null;
      elsif v_t.descricao = 'admin avisado da ciencia' then
        update public.avaliacoes_mensais set ciencia_em = now() where id = v_aval;
        perform set_config('role', 'postgres', true);
        select count(*) into v_n from public.notificacoes where user_id = v_a and tipo = 'dev_ciencia' and criado_em > now() - interval '1 minute';
      elsif v_t.descricao = 'editar avaliacao zera a ciencia' then
        -- o colaborador lê; depois o admin edita
        perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
        update public.avaliacoes_mensais set ciencia_em = now() where id = v_aval;
        perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
        update public.avaliacoes_mensais set melhorar = 'ENSAIO melhorar' where id = v_aval;
        select count(*) into v_n from public.avaliacoes_mensais where id = v_aval and ciencia_em is null;
      elsif v_t.descricao = 'ver avaliacao de outro consultor' or v_t.descricao = 'ver avaliacao do consultor' then
        select count(*) into v_n from public.avaliacoes_mensais where id = v_aval;
      elsif v_t.descricao = 'ver passo de outro consultor' then
        select count(*) into v_n from public.plano_passos where id = v_passo;
      elsif v_t.descricao = 'definir objetivo avisa o admin' then
        insert into public.planos_evolucao (profile_id, objetivo, prazo_meses)
        values (v_c, 'ENSAIO Supervisor', 3)
        on conflict (profile_id) do update set objetivo = 'ENSAIO Supervisor', prazo_meses = 3;
        perform set_config('role', 'postgres', true);
        select count(*) into v_n from public.notificacoes where user_id = v_a and tipo = 'dev_objetivo' and mensagem like '%ENSAIO Supervisor%';
      elsif v_t.descricao = 'lembretes do colaborador' then
        perform public.lb_dev_lembretes();
        v_n := 1;
      elsif v_t.descricao = 'lembretes do admin' then
        perform public.lb_dev_lembretes();
        v_n := 1;
      elsif v_t.descricao = 'mudar dia da avaliacao' then
        update public.config_desenvolvimento set dia_avaliacao = 6 where org_id = v_org;
        get diagnostics v_n = row_count;
      end if;
      raise exception using errcode = 'LBT01', message = 'desfaz este teste';
    exception
      when sqlstate 'LBT01' then
        v_res := case when v_n > 0 then 'permitido' else 'bloqueado' end;
      when insufficient_privilege or check_violation then
        v_res := 'bloqueado';
      when raise_exception then
        v_res := case when sqlerrm like 'Só a administração%' then 'bloqueado' else 'erro: ' || left(sqlerrm, 90) end;
      when others then
        v_res := 'erro: ' || left(sqlerrm, 90);
    end;
    if v_res = v_t.esperado then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
      v_linhas := v_linhas || E'\n- ' || v_t.quem || ' / ' || v_t.descricao || ': esperado ' || v_t.esperado || ', veio ' || v_res;
    end if;
  end loop;

  select count(*) into v_planos_depois from public.planos_evolucao;

  -- Este erro é proposital: é ele que garante que NADA fica gravado.
  raise exception using
    errcode = 'LBE01',
    message = format(E'ENSAIO CONCLUIDO - NADA FOI ALTERADO\nPASSOU: %s\nFALHAS: %s\nSEM DADOS PARA TESTAR: %s\nPLANOS JA ESCRITOS: %s antes / %s depois%s',
                     v_ok, v_falhas, v_sem, v_planos_antes, v_planos_depois, v_linhas);
end
$lb$;
