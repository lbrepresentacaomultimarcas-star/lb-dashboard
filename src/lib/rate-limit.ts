import "server-only";

/**
 * Rate limit em memória (token bucket simples).
 *
 * Bom o suficiente pra defender APIs admin contra abuso trivial.
 * Pra produção em larga escala, trocar por Upstash Redis ou Vercel KV.
 *
 * Limitações:
 * - Em deploys multi-instância (Vercel scale-out), cada instância tem seu próprio bucket.
 * - Não persiste — reinicia ao restart.
 */
type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  opts: { capacity?: number; refillPerSec?: number } = {},
): { ok: boolean; remaining: number; retryAfter: number } {
  const capacity = opts.capacity ?? 30;
  const refill = opts.refillPerSec ?? 1; // 1 token/segundo
  const now = Date.now();

  const cur = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const elapsed = (now - cur.updatedAt) / 1000;
  const tokens = Math.min(capacity, cur.tokens + elapsed * refill);

  if (tokens < 1) {
    const retryAfter = Math.ceil((1 - tokens) / refill);
    buckets.set(key, { tokens, updatedAt: now });
    return { ok: false, remaining: 0, retryAfter };
  }

  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  return { ok: true, remaining: Math.floor(tokens - 1), retryAfter: 0 };
}

export function clientIdFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || "unknown";
  return ip;
}
