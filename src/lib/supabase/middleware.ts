import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session if expired — must call getUser, not getSession.
  // Em dev pode falhar por cert SSL (corporate proxy/Node CA). Não deixar
  // estourar pra não interromper a request — o cliente browser usa CA do SO.
  try {
    await supabase.auth.getUser();
  } catch (e) {
    if (process.env.NODE_ENV === "production") {
      console.error("[proxy] session refresh failed:", e);
    }
  }
  return response;
}
