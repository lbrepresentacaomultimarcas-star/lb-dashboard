import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { requireAdmin } from "@/lib/admin-guard";
import { siteBaseUrl } from "@/lib/site-url";
import { urlAutorizacao, credenciaisPresentes } from "@/lib/server/meta-api";
import { cofrePronto } from "@/lib/server/meta-crypto";
import { COOKIE_STATE, redirectUri } from "@/lib/server/meta-oauth";

export const dynamic = "force-dynamic";

/**
 * Passo 1 do "Conectar Meta".
 *
 * O botão da tela navega para cá. Aqui o sistema confere que quem clicou é
 * administrador, cria um código de proteção (state) contra pedido forjado e
 * manda o navegador para a tela oficial de autorização da Meta.
 *
 * Nenhum segredo aparece na URL: vai só o App ID (que é público) e o state.
 */

function voltarComErro(req: NextRequest, msg: string) {
  const destino = new URL("/configuracoes", siteBaseUrl(req.nextUrl.origin));
  destino.searchParams.set("meta", "erro");
  destino.searchParams.set("msg", msg);
  return NextResponse.redirect(destino);
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) {
    // navegação de browser: em vez de JSON, volta pra tela com o aviso
    return voltarComErro(
      req,
      guard.status === 401
        ? "Entre no sistema antes de conectar."
        : "Só o administrador pode conectar a Meta.",
    );
  }

  const cred = credenciaisPresentes();
  if (!cred.appId || !cred.appSecret) {
    return voltarComErro(
      req,
      "Faltam as credenciais do aplicativo da Meta no servidor (META_APP_ID / META_APP_SECRET).",
    );
  }
  if (!cofrePronto()) {
    return voltarComErro(
      req,
      "Falta a chave de segurança que protege os tokens (META_TOKEN_KEY).",
    );
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const resposta = NextResponse.redirect(urlAutorizacao(redirectUri(req), state));

  // o state fica num cookie que só o servidor lê; a volta da Meta tem que bater
  resposta.cookies.set(COOKIE_STATE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // a Meta devolve por navegação GET — lax é o necessário
    path: "/",
    maxAge: 600, // 10 minutos para concluir a autorização
  });
  return resposta;
}
