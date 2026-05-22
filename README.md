# LB Dashboard 2.0 — CRM LB Representações

CRM comercial multiusuário: pipeline de negócios, gestão de vendedores, metas,
comissões, ranking gamificado e financeiro. PWA instalável.

- **Produção:** https://lb-dashboard-virid.vercel.app
- **Repositório:** https://github.com/lbrepresentacaomultimarcas-star/lb-dashboard
- **Domínio futuro:** app.lbrepresentacoes.com.br

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Linguagem | TypeScript (strict) |
| Estilo | Tailwind CSS v4 |
| Banco / Auth | Supabase (Postgres + Auth + Realtime + Storage) |
| Hospedagem | Vercel (deploy automático via GitHub) |
| Gráficos | Recharts · Exportação: jsPDF, xlsx |
| Notificações UI | sonner (toasts) |

---

## Estrutura de pastas

```
src/
├── app/
│   ├── (app)/              # rotas autenticadas (sidebar + topbar + guards)
│   │   ├── dashboard/      # visão geral (gestor) / meu desempenho (vendedor)
│   │   ├── leads/          # pipeline de negócios (7 etapas)
│   │   ├── vendas/         # lançamentos de venda
│   │   ├── clientes/       # base de clientes
│   │   ├── ranking/        # ranking gamificado (pódio)
│   │   ├── metas/          # metas mensais por vendedor (supervisor+)
│   │   ├── financeiro/     # faturamento, comissão, lucro (coordenador+)
│   │   ├── relatorios/     # gráficos + export CSV/PDF/Excel (coordenador+)
│   │   ├── historico/      # audit log (escopo por papel)
│   │   ├── configuracoes/  # upload de logos (admin)
│   │   └── admin/          # colaboradores, equipes, produções (admin)
│   ├── api/admin/          # route handlers server-side (service_role)
│   ├── auth/callback/      # troca code/magic-link por sessão
│   ├── login/              # tela de login
│   ├── manifest.ts         # PWA manifest
│   └── layout.tsx          # root layout (tema, PWA, analytics)
├── components/             # UI (Card, Button, Modal, Avatar, Sidebar, etc.)
├── lib/
│   ├── store.ts            # estado reativo (Supabase ↔ localStorage)
│   ├── supabase/           # clients: browser, server, admin, middleware
│   ├── repo/mappers.ts     # camelCase ↔ snake_case
│   ├── selectors.ts        # cálculos (ranking, faturamento)
│   ├── permissions.ts      # RBAC client (temPermissao)
│   ├── admin-guard.ts      # RBAC server (requireAdmin) — server-only
│   ├── rate-limit.ts       # rate limit em memória — server-only
│   └── use-ranking.ts      # ranking agregado via RPC
├── proxy.ts                # middleware (Next 16): refresh de sessão
supabase/schema.sql         # schema completo do banco
```

---

## Rodar localmente

```bash
npm install                  # instala dependências
cp .env.example .env.local   # e preencha com suas chaves Supabase
npm run dev                  # http://localhost:3000
```

Sem `.env.local` o app roda em **modo demo** (dados locais no navegador).
Com as chaves, conecta no Supabase real.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |

---

## Papéis de acesso (RBAC)

| Papel | Acesso |
|---|---|
| **admin** | Tudo: todos os dados, admin, financeiro, configs |
| **coordenador** | Tudo do org + financeiro/relatórios (sem admin) |
| **supervisor** | Tudo do org + vendedores/metas |
| **vendedor** | Só os próprios leads/vendas/clientes + ranking/metas |

Isolamento por **RLS no banco** (`owner_id`) + **guards de rota** + **menu dinâmico**.

---

## Fluxo comercial automático

```
Lead criado → vendedor vinculado → arrasta pra FECHAMENTO
                                          ↓ (trigger SQL lead_para_venda)
                              venda criada automaticamente (sem duplicar)
                                          ↓ (Supabase Realtime)
        Financeiro soma · Comissão calcula · Ranking atualiza · Meta atualiza
```

---

## Documentação

- [DEPLOY.md](./DEPLOY.md) — subir/atualizar em produção
- [SECURITY.md](./SECURITY.md) — modelo de segurança e secrets
- [BACKUP.md](./BACKUP.md) — backup e disaster recovery
- `supabase/schema.sql` — schema completo (recriar banco do zero)
