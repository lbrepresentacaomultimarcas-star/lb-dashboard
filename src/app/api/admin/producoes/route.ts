import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("producoes")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("data_inicio", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ producoes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json()) as {
    nome?: string;
    dataInicio?: string;
    dataFim?: string;
    ativa?: boolean;
  };
  if (!body.nome || !body.dataInicio || !body.dataFim) {
    return Response.json({ error: "Nome, data início e fim obrigatórios" }, { status: 400 });
  }
  const admin = supabaseAdmin();
  // Se ativa=true, desativa as outras
  if (body.ativa) {
    await admin.from("producoes").update({ ativa: false }).eq("org_id", auth.orgId);
  }
  const { data, error } = await admin
    .from("producoes")
    .insert({
      nome: body.nome,
      data_inicio: body.dataInicio,
      data_fim: body.dataFim,
      ativa: body.ativa ?? false,
      org_id: auth.orgId,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ producao: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json()) as {
    id?: string;
    nome?: string;
    dataInicio?: string;
    dataFim?: string;
    ativa?: boolean;
  };
  if (!body.id) return Response.json({ error: "id obrigatório" }, { status: 400 });
  const admin = supabaseAdmin();
  if (body.ativa === true) {
    await admin.from("producoes").update({ ativa: false }).eq("org_id", auth.orgId);
  }
  const patch: Record<string, unknown> = {};
  if (body.nome !== undefined) patch.nome = body.nome;
  if (body.dataInicio !== undefined) patch.data_inicio = body.dataInicio;
  if (body.dataFim !== undefined) patch.data_fim = body.dataFim;
  if (body.ativa !== undefined) patch.ativa = body.ativa;
  const { error } = await admin
    .from("producoes")
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
    .from("producoes")
    .delete()
    .eq("id", id)
    .eq("org_id", auth.orgId);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
