import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Roster (elenco) da EMPRESA do usuário logado — qualquer cargo pode ler.
 * Colunas mínimas para o motor de escopo do RBAC (lib/scope.ts) montar, no
 * client, quem pertence a cada equipe (equipe_id) e o vínculo de vendas de
 * cada um (vendedor_ref).
 *
 * Isolado por empresa: só devolve profiles da mesma org do caller. Não expõe
 * dados de outras empresas (SaaS). RLS-ready: no futuro isso vira uma função
 * SQL security-definer / policies, sem mudar o consumo no store.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: userRes } = await sb.auth.getUser();
  const user = userRes.user;
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: me } = await admin
    .from("profiles")
    .select("id, vendedor_id")
    .eq("id", user.id)
    .single();
  if (!me) return Response.json({ error: "Profile não encontrado" }, { status: 403 });

  // org = UUID do dono (vendedor_id do profile) ou o próprio id (admin dono).
  const orgId = (me.vendedor_id as string | null) ?? me.id;

  const { data, error } = await admin
    .from("profiles")
    .select("id, nome, email, papel, vendedor_id, equipe_id, vendedor_ref, ativo, criado_em")
    .or(`id.eq.${orgId},vendedor_id.eq.${orgId}`)
    .order("criado_em", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ roster: data ?? [] });
}
