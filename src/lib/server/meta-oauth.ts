import "server-only";

import type { NextRequest } from "next/server";
import { siteBaseUrl } from "@/lib/site-url";

/**
 * Peças compartilhadas entre "conectar" e "callback".
 *
 * Ficam aqui e não dentro das rotas porque um arquivo route.ts do Next só pode
 * exportar os handlers (GET/POST/…) e as opções de rota — qualquer export extra
 * quebra a checagem de tipos do build.
 */

/** Cookie que guarda o código anti-fraude (state) durante a autorização. */
export const COOKIE_STATE = "lb_meta_state";

/** URL de retorno — precisa ser IDÊNTICA à cadastrada no app da Meta. */
export function redirectUri(req: NextRequest): string {
  return `${siteBaseUrl(req.nextUrl.origin)}/api/integracoes/meta/callback`;
}
