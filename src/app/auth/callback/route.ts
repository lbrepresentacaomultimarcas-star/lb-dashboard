import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Handler do callback de auth.
 *
 * Fluxo:
 * 1. Usuário clica no link enviado por email (signup confirm, magic link, ou convite)
 * 2. Supabase redireciona pra cá com `?code=...` (PKCE) ou `?token_hash=...` (legacy)
 * 3. A gente troca o code/token por uma sessão e seta cookies via supabaseServer()
 * 4. Redireciona pro destino final
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // Recuperação de senha cai na página de definir nova senha; o resto vai pro dashboard.
  const next =
    searchParams.get("next") ?? (type === "recovery" ? "/redefinir-senha" : "/dashboard");

  const sb = await supabaseServer();

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(
      `${origin}/login?erro=${encodeURIComponent(error.message)}`,
    );
  }

  if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({
      type: type as
        | "signup"
        | "invite"
        | "magiclink"
        | "recovery"
        | "email_change"
        | "email",
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(
      `${origin}/login?erro=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/login?erro=${encodeURIComponent("Link de autenticação inválido")}`,
  );
}
