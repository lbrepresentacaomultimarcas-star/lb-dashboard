/* LB Dashboard — Service Worker
 * Estratégia:
 * - Navegações (HTML): network-first com fallback offline
 * - Assets estáticos (_next/static, ícones): stale-while-revalidate
 * - NUNCA cacheia /api/* nem o Supabase (dados sempre frescos)
 */
/*
 * A VERSÃO VEM DO ENDEREÇO DESTE ARQUIVO (/sw.js?v=...).
 *
 * Era uma constante trocada na mão, e ficou parada em "lb-v8" desde
 * 07/08/2026. Como o `activate` abaixo só apaga cache que NÃO começa com a
 * versão, nada nunca era apagado: arquivos de agosto continuavam sendo
 * servidos em setembro.
 *
 * Agora quem registra passa a versão do deploy, e cada publicação ganha um
 * cache próprio — o antigo é apagado na ativação. O valor fixo continua como
 * rede de segurança para um navegador que registre sem o parâmetro.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "lb-v8";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca interceptar API/auth/Supabase — dados sempre da rede
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.hostname.endsWith("supabase.co")
  ) {
    return;
  }

  // Navegação de página: network-first, fallback offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL)),
        ),
    );
    return;
  }

  // Assets estáticos: stale-while-revalidate
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/icon")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
