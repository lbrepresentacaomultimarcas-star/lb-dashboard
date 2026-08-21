import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import {
  ErroMeta,
  assinarLeadgen,
  listarFormularios,
  listarPaginas,
} from "@/lib/server/meta-api";
import {
  conexaoDaOrg,
  guardarFormularios,
  guardarPaginas,
  marcarErroNaConexao,
  marcarWebhook,
  paginasDaOrg,
  selecionarPagina,
  tokenDaPagina,
  tokenDoUsuario,
} from "@/lib/server/meta-conexao";

export const dynamic = "force-dynamic";

/** GET — relê as Páginas na Meta e devolve a lista atualizada (sem tokens). */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId } = guard;

  const conexao = await conexaoDaOrg(orgId);
  const token = await tokenDoUsuario(orgId);
  if (!conexao || !token) {
    return Response.json({ error: "Conecte a Meta antes de escolher a Página." }, { status: 400 });
  }

  try {
    const paginas = await listarPaginas(token);
    await guardarPaginas(
      orgId,
      conexao.id,
      paginas.map((p) => ({
        pageId: p.id,
        nome: p.name,
        categoria: p.category,
        fotoUrl: p.picture?.data?.url,
        token: p.access_token,
      })),
    );
    return Response.json({ paginas: await paginasDaOrg(orgId) });
  } catch (e) {
    const msg = e instanceof ErroMeta ? e.message : "Não consegui falar com a Meta.";
    await marcarErroNaConexao(orgId, msg);
    return Response.json({ error: msg }, { status: 502 });
  }
}

/**
 * POST — escolhe a Página e LIGA o recebimento.
 *
 * É aqui que some a ida ao Meta Developers: o próprio CRM se inscreve nos leads
 * da Página (subscribed_apps) e já traz os formulários existentes.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId } = guard;

  const body = (await req.json().catch(() => ({}))) as { pageId?: string };
  const pageId = body.pageId?.trim();
  if (!pageId) return Response.json({ error: "Informe a Página." }, { status: 400 });

  const pageToken = await tokenDaPagina(orgId, pageId);
  if (!pageToken) {
    return Response.json(
      { error: "Não encontrei o acesso a essa Página. Clique em Conectar de novo." },
      { status: 400 },
    );
  }

  await selecionarPagina(orgId, pageId);

  // 1) inscreve o LB CRM nos leads da Página
  try {
    await assinarLeadgen(pageId, pageToken);
    await marcarWebhook(orgId, pageId, true, null);
  } catch (e) {
    const msg = e instanceof ErroMeta ? e.message : "Não consegui ativar o recebimento.";
    await marcarWebhook(orgId, pageId, false, msg);
    return Response.json(
      {
        error: msg,
        dica:
          "Confirme na Meta que você é administrador desta Página e que autorizou " +
          "todas as permissões pedidas na tela de conexão.",
      },
      { status: 502 },
    );
  }

  // 2) traz os formulários (falhar aqui não desliga o recebimento)
  let formularios = 0;
  try {
    const forms = await listarFormularios(pageId, pageToken);
    formularios = forms.length;
    await guardarFormularios(
      orgId,
      pageId,
      forms.map((f) => ({ formId: f.id, nome: f.name, status: f.status })),
    );
  } catch (e) {
    console.error("[meta] Página ativada, mas falhou ao listar formulários:", e);
  }

  return Response.json({ ok: true, pageId, formularios });
}
