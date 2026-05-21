/**
 * Validação de variáveis de ambiente.
 * Importe esse módulo em qualquer arquivo server-side pra falhar cedo
 * se algo estiver mal configurado.
 */

type EnvShape = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
};

function check(name: keyof EnvShape, required: boolean): string {
  const v = process.env[name];
  if (!v && required) {
    throw new Error(
      `[env] ${name} não está definida. Verifique seu .env.local (dev) ou as Environment Variables da Vercel (prod).`,
    );
  }
  return v ?? "";
}

export const env = {
  // Públicas (chegam no browser)
  SUPABASE_URL: check("NEXT_PUBLIC_SUPABASE_URL", true),
  SUPABASE_ANON_KEY: check("NEXT_PUBLIC_SUPABASE_ANON_KEY", true),
  // Server-only (NUNCA exposta ao client — Next bloqueia sem prefixo NEXT_PUBLIC_)
  SUPABASE_SERVICE_ROLE_KEY: check("SUPABASE_SERVICE_ROLE_KEY", false),
  NODE_ENV: process.env.NODE_ENV ?? "development",
} as const;

export const isProduction = env.NODE_ENV === "production";
