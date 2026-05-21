import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("equipes")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("criado_em");
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ equipes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json()) as {
    nome?: string;
    cor?: string;
    liderId?: string;
  };
  if (!body.nome) return Response.json({ error: "Nome obrigatório" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("equipes")
    .insert({
      nome: body.nome,
      cor: body.cor ?? "#6366f1",
      lider_id: body.liderId ?? null,
      org_id: auth.orgId,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ equipe: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json()) as {
    id?: string;
    nome?: string;
    cor?: string;
    liderId?: string | null;
  };
  if (!body.id) return Response.json({ error: "id obrigatório" }, { status: 400 });
  const admin = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (body.nome !== undefined) patch.nome = body.nome;
  if (body.cor !== undefined) patch.cor = body.cor;
  if (body.liderId !== undefined) patch.lider_id = body.liderId;
  const { error } = await admin
    .from("equipes")
    .update(patch)
    .eq("id", body.id)
    .eq("org_id", auth.orgId);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("equipes")
    .delete()
    .eq("id", id)
    .eq("org_id", auth.orgId);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
