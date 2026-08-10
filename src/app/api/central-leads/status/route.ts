import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Status da conexão com a Meta (cartão em Configurações).
 *
 * Só admin. Devolve BOOLEANOS sobre a configuração (nunca o valor de nenhum
 * segredo) + um resumo dos leads que já chegaram pelo WhatsApp.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  // configuração do ambiente — só presença, jamais o conteúdo
  const config = {
    verifyToken: !!process.env.META_VERIFY_TOKEN,
    appSecret: !!process.env.META_APP_SECRET,
    orgId: !!process.env.LB_ORG_ID,
  };

  const db = supabaseAdmin();
  const orgId = process.env.LB_ORG_ID ?? auth.orgId;

  const { data: ultimos } = await db
    .from("central_leads")
    .select("nome, telefone, produto, origem, recebido_em")
    .eq("org_id", orgId)
    .like("origem", "%WhatsApp%")
    .order("recebido_em", { ascending: false })
    .limit(1);

  const { count } = await db
    .from("central_leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .like("origem", "%WhatsApp%");

  const ultimo = ultimos?.[0] ?? null;

  return Response.json({
    config,
    pronto: config.verifyToken && config.appSecret && config.orgId,
    callbackUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://lb-dashboard-virid.vercel.app"}/api/central-leads/intake`,
    totalRecebidos: count ?? 0,
    ultimo: ultimo
      ? {
          nome: ultimo.nome,
          telefone: ultimo.telefone,
          produto: ultimo.produto,
          origem: ultimo.origem,
          recebidoEm: ultimo.recebido_em,
        }
      : null,
  });
}
