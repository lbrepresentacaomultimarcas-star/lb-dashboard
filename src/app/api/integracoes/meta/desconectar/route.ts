import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { desassinarLeadgen, revogarAutorizacao } from "@/lib/server/meta-api";
import {
  paginasDaOrg,
  removerConexao,
  tokenDaPagina,
  tokenDoUsuario,
} from "@/lib/server/meta-conexao";

export const dynamic = "force-dynamic";

/**
 * Desconectar a Meta.
 *
 * Desliga o recebimento na Página, retira a autorização do app na conta da Meta
 * e apaga os tokens guardados. Os leads que já entraram continuam na Central —
 * desconectar não apaga histórico.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId } = guard;

  const avisos: string[] = [];

  // 1) desliga o recebimento em cada Página selecionada
  for (const p of await paginasDaOrg(orgId)) {
    if (!p.selecionada) continue;
    const token = await tokenDaPagina(orgId, p.pageId);
    if (!token) continue;
    try {
      await desassinarLeadgen(p.pageId, token);
    } catch {
      avisos.push(`Não consegui desligar o recebimento na Página "${p.nome}".`);
    }
  }

  // 2) retira a autorização do app na conta da Meta
  const userToken = await tokenDoUsuario(orgId);
  if (userToken) {
    try {
      await revogarAutorizacao(userToken);
    } catch {
      avisos.push("Não consegui retirar a autorização na Meta — revise em Configurações da conta.");
    }
  }

  // 3) apaga o que está guardado aqui (isso sempre acontece)
  await removerConexao(orgId);

  return Response.json({ ok: true, avisos });
}
