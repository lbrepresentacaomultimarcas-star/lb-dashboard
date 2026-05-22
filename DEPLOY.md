# Deploy e Operação — LB Dashboard

## Arquitetura de deploy

```
GitHub (código) ──push──> Vercel (build + hospedagem) ──conecta──> Supabase (banco + auth)
```

Todo `git push` na branch `main` dispara um deploy automático na Vercel.

---

## Deploy de uma atualização (fluxo normal)

```bash
git add -A
git commit -m "descrição da mudança"
git push origin main
```
A Vercel detecta o push e faz o build/deploy em ~2-3 min. Acompanhe em
Vercel → Deployments.

---

## Deploy inicial (do zero)

### 1. GitHub
```bash
git init -b main
git add .
git commit -m "init"
git remote add origin https://github.com/SEU-USUARIO/lb-dashboard.git
git push -u origin main
```

### 2. Vercel
1. https://vercel.com/new → importa o repo.
2. Framework: Next.js (auto-detectado).
3. **Environment Variables** (Production + Preview + Development):

| Name | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qjxmzttfdgivlsfxfwsc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` (⚠️ sem prefixo NEXT_PUBLIC_) |

4. Deploy.

### 3. Supabase Auth
https://supabase.com/dashboard/project/qjxmzttfdgivlsfxfwsc/auth/url-configuration
- **Site URL:** a URL da Vercel
- **Redirect URLs:**
  - `http://localhost:3000/auth/callback`
  - `https://SUA-URL.vercel.app/auth/callback`
  - `https://*.vercel.app/auth/callback`

---

## Trocar para domínio próprio (app.lbrepresentacoes.com.br)

1. **Vercel** → projeto → Settings → Domains → Add → `app.lbrepresentacoes.com.br`.
2. A Vercel mostra um registro **CNAME**. Adiciona no DNS do provedor do domínio.
3. Aguarda propagar (minutos a algumas horas) — Vercel emite o SSL sozinho.
4. **Supabase** → Auth → URL Configuration:
   - Site URL = `https://app.lbrepresentacoes.com.br`
   - Adiciona `https://app.lbrepresentacoes.com.br/auth/callback` nas Redirect URLs.
5. **Código** → `src/app/layout.tsx` → atualiza `SITE_URL` para o domínio novo → commit + push.

---

## Migrar para outro ambiente / nova conta Supabase

1. Cria novo projeto Supabase.
2. SQL Editor → roda `supabase/schema.sql` (recria estrutura completa).
3. Restaura dados (ver BACKUP.md → Disaster Recovery).
4. Atualiza as 3 env vars na Vercel com URL/keys do novo projeto.
5. Configura Site URL + Redirect URLs no novo Supabase Auth.
6. Redeploy.

---

## Checklists operacionais

### ✅ Deploy
- [ ] `npm run lint` sem erros
- [ ] `npx tsc --noEmit` sem erros
- [ ] `npm run build` passa local
- [ ] `git push origin main`
- [ ] Vercel deploy "Ready"
- [ ] Testar `/login` em produção

### ✅ Onboarding de vendedor novo
- [ ] Admin → `/admin/colaboradores` → "Convidar usuário"
- [ ] Define email, senha (ou convite por email), papel = **vendedor**
- [ ] Cadastra o registro de vendedor em `/vendedores` (meta + comissão)
- [ ] Vincula o usuário ao registro de vendedor (campo `vendedor_ref` — por email automático, ou manual)
- [ ] Vendedor loga → vê só o pipeline/vendas dele
- [ ] Sobe a foto do vendedor em `/vendedores` (aparece no ranking)

### ✅ Backup (semanal)
- [ ] Login admin → Relatórios → Backup completo (JSON)
- [ ] OU SQL dump do Supabase (ver BACKUP.md)
- [ ] Guardar fora do sistema (Drive/cofre)

### ✅ Segurança (mensal)
- [ ] Conferir RLS ativo (ver SECURITY.md)
- [ ] Confirmar `.env.local` não versionado
- [ ] MFA ativo na conta admin Supabase
- [ ] Rotacionar service_role se necessário

---

## Troubleshooting rápido

| Sintoma | Causa provável | Fix |
|---|---|---|
| Login em "modo demo" | Env vars não chegaram no build | Conferir 3 vars na Vercel + redeploy sem cache |
| 404 em rotas `(app)` no dev | Cache Turbopack corrompido | `rm -rf .next && npm run dev` |
| 500 no `/login` | Erro no proxy/middleware | Ver Vercel Runtime Logs |
| Convite por email não completa | Redirect URL não configurada | Adicionar `/auth/callback` no Supabase |
| Build falha "Invalid URL" | env var malformada | Conferir valor sem aspas/espaços |
