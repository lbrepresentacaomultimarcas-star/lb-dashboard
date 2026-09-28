import type { NextConfig } from "next";

/**
 * Resolve o host do Supabase pra inserir no CSP.
 * Defensivo: se a env var estiver malformada (espaço, quebra de linha,
 * aspas extras), cai pra wildcard ao invés de explodir o build.
 */
function resolveSupabaseHost(): string {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!raw) return "*.supabase.co";
  try {
    return new URL(raw).host;
  } catch {
    // URL inválida — log no build pra ajudar debug, mas não quebra
    console.warn(
      `[next.config] NEXT_PUBLIC_SUPABASE_URL inválida ("${raw.slice(0, 40)}…"). Usando wildcard.`,
    );
    return "*.supabase.co";
  }
}

const supabaseHost = resolveSupabaseHost();

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `img-src 'self' data: blob: https://${supabaseHost}`,
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * A VERSÃO DESTE DEPLOY, visível para o navegador.
 *
 * Serve para o service worker trocar de cache a cada publicação. Vem do commit
 * que a Vercel está publicando; fora dela (build local) vira "dev".
 *
 * É lida aqui, no build, e não em tempo de execução: assim o valor é o mesmo
 * em todos os arquivos gerados por esta publicação.
 */
const versaoDoApp = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "dev";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: versaoDoApp },
  compress: true,
  poweredByHeader: false,
  // pdf-parse/pdfjs precisam do require nativo do Node (o bundle de navegador
  // referencia DOMMatrix, que não existe no runtime serverless).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // O pdfjs carrega o worker (pdf.worker.mjs) por import dinâmico de caminho
  // calculado — o tracing não enxerga; sem isso a função sobe sem o arquivo.
  outputFileTracingIncludes: {
    "/api/resultados/extrair": [
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/pdf-parse/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
    ],
    "/api/resultados/sync": [
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/pdf-parse/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
