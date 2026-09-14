import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        /*
         * Gravar cookie é PROIBIDO em Server Component — `cookieStore.set()`
         * lança ali. Em Route Handler funciona, e é só daí que este cliente é
         * usado hoje (as duas guardas, o login por código e o callback).
         *
         * O try/catch é rede de segurança: se um dia alguém chamar isto de um
         * Server Component, a exceção subiria de dentro do supabase-js, no
         * meio de uma renovação de sessão — e o sintoma apareceria como erro
         * de autenticação, longe da causa.
         */
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // contexto somente-leitura: quem renova é o proxy
            }
          }
        },
      },
    },
  );
}
