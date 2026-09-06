import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIdFromRequest, rateLimit } from "./rate-limit";
import { BLOQUEADO } from "./mensagens-acesso";

/**
 * Valida que o caller está logado, é admin do org e está dentro do rate limit.
 * Retorna { userId, orgId } pra usar na lógica do handler, ou Response com 401/403/429.
 */
export async function requireAdmin(
  req?: Request,
): Promise<{ userId: string; orgId: string; email: string } | Response> {
  // Rate limit por IP — 60 req / minuto pra cada IP fazendo chamadas admin
  if (req) {
    const ip = clientIdFromRequest(req);
    const rl = rateLimit(`admin:${ip}`, { capacity: 60, refillPerSec: 1 });
    if (!rl.ok) {
      return Response.json(
        { error: "Muitas requisições. Aguarde alguns segundos." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }
  }

  const sb = await supabaseServer();
  const { data: userRes } = await sb.auth.getUser();
  const user = userRes.user;
  if (!user) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, papel, vendedor_id, email, ativo, codigo_liberado")
    .eq("id", user.id)
    .single();
  if (error || !profile) {
    return Response.json({ error: "Profile não encontrado" }, { status: 403 });
  }
  // Conta bloqueada não opera, nem sendo admin. Vem antes da checagem de
  // cargo: quem foi bloqueado está bloqueado. (NULL = ativo; bloquear é
  // sempre explícito.)
  if (profile.ativo === false) {
    return Response.json({ error: BLOQUEADO, bloqueado: true }, { status: 403 });
  }
  if (profile.codigo_liberado === false) {
    return Response.json(
      { error: "Seu acesso ainda não foi liberado pelo administrador.", bloqueado: true },
      { status: 403 },
    );
  }
  if (profile.papel !== "admin") {
    return Response.json({ error: "Apenas admin pode acessar" }, { status: 403 });
  }
  const orgId = profile.vendedor_id ?? profile.id;
  return { userId: user.id, orgId, email: profile.email };
}
