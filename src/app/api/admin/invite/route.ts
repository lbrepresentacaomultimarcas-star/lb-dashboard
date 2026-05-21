import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Papel } from "@/lib/types";

type Body = {
  email?: string;
  nome?: string;
  senha?: string;
  papel?: Papel;
  equipeId?: string | null;
  /** Se true, envia email com magic link (sem senha). */
  enviarEmail?: boolean;
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const body = (await req.json()) as Body;
  if (!body.email) return Response.json({ error: "Email obrigatório" }, { status: 400 });
  const papel: Papel = body.papel ?? "vendedor";
  const nome = body.nome?.trim() || body.email.split("@")[0];
  const admin = supabaseAdmin();

  let userId: string;

  if (body.enviarEmail) {
    // Convite via email (magic link / definir senha)
    const { data, error } = await admin.auth.admin.inviteUserByEmail(body.email, {
      data: { nome },
    });
    if (error || !data.user) {
      return Response.json({ error: error?.message ?? "Falha ao convidar" }, { status: 400 });
    }
    userId = data.user.id;
  } else {
    if (!body.senha || body.senha.length < 6) {
      return Response.json({ error: "Senha (mín 6 caracteres) obrigatória" }, { status: 400 });
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.senha,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (error || !data.user) {
      return Response.json({ error: error?.message ?? "Falha ao criar" }, { status: 400 });
    }
    userId = data.user.id;
  }

  // Atualiza profile: papel, equipe, org owner
  const patch: Record<string, unknown> = {
    papel,
    nome,
    vendedor_id: papel === "admin" ? null : auth.orgId,
  };
  if (body.equipeId !== undefined) patch.equipe_id = body.equipeId;

  const { error: uerr } = await admin.from("profiles").update(patch).eq("id", userId);
  if (uerr) {
    return Response.json({ error: uerr.message, userId }, { status: 400 });
  }

  return Response.json({
    ok: true,
    user: { id: userId, email: body.email, nome, papel },
    metodo: body.enviarEmail ? "email_invite" : "criado_com_senha",
  });
}
