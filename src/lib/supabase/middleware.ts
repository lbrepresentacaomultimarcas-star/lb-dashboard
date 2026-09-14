import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Atualiza sessão no cookie. Defensivo: NUNCA pode 500 — em qualquer falha
 * a request segue normal (client browser refaz o handshake se precisar).
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !key) return response;

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) {
              response.cookies.set(name, value, options);
            }
          } catch {
            // Cookie setter pode falhar em alguns ambientes — não bloqueia
          }
        },
      },
    });

    /*
     * É AQUI QUE A SESSÃO É RENOVADA — e era aqui que a falha ficava invisível.
     *
     * `getUser()` NÃO lança exceção quando a renovação falha: devolve
     * `{ error }`. O `.catch()` abaixo só pega exceção, então o caso real
     * passava em silêncio e a requisição seguia com o token velho — que os
     * guardas leem como 401 e o sentinela transforma em expulsão para o login.
     *
     * Nos logs de 14/09/2026 não havia UMA linha de "[proxy] session refresh
     * failed" apesar dos 401. É exatamente esse o motivo: o erro era retornado,
     * não lançado.
     *
     * Continua não derrubando a requisição — só passa a deixar rastro.
     */
    const { error: erroRefresh } = await supabase.auth.getUser().catch((e) => {
      console.error("[proxy] renovação da sessão estourou:", e);
      return { error: e as Error };
    });
    if (erroRefresh) {
      console.error("[proxy] renovação da sessão falhou:", erroRefresh.message);
    }
  } catch (e) {
    if (process.env.NODE_ENV === "production") {
      console.error("[proxy] fatal, devolvendo response sem refresh:", e);
    }
  }

  return response;
}
