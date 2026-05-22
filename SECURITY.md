# Segurança — LB Dashboard

## Modelo de segurança em camadas

```
1. Vercel (HTTPS + headers)  →  2. Proxy/middleware (refresh sessão)
   →  3. Guards de rota (RBAC client)  →  4. RLS no Postgres (autoridade final)
```

A **autoridade final** é o RLS no banco. Mesmo que o frontend tenha bug, o
Postgres só devolve os dados que o papel do usuário pode ver.

---

## 1. Secrets / chaves

| Chave | Onde fica | Exposição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel env + `.env.local` | Pública (vai pro browser) — OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env + `.env.local` | Pública (protegida por RLS) — OK |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env + `.env.local` | **SECRETA** — só servidor |

### Regras
- A `service_role` **nunca** tem prefixo `NEXT_PUBLIC_` → Next.js não a inclui no bundle do browser.
- É importada só em arquivos com `import "server-only"`:
  - `src/lib/supabase/admin.ts`
  - `src/lib/admin-guard.ts`
- `.env.local` está no `.gitignore` → nunca vai pro GitHub.
- Validação: `grep -r "sb_secret" src/` deve retornar **zero** valores literais.

### Se uma secret vazar
1. Supabase → Project Settings → API Keys → **Rotate** a chave vazada.
2. Vercel → Settings → Environment Variables → atualiza o valor.
3. Redeploy (Deployments → Redeploy).

---

## 2. Autenticação

- **Supabase Auth** (email + senha). Sessão em cookie HttpOnly.
- `src/proxy.ts` (middleware) renova o token a cada request.
- `AuthGuard` redireciona pra `/login` se não houver sessão.
- Senha mínima 6 caracteres (regra do Supabase).

### Recomendado em produção
- Habilitar **MFA**: Supabase → Authentication → Multi-Factor.
- Habilitar **"Confirm email"** se quiser validar emails de convidados.

---

## 3. RBAC (controle de acesso por papel)

Papéis: `admin > coordenador > supervisor > vendedor`.

| Camada | Arquivo | Função |
|---|---|---|
| Client (UI) | `lib/permissions.ts` | `temPermissao()` — esconde menu/bloqueia tela |
| Client (rota) | `components/role-guard.tsx` | Bloqueia página por papel mínimo |
| Server (API) | `lib/admin-guard.ts` | `requireAdmin()` — valida papel + rate limit |
| Banco | RLS policies | Autoridade final |

---

## 4. RLS (Row Level Security)

Todas as tabelas têm RLS habilitado. Funções auxiliares:
- `current_org_id()` — isolamento multi-tenant (cada empresa só vê o seu).
- `current_papel()` — papel do usuário logado.
- `is_gestor()` — true se admin/coordenador/supervisor.

### Regras por tabela
- **leads / vendas / clientes:** gestor vê tudo do org; vendedor vê só `owner_id = auth.uid()`.
- **audit_log:** gestor vê tudo; vendedor vê só os próprios logs.
- **profiles:** cada um lê/edita o próprio (admin gerencia via service_role nas rotas /api/admin).
- **vendedores / metas / equipes / producoes:** leitura/escrita por org.

### Validar RLS
```sql
-- Confirma que RLS está ON em todas as tabelas
select tablename, rowsecurity from pg_tables where schemaname = 'public';
```

---

## 5. Headers de segurança (`next.config.ts`)

- `Content-Security-Policy` — restringe origens (self + Supabase)
- `Strict-Transport-Security` — força HTTPS (2 anos)
- `X-Frame-Options: DENY` — anti-clickjacking
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — bloqueia câmera/mic/geo
- `poweredByHeader: false` — esconde o framework

---

## 6. Rate limiting

`src/lib/rate-limit.ts` — token bucket em memória, 60 req/min por IP nas rotas
`/api/admin/*`. Para escala maior, migrar para Upstash Redis / Vercel KV.

---

## Checklist de segurança

- [ ] `service_role` sem prefixo `NEXT_PUBLIC_` na Vercel
- [ ] `.env.local` não versionado (`git ls-files | grep .env` vazio)
- [ ] RLS habilitado em todas as tabelas
- [ ] MFA habilitado na conta admin do Supabase
- [ ] Headers de segurança ativos (testar em securityheaders.com)
- [ ] Service_role rotacionada se já apareceu em chat/log
