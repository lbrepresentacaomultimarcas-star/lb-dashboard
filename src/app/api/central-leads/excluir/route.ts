import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Exclusão de lead da Central — LÓGICA, nunca destrutiva.
 *
 * O lead recebe `excluido_em` e some da fila, das métricas e do ranking. A
 * linha continua no banco com todos os dados e a timeline, então dá para
 * auditar depois e até restaurar. Nada é apagado de verdade.
 *
 * Fica no servidor de propósito: `requireAdmin` é a garantia real de que só
 * administrador exclui — esconder o botão na tela não seria garantia nenhuma.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId, email, userId } = guard;

  const body = (await req.json().catch(() => ({}))) as {
    ids?: string[];
    motivo?: string;
    restaurar?: boolean;
  };
  const ids = (body.ids ?? []).filter((s) => typeof s === "string" && s.length > 0);
  if (ids.length === 0) {
    return Response.json({ error: "Nenhum lead informado." }, { status: 400 });
  }
  if (ids.length > 200) {
    return Response.json({ error: "Muitos leads de uma vez (máximo 200)." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const restaurar = body.restaurar === true;

  const patch = restaurar
    ? { excluido_em: null, excluido_por: null, excluido_motivo: null }
    : {
        excluido_em: new Date().toISOString(),
        excluido_por: email,
        excluido_motivo: body.motivo?.trim() || "Removido pelo administrador",
      };

  const { data, error } = await db
    .from("central_leads")
    .update(patch)
    .eq("org_id", orgId)
    .in("id", ids)
    .select("id, nome");

  if (error) {
    console.error("[central] falha ao excluir lead:", error.message);
    return Response.json({ error: "Não consegui concluir a exclusão." }, { status: 500 });
  }

  const afetados = (data as { id: string; nome: string }[]) ?? [];

  // registra na timeline de cada lead, para o histórico não ter buraco
  if (afetados.length > 0) {
    await db.from("central_leads_eventos").insert(
      afetados.map((l) => ({
        org_id: orgId,
        central_lead_id: l.id,
        tipo: "editado",
        campo: restaurar ? "restaurado" : "excluido",
        valor_novo: restaurar ? null : (body.motivo?.trim() || "Removido pelo administrador"),
        detalhe: restaurar
          ? `Lead restaurado por ${email}.`
          : `Lead removido da Central por ${email}. O registro continua no banco.`,
        autor_id: userId,
        autor_nome: email,
      })),
    );
  }

  return Response.json({ ok: true, afetados: afetados.length, restaurados: restaurar });
}
