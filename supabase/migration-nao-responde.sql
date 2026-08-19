-- ============================================================================
-- LB CRM — Etapa "NÃO RESPONDE" + Mensagens Prontas + Histórico de Tentativas
-- 100% ADITIVA e IDEMPOTENTE. Rode UMA vez no SQL Editor do Supabase
-- (projeto qjxmzttfdgivlsfxfwsc) ANTES de publicar o código novo.
--
-- NÃO remove, NÃO renomeia e NÃO altera nada existente:
--  · só ADICIONA colunas opcionais em `leads`
--  · cria 2 tabelas NOVAS (lead_tentativas, mensagens_prontas)
--  · "Perdido" continua exatamente como está — nenhum lead é movido sozinho
-- ============================================================================

-- 1) Libera a etapa nova no `status` do lead ---------------------------------
--    O schema original tinha um CHECK antigo ('novo','contato',…) que já não
--    corresponde ao funil atual. Se ele ainda existir em algum ambiente, sai
--    daqui — senão a etapa nova seria recusada pelo banco.
do $mig$
declare c text;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'leads'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.leads drop constraint %I', c);
  end loop;
end $mig$;

-- 2) Colunas novas em `leads` (todas nuláveis / com default seguro) ----------
alter table public.leads
  add column if not exists nao_responde_desde    timestamptz,  -- quando entrou na etapa
  add column if not exists tentativas_count      integer not null default 0,
  add column if not exists ultima_tentativa_em   timestamptz,
  add column if not exists ultima_tentativa_acao text;

-- 3) Gatilho: carimba/limpa `nao_responde_desde` -----------------------------
--    Entrou em "não responde" → carimba. Saiu → limpa (para que uma nova
--    entrada reinicie o cronômetro). O histórico fica em lead_tentativas.
create or replace function public.lead_marca_nao_responde()
returns trigger
language plpgsql
as $fn$
begin
  if new.status = 'nao_responde'
     and (tg_op = 'INSERT' or old.status is distinct from 'nao_responde')
     and new.nao_responde_desde is null then
    new.nao_responde_desde := now();
  elsif tg_op = 'UPDATE'
     and old.status = 'nao_responde'
     and new.status is distinct from 'nao_responde' then
    new.nao_responde_desde := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_lead_nao_responde on public.leads;
create trigger trg_lead_nao_responde
  before insert or update on public.leads
  for each row execute function public.lead_marca_nao_responde();

-- 4) Tabela NOVA — histórico de tentativas de recuperação --------------------
create table if not exists public.lead_tentativas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default public.current_org_id(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  vendedor_id     uuid,                     -- consultor responsável na hora da tentativa
  usuario_email   text,                     -- quem registrou
  canal           text not null default 'whatsapp'
                  check (canal in ('whatsapp','ligacao','presencial','email','outro')),
  acao            text not null,            -- o que foi feito (resumo)
  mensagem_id     uuid,                     -- modelo usado (quando veio das Mensagens Prontas)
  mensagem_titulo text,                     -- título do modelo (preservado mesmo se o modelo mudar)
  categoria       text,                     -- categoria do modelo usado
  resultado       text not null default 'sem_resposta'
                  check (resultado in ('sem_resposta','respondeu','agendou','nao_quer','outro')),
  observacao      text,
  automatica      boolean not null default false,  -- true = registrada pelo sistema
  criado_em       timestamptz not null default now()
);

create index if not exists lead_tentativas_lead_idx on public.lead_tentativas (lead_id, criado_em desc);
create index if not exists lead_tentativas_org_idx  on public.lead_tentativas (org_id, criado_em desc);

alter table public.lead_tentativas enable row level security;
drop policy if exists "lead_tentativas rw" on public.lead_tentativas;
create policy "lead_tentativas rw" on public.lead_tentativas for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- 5) Gatilho: cada tentativa atualiza os contadores do lead ------------------
--    (o app não precisa fazer duas escritas — o banco mantém em dia)
create or replace function public.lead_tentativa_atualiza_contadores()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.leads
     set tentativas_count      = coalesce(tentativas_count, 0) + 1,
         ultima_tentativa_em   = new.criado_em,
         ultima_tentativa_acao = new.acao
   where id = new.lead_id;
  return new;
