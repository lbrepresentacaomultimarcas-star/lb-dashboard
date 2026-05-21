import { readFileSync } from "node:fs";
import { Client } from "pg";

const password = process.argv[2];
const projectRef = "qjxmzttfdgivlsfxfwsc";

if (!password) {
  console.error("Uso: node scripts/run-schema.mjs <senha-do-banco>");
  process.exit(1);
}

const candidates = [
  `postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  `postgres.${projectRef}:${encodeURIComponent(password)}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`,
];

const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

let lastErr = null;
for (const conn of candidates) {
  const url = `postgresql://${conn}`;
  console.log(`\n→ Tentando: ${url.replace(encodeURIComponent(password), "***")}`);
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("  Conectado!");
    await client.query(sql);
    console.log("✓ Schema aplicado com sucesso");
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log(`  Falhou: ${e.message}`);
    lastErr = e;
    try {
      await client.end();
    } catch {}
  }
}

console.error("\n✗ Não consegui conectar em nenhum host. Último erro:", lastErr?.message);
process.exit(1);
