import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Papel } from "@/lib/types";

const PAPEIS: Papel[] = ["admin", "coordenador", "supervisor", "vendedor"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .or(`id.eq.${auth.orgId},vendedor_id.eq.${auth.orgId}`)
    .order("criado_em", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ users: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json()) as {
    userId?: string;
    papel?: Papel;
    equipeId?: string | null;
    ativo?: boolean;
    nome?: string;
  };
  if (!body.userId) {
    return Response.json({ error: "userId é obrigatório" }, { status: 400 });
  }
  if (body.papel && !PAPEIS.includes(body.papel)) {
    return Response.json({ error: "papel inválido" }, { status: 400 });
  }
  if (body.userId === auth.userId && body.papel && body.papel !== "admin") {
    return Response.json(
      { error: "Você não pode rebaixar a própria conta de admin" },
      { status: 400 },
    );
  }
  const admin = supabaseAdmin();
  const { data: target, error: terr } = await admin
    .from("profiles")
    .select("id, vendedor_id")
    .eq("id", body.userId)
    .single();
  if (terr || !target) return Response.json({ error: "Usuário não encontrado" }, { status: 404 });
  const targetOrg = target.vendedor_id ?? target.id;
  if (targetOrg !== auth.orgId) {
    return Response.json({ error: "Usuário não pertence ao seu org" }, { status: 403 });
  }
  const patch: Record<string, unknown> = {};
  if (body.papel !== undefined) patch.papel = body.papel;
  if (body.equipeId !== undefined) patch.equipe_id = body.equipeId;
  if (body.ativo !== undefined) patch.ativo = body.ativo;
  if (body.nome !== undefined) patch.nome = body.nome;
  const { error } = await admin.from("profiles").update(patch).eq("id", body.userId);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId obrigatório" }, { status: 400 });
  if (userId === auth.userId) {
    return Response.json({ error: "Não pode remover a própria conta" }, { status: 400 });
  }
  const admin = supabaseAdmin();
  const { data: target } = await admin
    .from("profiles")
    .select("id, vendedor_id")
    .eq("id", userId)
    .single();
  if (!target || (target.vendedor_id ?? target.id) !== auth.orgId) {
    return Response.json({ error: "Usuário não pertence ao seu org" }, { status: 403 });
  }
  // Remove o auth user (cascata remove o profile)
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
