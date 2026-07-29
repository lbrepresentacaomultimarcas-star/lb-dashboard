/**
 * Base URL do sistema para os links de e-mail (convite, magic link, recuperação
 * de senha e o Auth Callback).
 *
 * Regra:
 *  - Em PRODUÇÃO, defina `NEXT_PUBLIC_SITE_URL` = domínio oficial na Vercel.
 *    Todos os links passam a usar ELE, de forma determinística — nunca localhost,
 *    mesmo que a ação seja disparada de uma URL de preview.
 *  - Sem a env (ex.: rodando local), cai no `fallback` (origin da requisição no
 *    servidor / do navegador no client) → localhost em dev, como esperado.
 *
 * Funciona tanto no servidor quanto no client (var NEXT_PUBLIC_ é inlined no bundle).
 */
export function siteBaseUrl(fallback: string): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/+$/, "");
  return fallback;
}
