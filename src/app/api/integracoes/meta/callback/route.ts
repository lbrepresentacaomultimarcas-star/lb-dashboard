import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { siteBaseUrl } from "@/lib/site-url";
import {
  ErroMeta,
  inspecionarToken,
  listarPaginas,
  perfil,
  primeiroNegocio,
  tokenLongaDuracao,
  trocarCodePorToken,
} from "@/lib/server/meta-api";
import { guardarPaginas, salvarConexao } from "@/lib/server/meta-conexao";
import { COOKIE_STATE, redirectUri } from "@/lib/server/meta-oauth";

export const dynamic = "force-dynamic";

/**
 * Passo 2 do "Conectar Meta": a volta da autorização.
 *
 * A Meta manda o navegador de volta para cá com um `code`. O servidor troca
 * esse código por um token de longa duração, guarda CIFRADO, já lista as
 * Páginas e devolve o usuário para Configurações — que abre no passo seguinte.
 *
 * O token nunca passa pela tela nem aparece na URL de retorno.
 */

function voltar(req: NextRequest, params: Record<string, string>) {
  const destino = new URL("/configuracoes", siteBaseUrl(req.nextUrl.origin));
  for (const [k, v] of Object.entries(params)) destino.searchParams.set(k, v);
  destino.hash = "integracoes";
  return NextResponse.redirect(destino);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  // o usuário pode ter clicado em "Cancelar" na tela da Meta
  const erroMeta = p.get("error_description") ?? p.get("error");
  if (erroMeta) {
    return voltar(req, { meta: "erro", msg: `A Meta não concluiu: ${erroMeta}` });
  }

  const code = p.get("code");
  const state = p.get("state");
  const esperado = req.cookies.get(COOKIE_STATE)?.value;

  if (!code || !state || !esperado || state !== esperado) {
    return voltar(req, {
      meta: "erro",
      msg: "A autorização expirou ou veio de outro lugar. Clique em Conectar de novo.",
    });
  }

  const guard = await requireAdmin(req);
  if (guard instanceof Response) {
    return voltar(req, { meta: "erro", msg: "Sessão perdida no meio da autorização. Entre e tente de novo." });
  }
  const { orgId, email } = guard;

  try {
    const curto = await trocarCodePorToken(code, redirectUri(req));
    const { token, expiraEm } = await tokenLongaDuracao(curto);

    const [eu, info] = await Promise.all([
      perfil(token).catch(() => ({ id: "", name: undefined })),
      inspecionarToken(token),
    ]);
    const negocio = await primeiroNegocio(token);

    const conexaoId = await salvarConexao(orgId, {
      token,
      metaUserId: eu.id || info.userId,
      metaUserNome: eu.name,
      businessId: negocio?.id ?? null,
      businessNome: negocio?.name ?? null,
      escopos: info.escopos,
      expiraEm: expiraEm ?? info.expiraEm,
      conectadoPor: email,
    });

    // já traz as Páginas para o passo 2 abrir preenchido
    let quantas = 0;
    try {
      const paginas = await listarPaginas(token);
      quantas = paginas.length;
      await guardarPaginas(
        orgId,
        conexaoId,
        paginas.map((pg) => ({
          pageId: pg.id,
          nome: pg.name,
          categoria: pg.category,
          fotoUrl: pg.picture?.data?.url,
          token: pg.access_token,
        })),
      );
    } catch (e) {
      console.error("[meta] conectou, mas falhou ao listar Páginas:", e);
    }

    const resposta = voltar(req, {
      meta: "conectado",
      paginas: String(quantas),
    });
    resposta.cookies.delete(COOKIE_STATE);
    return resposta;
  } catch (e) {
    const msg =
      e instanceof ErroMeta
        ? e.message
        : e instanceof Error
          ? e.message
          : "Não consegui concluir a conexão.";
    console.error("[meta] falha no callback:", msg);
    const resposta = voltar(req, { meta: "erro", msg });
    resposta.cookies.delete(COOKIE_STATE);
    return resposta;
  }
}
