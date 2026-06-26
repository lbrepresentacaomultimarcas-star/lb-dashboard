-- LB Dashboard — Temporadas / Campanhas Sazonais (camada VISUAL da gamificação)
-- ADITIVA: cria 1 tabela nova. NÃO altera nenhuma tabela/regra existente.
-- O "pacote" do tema fica todo num jsonb (estilo) → novos temas/campos no
-- futuro = só dados, nunca migration nova.
-- Rodar no SQL Editor do Supabase do LB (projeto qjxmzttfdgivlsfxfwsc).

create table if not exists public.temas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null default public.current_org_id(),
  nome          text not null,
  slug          text not null,
  status        text not null default 'rascunho'
                check (status in ('rascunho','ativo','inativo','arquivado')),
  estilo        jsonb not null default '{}'::jsonb,   -- o PACOTE completo do tema
  data_inicio   date,
  data_fim      date,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, slug)
);

-- Só UM tema ativo por org (garantido pelo banco).
create unique index if not exists temas_um_ativo_idx
  on public.temas (org_id) where status = 'ativo';
create index if not exists temas_org_idx on public.temas (org_id);

-- RLS — cada org só enxerga/edita o seu (padrão do projeto)
alter table public.temas enable row level security;
drop policy if exists "temas rw" on public.temas;
create policy "temas rw" on public.temas for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- Realtime (trocar/ativar tema reflete na hora, sem deploy)
do $$
begin
  begin alter publication supabase_realtime add table public.temas; exception when others then null; end;
end$$;
