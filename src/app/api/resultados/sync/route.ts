import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { msgCompleta, sincronizarMesCorrente } from "@/lib/server/resultados-drive";
import { parsearResultados } from "@/lib/resultados-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Sincronização AUTOMÁTICA dos Resultados LB: navega a pasta oficial da
 *  administradora (salva no sistema — sem link manual), baixa os PDFs de
 *  resultado do mês corrente, extrai e parseia NO SERVIDOR e devolve as
 *  contemplações de Sergipe prontas. A gravação acontece no cliente (com a
 *  sessão do usuário, RLS normal) e o Realtime propaga pra todo mundo. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const log: string[] = [`🧠 Servidor Node ${process.version} · sincronização automática.`];
  try {
    const { texto, arquivos } = await sincronizarMesCorrente(log);
    if (!texto.trim()) {
      return Response.json(
        { error: "Nenhum PDF de resultado disponível pra sincronizar agora.", log },
        { status: 404 },
      );
    }
    const agora = new Date();
    const mesRef = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
    const r = parsearResultados(texto, mesRef, "sincronização automática");
    log.push(
      `🏁 Parse: ${r.grupos} grupos · ${r.totalBrasil} contemplações no Brasil · ${r.totalSE} de Sergipe.`,
    );
    return Response.json({
      linhas: r.itens,
      totalBrasil: r.totalBrasil,
      totalSE: r.totalSE,
      grupos: r.grupos,
      arquivos,
      log,
    });
  } catch (e) {
    const m = msgCompleta(e);
    log.push(`✖ ${m}`);
    console.error("[resultados/sync]", m, "| log:", log);
    return Response.json({ error: m, log }, { status: 500 });
  }
}
