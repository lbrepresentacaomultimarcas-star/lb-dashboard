-- LB CRM — PERFIL DO CLIENTE NO PIPELINE
--
-- RODE PRIMEIRO `ensaio-perfil-cliente.sql`. Só rode este se o ensaio terminar
-- com "FALHAS: 0".
--
-- Cria:
--   • `perfis_cliente`: os perfis configuráveis (todos leem, só o admin altera);
--   • 4 colunas em `leads` com o perfil, a observação, quem definiu e quando;
--   • `negocio_perfil_historico`: cada troca de perfil, sem poder ser apagada.
--
-- Quem e quando são carimbados pelo BANCO, em qualquer caminho de gravação:
-- a tela não consegue informar outra pessoa nem outra data.
-- Nenhum dado existente é alterado: os negócios começam sem perfil.
-- É um único bloco: ou aplica tudo, ou não aplica nada.

do $lb$
declare
  v_org uuid;
begin
  -- 1) Perfis configuráveis
  execute $q$
    create table if not exists public.perfis_cliente (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null default public.current_org_id(),
      chave text not null,
      nome text not null,
      emoji text not null default '',
      cor text not null default '#94a3b8',
      dica text not null default '',
      ordem int not null default 0,
      ativo boolean not null default true,
      criado_em timestamptz not null default now(),
      unique (org_id, chave)
    )
  $q$;
  execute 'alter table public.perfis_cliente enable row level security';
  execute 'drop policy if exists "perfis leitura" on public.perfis_cliente';
  execute 'drop policy if exists "perfis admin insere" on public.perfis_cliente';
  execute 'drop policy if exists "perfis admin altera" on public.perfis_cliente';
  execute 'drop policy if exists "perfis admin exclui" on public.perfis_cliente';
  execute 'create policy "perfis leitura" on public.perfis_cliente for select to authenticated using (org_id = public.current_org_id())';
  execute 'create policy "perfis admin insere" on public.perfis_cliente for insert to authenticated with check (org_id = public.current_org_id() and public.tem_cargo(''admin''))';
  execute 'create policy "perfis admin altera" on public.perfis_cliente for update to authenticated using (org_id = public.current_org_id() and public.tem_cargo(''admin'')) with check (org_id = public.current_org_id() and public.tem_cargo(''admin''))';
  execute 'create policy "perfis admin exclui" on public.perfis_cliente for delete to authenticated using (org_id = public.current_org_id() and public.tem_cargo(''admin''))';

  for v_org in select distinct org_id from public.vendedores where org_id is not null loop
    insert into public.perfis_cliente (org_id, chave, nome, emoji, cor, dica, ordem) values
      (v_org, 'confianca', 'Confiança', '🤝', '#38bdf8',
       'Precisa de relacionamento, segurança e prova social. Tenha calma, seja transparente, mostre depoimentos e explique cada etapa do processo.', 1),
      (v_org, 'pressao', 'Pressão', '⚡', '#f59e0b',
       'Decidido e com urgência. Seja objetivo, apresente uma condição com prazo claro e vá direto para a proposta.', 2),
      (v_org, 'pesquisador', 'Pesquisador', '🔍', '#a78bfa',
       'Compara, pede números e simulações e demora a decidir. Leve dados, simulação detalhada e comparativo, e agende o próximo contato.', 3),
      (v_org, 'so_conhecendo', 'Só conhecendo', '👀', '#94a3b8',
       'Curioso, sem intenção clara de compra agora. Nutra a relação, não pressione e combine quando retomar.', 4)
    on conflict (org_id, chave) do nothing;
  end loop;

  -- 2) Perfil no negócio
  execute 'alter table public.leads add column if not exists perfil_cliente uuid references public.perfis_cliente(id) on delete set null';
  execute 'alter table public.leads add column if not exists perfil_observacao text';
  execute 'alter table public.leads add column if not exists perfil_definido_por uuid';
  execute 'alter table public.leads add column if not exists perfil_definido_em timestamptz';
  execute 'create index if not exists leads_perfil_cliente_idx on public.leads (org_id, perfil_cliente)';

  -- 3) Histórico
  execute $q$
    create table if not exists public.negocio_perfil_historico (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null,
      negocio_id uuid not null references public.leads(id) on delete cascade,
      perfil_anterior uuid,
      perfil_novo uuid,
      observacao text,
      usuario_id uuid,
      usuario_nome text,
      created_at timestamptz not null default now()
    )
  $q$;
  execute 'create index if not exists negocio_perfil_historico_idx on public.negocio_perfil_historico (negocio_id, created_at desc)';
  execute 'alter table public.negocio_perfil_historico enable row level security';
  execute 'drop policy if exists "perfil historico leitura" on public.negocio_perfil_historico';
  execute $q$
    create policy "perfil historico leitura" on public.negocio_perfil_historico for select to authenticated
    using (
      org_id = public.current_org_id()
      and exists (select 1 from public.leads l
                   where l.id = negocio_id and public.pode_ver_vendedor(l.vendedor_id))
    )
  $q$;

  -- 4) Carimbo e validação (antes de gravar)
  execute $q$
    create or replace function public.lb_perfil_cliente_carimbo()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      if tg_op = 'UPDATE'
         and new.perfil_cliente is not distinct from old.perfil_cliente
         and new.perfil_observacao is not distinct from old.perfil_observacao then
        new.perfil_definido_por := old.perfil_definido_por;
        new.perfil_definido_em := old.perfil_definido_em;
        return new;
      end if;
      if tg_op = 'INSERT' and new.perfil_cliente is null and new.perfil_observacao is null then
        new.perfil_definido_por := null;
        new.perfil_definido_em := null;
        return new;
      end if;
      if new.perfil_cliente is not null and not exists (
           select 1 from public.perfis_cliente p
            where p.id = new.perfil_cliente and p.org_id = new.org_id and p.ativo) then
        raise exception 'Perfil de cliente inválido para esta empresa.';
      end if;
      new.perfil_definido_por := auth.uid();
      new.perfil_definido_em := now();
      return new;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_perfil_cliente_carimbo on public.leads';
  execute 'create trigger trg_lb_perfil_cliente_carimbo before insert or update of perfil_cliente, perfil_observacao, perfil_definido_por, perfil_definido_em on public.leads for each row execute function public.lb_perfil_cliente_carimbo()';

  -- 5) Histórico (depois de gravar)
  execute $q$
    create or replace function public.lb_perfil_cliente_historico()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      if tg_op = 'INSERT' and new.perfil_cliente is null then
        return null;
      end if;
      if tg_op = 'UPDATE'
         and new.perfil_cliente is not distinct from old.perfil_cliente
         and new.perfil_observacao is not distinct from old.perfil_observacao then
        return null;
      end if;
      insert into public.negocio_perfil_historico
        (org_id, negocio_id, perfil_anterior, perfil_novo, observacao, usuario_id, usuario_nome)
      values (
        new.org_id, new.id,
        case when tg_op = 'UPDATE' then old.perfil_cliente end,
        new.perfil_cliente, new.perfil_observacao, auth.uid(),
        (select coalesce(p.nome, p.email) from public.profiles p where p.id = auth.uid())
      );
      return null;
    end
    $fn$
  $q$;
  execute 'drop trigger if exists trg_lb_perfil_cliente_historico on public.leads';
  execute 'create trigger trg_lb_perfil_cliente_historico after insert or update of perfil_cliente, perfil_observacao on public.leads for each row execute function public.lb_perfil_cliente_historico()';

  -- 6) Tempo real dos perfis configuráveis
  begin
    execute 'alter publication supabase_realtime add table public.perfis_cliente';
  exception when others then null;
  end;

  --@@FIM_MIGRACAO@@
end
$lb$;

select 'Perfil do cliente aplicado. Perfis cadastrados:' as resultado, count(*) as perfis
  from public.perfis_cliente;
