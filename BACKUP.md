# Backup e Disaster Recovery — LB Dashboard

O sistema tem 3 ativos que precisam de backup: **código**, **banco** e **secrets**.

| Ativo | Onde | Backup |
|---|---|---|
| Código | GitHub | Git (histórico completo) |
| Banco (dados) | Supabase Postgres | Backup automático Supabase + export manual |
| Schema | `supabase/schema.sql` | Versionado no Git |
| Secrets (env vars) | Vercel + `.env.local` | Cofre/gerenciador de senhas |

---

## 1. Código (GitHub)

Já versionado. Todo `git push` é um backup. Para clonar do zero:
```bash
git clone https://github.com/lbrepresentacaomultimarcas-star/lb-dashboard.git
```

**Recomendado:** proteger a branch `main` (Settings → Branches → Protect) e
ativar 2FA na conta GitHub.

---

## 2. Banco Supabase

### Backup automático (já ativo)
- Plano Free: backups diários retidos por 7 dias.
- Plano Pro: Point-in-Time Recovery (PITR).
- Local: Supabase Dashboard → Database → Backups.

### Backup manual (recomendado semanal)
**Opção A — pelo app (mais simples):**
- Login como admin → **Relatórios → "Backup completo (JSON)"**.
- Baixa um JSON com vendedores, vendas, clientes, leads.

**Opção B — SQL dump (completo):**
- Supabase → Database → Backups → "Download backup", OU
- Via CLI:
  ```bash
  # precisa da connection string (Settings → Database)
  pg_dump "postgresql://postgres:[SENHA]@db.qjxmzttfdgivlsfxfwsc.supabase.co:5432/postgres" \
    --no-owner --no-privileges -f backup_$(date +%Y%m%d).sql
  ```

### Schema (estrutura)
O arquivo `supabase/schema.sql` recria todas as tabelas, RLS, triggers e funções
do zero. Mantê-lo atualizado a cada mudança estrutural.

---

## 3. Secrets / env vars

Guardar em gerenciador de senhas (1Password, Bitwarden, etc.):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Senha do banco Postgres (Supabase → Settings → Database)
- Personal Access Token do GitHub (se usado)

---

## Disaster Recovery — restaurar o sistema do zero

### Cenário A: perdi o deploy (Vercel sumiu)
1. Vercel → New Project → importa o repo `lb-dashboard`.
2. Adiciona as 3 env vars.
3. Deploy. (O banco continua intacto no Supabase.)

### Cenário B: perdi o banco (Supabase)
1. Cria novo projeto Supabase.
2. SQL Editor → cola e roda `supabase/schema.sql` (recria estrutura).
3. Restaura os dados:
   - Do backup SQL: `psql [...] -f backup_YYYYMMDD.sql`, OU
   - Do JSON do app: re-importar (manual).
4. Atualiza as env vars na Vercel com a URL/keys do novo projeto.
5. Atualiza Site URL + Redirect URLs no novo Supabase Auth.
6. Redeploy.

### Cenário C: perdi tudo
1. Clona o repo do GitHub.
2. Recria Supabase (Cenário B).
3. Recria Vercel (Cenário A).
4. Restaura dados do último backup.

**Tempo estimado de recuperação total:** ~30 min (com backups em mãos).

---

## Rotina recomendada

| Frequência | Ação |
|---|---|
| A cada mudança de código | `git push` (automático no fluxo) |
| A cada mudança de schema | Atualizar `supabase/schema.sql` + commit |
| Semanal | Backup manual do banco (JSON ou SQL dump) |
| Mensal | Testar restore num projeto Supabase de teste |
