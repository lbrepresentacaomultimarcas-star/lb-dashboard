import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { clientIdFromRequest, rateLimit } from "@/lib/rate-limit";
import { BLOQUEADO } from "@/lib/mensagens-acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * LOGIN POR CÓDIGO DE ACESSO.
 *
 * O Supabase Auth só autentica por e-mail — código não é uma identidade que
 * ele conheça. Alguém precisa traduzir código → e-mail antes de autenticar, e
 * ONDE isso acontece decide a segurança inteira:
 *
 *   • no navegador, seria uma porta aberta: bastaria testar V001, V002, V003…
 *     para colher os e-mails da equipe toda;
 *   • aqui, o e-mail é resolvido com a chave de serviço e NUNCA sai do
 *     servidor. O navegador manda código + senha e recebe de volta apenas
 *     uma sessão.
 *
 * Só funciona porque a sessão do CRM vive em COOKIE (@supabase/ssr): o login
 * acontece deste lado e os cookies voltam prontos na resposta.
 */

/**
 * A MESMA resposta para código inexistente e senha errada.
 *
 * Se "código não existe" e "senha errada" fossem mensagens diferentes, uma
 * pessoa de fora descobriria quais códigos existem só de tentar — e um código
 * válido é metade do caminho para invadir uma conta.
 */
const GENERICO = "Código ou senha inválidos.";

export async function POST(req: NextRequest) {
  // Código é curto e adivinhável por tentativa; sem freio, testar todos seria
  // questão de minutos.
  const rl = rateLimit(`login:${clientIdFromRequest(req)}`, { capacity: 10, refillPerSec: 0.2 });
  if (!rl.ok) {
    return Response.json(
      { error: "Muitas tentativas. Aguarde alguns segundos." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { codigo?: string; senha?: string };
  const codigo = body.codigo?.trim();
  const senha = body.senha ?? "";
  if (!codigo || !senha) {
    return Response.json({ error: "Informe o código e a senha." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: perfil } = await admin
    .from("profiles")
    .select("id, email, ativo, codigo_liberado")
    .ilike("codigo_acesso", codigo) // o código não diferencia maiúscula
    .maybeSingle();

  const p = perfil as
    | { id: string; email: string; ativo: boolean | null; codigo_liberado: boolean | null }
    | null;

  if (!p?.email) return Response.json({ error: GENERICO }, { status: 401 });

  // Estas duas SÃO específicas de propósito: quem chegou aqui já provou saber
  // um código válido, e uma pessoa esperando liberação precisa entender por
  // que não entra — em vez de achar que digitou errado.
  if (p.ativo === false) return Response.json({ error: BLOQUEADO }, { status: 403 });
  if (p.codigo_liberado === false) {
    return Response.json(
      { error: "Seu acesso ainda não foi liberado pelo administrador." },
      { status: 403 },
    );
  }

  // Autentica de verdade. Senha errada cai no genérico, igual a código
  // inexistente — de fora, os dois casos são indistinguíveis.
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({ email: p.email, password: senha });
  if (error || !data.user) return Response.json({ error: GENERICO }, { status: 401 });

  // A sessão já foi gravada nos cookies pelo cliente de servidor.
  return Response.json({ ok: true });
}
