-- LB CRM — Módulo Consórcio (ADITIVO: só cria tabelas novas; nada existente muda)
-- Rode no SQL Editor do Supabase. Idempotente (pode rodar de novo).

-- Grupos do consórcio (1 linha por grupo; sincronizado do Drive/planilha)
create table if not exists public.consorcio_grupos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  grupo text not null,
  segmento text,                       -- IMV | AUT | MOT | CAM | SRV
  situacao text not null default 'liberado' check (situacao in ('liberado','bloqueado')),
  pdf_url text,                        -- tabela oficial do mês (Drive)
  prazo_total int,
  taxa_adm numeric(6,2),
  antecipacao_tx numeric(6,2),
  taxa_fr numeric(6,2),
  taxa_seguro numeric(8,4),
  plano_light boolean,
  pct_embutido numeric(6,2),           -- % máximo de lance embutido
  base_embutido text,                  -- 'credito' | 'lance'
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (org_id, grupo)
);

-- Créditos (cartas) liberados por grupo — a vitrine de vendas
create table if not exists public.consorcio_creditos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  grupo text not null,
  segmento text,
  cod_bem text not null,
  valor numeric(14,2) not null,
  prazo_total int,
  taxa_adm numeric(6,2),
  antecipacao_tx numeric(6,2),
  taxa_fr numeric(6,2),
  taxa_seguro numeric(8,4),
  plano_light boolean,
  pct_embutido numeric(6,2),
  base_embutido text,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (org_id, grupo, cod_bem)
);

-- Histórico das assembleias (resultados registrados pela equipe)
create table if not exists public.consorcio_assembleias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id(),
  grupo text not null,
  data date not null,
  numero int,
  contemplados_fixo int not null default 0,
  contemplados_livre int not null default 0,
  menor_lance_livre_pct numeric(6,2),  -- % do crédito do menor lance livre contemplado
  observacao text,
  criado_em timestamptz not null default now(),
  unique (org_id, grupo, data)
);

-- Configuração do simulador (faixas de classificação, por org)
create table if not exists public.consorcio_config (
  org_id uuid primary key default public.current_org_id(),
  faixa_alta numeric(6,2) not null default 40,   -- lance >= X% do crédito → alta
  faixa_media numeric(6,2) not null default 25,  -- lance >= X% e < alta → média
  atualizado_em timestamptz not null default now()
);

create index if not exists consorcio_grupos_org_idx      on public.consorcio_grupos (org_id);
create index if not exists consorcio_creditos_org_idx    on public.consorcio_creditos (org_id, segmento, valor);
create index if not exists consorcio_assembleias_org_idx on public.consorcio_assembleias (org_id, grupo, data desc);

-- RLS: mesmo padrão do schema (cada org só enxerga o que é dela)
alter table public.consorcio_grupos      enable row level security;
alter table public.consorcio_creditos    enable row level security;
alter table public.consorcio_assembleias enable row level security;
alter table public.consorcio_config      enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['consorcio_grupos','consorcio_creditos','consorcio_assembleias','consorcio_config']) loop
    begin
      execute format('create policy "%s read"   on public.%s for select using (org_id = public.current_org_id());', t, t);
      execute format('create policy "%s insert" on public.%s for insert with check (org_id = public.current_org_id());', t, t);
      execute format('create policy "%s update" on public.%s for update using (org_id = public.current_org_id());', t, t);
      execute format('create policy "%s delete" on public.%s for delete using (org_id = public.current_org_id());', t, t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
