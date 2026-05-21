import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Valida que o caller está logado e é admin do org.
 * Retorna { userId, orgId } pra usar na lógica do handler, ou Response com 401/403.
 */
export async function requireAdmin(): Promise<
  { userId: string; orgId: string; email: string } | Response
> {
  const sb = await supabaseServer();
  const { data: userRes } = await sb.auth.getUser();
  const user = userRes.user;
  if (!user) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, papel, vendedor_id, email")
    .eq("id", user.id)
    .single();
  if (error || !profile) {
    return Response.json({ error: "Profile não encontrado" }, { status: 403 });
  }
  if (profile.papel !== "admin") {
    return Response.json({ error: "Apenas admin pode acessar" }, { status: 403 });
  }
  // Org = vendedor_id se houver, senão o próprio id (admin do org é o dono)
  const orgId = profile.vendedor_id ?? profile.id;
  return { userId: user.id, orgId, email: profile.email };
}