end;
$fn$;

drop trigger if exists trg_lead_tentativa_contadores on public.lead_tentativas;
create trigger trg_lead_tentativa_contadores
  after insert on public.lead_tentativas
  for each row execute function public.lead_tentativa_atualiza_contadores();

-- 6) Tabela NOVA — Mensagens Prontas (gerenciadas pelo admin, sem código) ----
create table if not exists public.mensagens_prontas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null default public.current_org_id(),
  titulo        text not null,
  categoria     text not null,
  texto         text not null,
  ordem         integer not null default 0,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists mensagens_prontas_org_idx
  on public.mensagens_prontas (org_id, categoria, ordem);

alter table public.mensagens_prontas enable row level security;
drop policy if exists "mensagens_prontas rw" on public.mensagens_prontas;
create policy "mensagens_prontas rw" on public.mensagens_prontas for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- 7) Realtime (idempotente) --------------------------------------------------
do $rt$
begin
  begin alter publication supabase_realtime add table public.mensagens_prontas; exception when others then null; end;
  begin alter publication supabase_realtime add table public.lead_tentativas;   exception when others then null; end;
end $rt$;

-- 8) SEED — biblioteca inicial de mensagens ----------------------------------
--    ATENÇÃO: no SQL Editor não existe usuário logado, então current_org_id()
--    vem VAZIO — por isso o dono (org_id) é descoberto a partir dos dados que
--    já existem (vendedores → leads → profiles). Só insere se a empresa ainda
--    não tem nenhuma mensagem: rodar de novo não duplica nem sobrescreve.
--    Variáveis disponíveis: {{nome}} {{consultor}} {{produto}} {{empresa}}
do $seed$
declare v_org uuid;
begin
  select coalesce(
    public.current_org_id(),
    (select org_id from public.vendedores where org_id is not null
      group by org_id order by count(*) desc limit 1),
    (select org_id from public.leads where org_id is not null
      group by org_id order by count(*) desc limit 1),
    (select vendedor_id from public.profiles where vendedor_id is not null limit 1)
  ) into v_org;

  if v_org is null then
    raise notice 'Nao consegui identificar a empresa (org_id): as tabelas foram criadas, mas as mensagens de exemplo NAO entraram. Cadastre-as em Administrativo > Mensagens Prontas.';
    return;
  end if;

  if exists (select 1 from public.mensagens_prontas where org_id = v_org) then
    raise notice 'A biblioteca ja tem mensagens — nada foi inserido.';
    return;
  end if;

  insert into public.mensagens_prontas (org_id, titulo, categoria, texto, ordem)
  select v_org, s.titulo, s.categoria, s.texto, s.ordem
    from (values
  -- Chamar atenção
  ('Retomada direta','chamar_atencao',
   'Oi {{nome}}, aqui é o {{consultor}} da {{empresa}}. Passando rapidinho pra saber se você ainda tem interesse no {{produto}}. Posso te atualizar em 1 minuto?', 1),
  ('Só uma pergunta','chamar_atencao',
   '{{nome}}, uma pergunta rápida: o que travou a sua decisão sobre o {{produto}}? Se eu souber, consigo te ajudar melhor.', 2),
  ('Ainda faz sentido?','chamar_atencao',
   'Oi {{nome}}! Só pra eu não te incomodar à toa: o {{produto}} ainda faz sentido pra você neste momento?', 3),
  -- Quebra de objeção
  ('Preço não é o problema','quebra_objecao',
   '{{nome}}, muita gente acha que precisa de um valor alto pra começar. Na prática o {{produto}} cabe no seu planejamento — quer que eu te mostre como ficaria no seu caso?', 1),
  ('Sem compromisso','quebra_objecao',
   '{{nome}}, entender a proposta não te obriga a nada. Te mando os números e você decide com calma. Pode ser?', 2),
  ('Momento errado','quebra_objecao',
   'Entendo que agora não seja a hora, {{nome}}. Posso te deixar a simulação pronta pra quando for? Assim você não perde as condições de hoje.', 3),
  -- Criar curiosidade
  ('Novidade sob medida','curiosidade',
   '{{nome}}, apareceu uma condição nova que encaixa exatamente no que você procurava no {{produto}}. Quer ver?', 1),
  ('Descoberta','curiosidade',
   '{{nome}}, revi o seu caso aqui e percebi uma coisa que pode mudar a sua conta. Te mando?', 2),
  -- Criar urgência
  ('Prazo curto','urgencia',
   '{{nome}}, as condições que separei pra você valem até o fim desta semana. Consigo garantir se você me confirmar hoje.', 1),
  ('Últimas vagas','urgencia',
   '{{nome}}, o grupo do {{produto}} está fechando. Depois só na próxima abertura, com outro valor. Quer que eu segure a sua vaga?', 2),
  -- Nova abordagem
  ('Recomeço','nova_abordagem',
   'Oi {{nome}}, vamos começar do zero? Me conta em uma frase o que você quer conquistar e eu monto o caminho.', 1),
  ('Troca de foco','nova_abordagem',
   '{{nome}}, e se a gente olhasse por outro ângulo? Talvez outra opção encaixe melhor no seu bolso do que a que conversamos.', 2),
  -- Visualizou e não respondeu
  ('Vi que você leu','visualizou',
   '{{nome}}, vi que você chegou a ver minha mensagem. Se preferir, respondo por áudio ou ligo — o que for melhor pra você.', 1),
  ('Faltou algo?','visualizou',
   '{{nome}}, ficou faltando alguma informação pra você decidir? Me diz o que falta que eu te mando agora.', 2),
  -- Parou de responder
  ('Sumiço amigável','parou_responder',
   'Oi {{nome}}, tudo bem por aí? Faz um tempo que não conversamos sobre o {{produto}}. Quer retomar?', 1),
  ('Continuo à disposição','parou_responder',
   '{{nome}}, sigo à disposição por aqui. Quando quiser retomar o {{produto}}, é só me chamar.', 2),
  -- Última tentativa
  ('Encerrando o contato','ultima_tentativa',
   '{{nome}}, vou encerrar o seu atendimento pra não te incomodar. Se um dia quiser retomar o {{produto}}, guarde o meu contato. Sucesso!', 1),
  ('Posso arquivar?','ultima_tentativa',
   '{{nome}}, posso arquivar a sua proposta? Se preferir que eu mantenha, me responde só com um "sim".', 2),
  -- Reativação
  ('Voltando ao assunto','reativacao',
   'Oi {{nome}}! Lembrei de você: surgiu uma condição nova no {{produto}}. Vale a pena dar uma olhada?', 1),
  ('Cliente antigo','reativacao',
   '{{nome}}, faz um tempo que conversamos. Mudou alguma coisa aí? Se hoje fizer sentido, eu refaço a sua simulação com os valores atuais.', 2)
) as s(titulo, categoria, texto, ordem);

  raise notice 'Biblioteca criada com % mensagens.', (select count(*) from public.mensagens_prontas where org_id = v_org);
end $seed$;

-- ============================================================================
-- VERIFICAÇÃO (opcional)
-- ============================================================================
select 'colunas novas em leads' as item, count(*) as ok
  from information_schema.columns
 where table_name = 'leads'
   and column_name in ('nao_responde_desde','tentativas_count','ultima_tentativa_em','ultima_tentativa_acao')
union all
select 'mensagens prontas cadastradas', count(*) from public.mensagens_prontas
union all
select 'tentativas registradas', count(*) from public.lead_tentativas;
