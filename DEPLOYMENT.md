# Deploy — LB Dashboard 2.0

## 1. GitHub (uma vez)

```powershell
cd C:\Users\Home\lb-dashboard-v2
# git já inicializado e commitado; só falta o remote + push:
git remote add origin https://github.com/SEU-USUARIO/lb-dashboard.git
git push -u origin main
```

Use **Personal Access Token** como senha (gerar em https://github.com/settings/tokens/new com scope `repo`).

## 2. Vercel

1. https://vercel.com/new → importa o repo
2. Framework: Next.js (auto-detectado)
3. **Environment Variables** — adicionar nas 3 envs (Production, Preview, Development):

| Name | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qjxmzttfdgivlsfxfwsc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (a publishable key do Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | (a service_role secret — **sem** prefixo `NEXT_PUBLIC_`) |

4. Deploy.

## 3. Supabase — URL Configuration

https://supabase.com/dashboard/project/qjxmzttfdgivlsfxfwsc/auth/url-configuration

- **Site URL:** `https://SEU-DOMINIO.vercel.app`
- **Redirect URLs:** adicionar:
  - `http://localhost:3000/auth/callback`
  - `https://SEU-DOMINIO.vercel.app/auth/callback`
  - `https://*.vercel.app/auth/callback` (cobre Preview deployments)

## 4. Comandos úteis

```powershell
npm run dev          # dev local
npm run build        # build produção
npm run lint         # ESLint
npx tsc --noEmit     # type check
```

## 5. Schema do banco

`supabase/schema.sql` tem o schema completo. Pra resetar/recriar: cola tudo no SQL Editor do Supabase.
