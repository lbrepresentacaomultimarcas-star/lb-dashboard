import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { ErroMeta, listarFormularios } from "@/lib/server/meta-api";
import {
  definirFormulariosAtivos,
  formulariosDaOrg,
  guardarFormularios,
  paginasDaOrg,
  tokenDaPagina,
} from "@/lib/server/meta-conexao";

export const dynamic = "force-dynamic";

async function paginaAtual(orgId: string, pedida?: string | null) {
  const paginas = await paginasDaOrg(orgId);
  if (pedida) return paginas.find((p) => p.pageId === pedida) ?? null;
  return paginas.find((p) => p.selecionada) ?? null;
}

/** GET — formulários da Página, relidos na Meta (mantém o que já foi marcado). */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId } = guard;

  const pagina = await paginaAtual(orgId, req.nextUrl.searchParams.get("pageId"));
  if (!pagina) return Response.json({ error: "Escolha uma Página primeiro." }, { status: 400 });

  const token = await tokenDaPagina(orgId, pagina.pageId);
  if (token) {
    try {
      const forms = await listarFormularios(pagina.pageId, token);
      await guardarFormularios(
        orgId,
        pagina.pageId,
        forms.map((f) => ({ formId: f.id, nome: f.name, status: f.status })),
      );
    } catch (e) {
      // devolve o que está guardado em vez de deixar a tela sem nada
      console.error("[meta] falha ao reler formulários:", e instanceof ErroMeta ? e.message : e);
    }
  }

  return Response.json({
    pageId: pagina.pageId,
    formularios: await formulariosDaOrg(orgId, pagina.pageId),
  });
}

/**
 * POST — define QUAIS formulários entregam leads.
 *
 * Desmarcar não apaga nada: só faz o webhook ignorar os próximos leads daquele
 * formulário. O histórico já recebido continua na Central.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId } = guard;

  const body = (await req.json().catch(() => ({}))) as { pageId?: string; ativos?: string[] };
  const pagina = await paginaAtual(orgId, body.pageId);
  if (!pagina) return Response.json({ error: "Escolha uma Página primeiro." }, { status: 400 });

  const ativos = Array.isArray(body.ativos) ? body.ativos.filter((s) => typeof s === "string") : [];
  await definirFormulariosAtivos(orgId, pagina.pageId, ativos);

  return Response.json({
    ok: true,
    ativos: ativos.length,
    formularios: await formulariosDaOrg(orgId, pagina.pageId),
  });
}
