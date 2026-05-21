import type { NextConfig } from "next";

const securityHeaders = [
  // Bloqueia o site de ser embedado em iframe (proteção contra clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Impede MIME-sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Política de referrer
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Bloqueia APIs sensíveis do browser que não usamos
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Habilita compressão gzip nas respostas
  compress: true,
  // Esconde o header "X-Powered-By: Next.js"
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
