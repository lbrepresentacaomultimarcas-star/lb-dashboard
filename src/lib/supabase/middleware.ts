import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Atualiza sessão no cookie. Defensivo: NUNCA pode 500 — em qualquer falha
 * a request segue normal (client browser refaz o handshake se precisar).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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

    // Não usar await pra não bloquear request; erro de refresh é não-crítico
    await supabase.auth.getUser().catch((e) => {
      if (process.env.NODE_ENV === "production") {
        console.error("[proxy] session refresh failed:", e);
      }
    });
  } catch (e) {
    if (process.env.NODE_ENV === "production") {
      console.error("[proxy] fatal, devolvendo response sem refresh:", e);
    }
  }

  return response;
}
