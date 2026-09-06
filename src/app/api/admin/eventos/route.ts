import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BUCKET = "eventos";
const MAX_BYTES = 8 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

/*
 * EVENTO EM DESTAQUE — cadastro e capa.
 *
 * A gravação passa por aqui, com chave de serviço, porque a tabela tem RLS
 * ligada e NENHUMA policy de escrita: o navegador lê, o servidor grava. Assim
 * a conferência de "é admin?" acontece num lugar só, e não existe caminho
 * alternativo pelo DevTools.
 *
 * A capa vai para o Storage, não para o navegador de quem subiu. A tela de
 * Configurações guarda logos em localStorage — o que funciona para preferência
 * pessoal, mas seria errado aqui: a capa do evento é da EMPRESA, e precisa
 * aparecer igual para todo mundo, em qualquer aparelho.
 */

async function garantirBucket(admin: ReturnType<typeof supabaseAdmin>) {
  const { data: list } = await admin.storage.listBuckets();
  if (list?.some((b) => b.name === BUCKET)) return;
  await admin.storage.createBucket(BUCKET, {
    // Público de propósito: é uma arte de campanha exibida para o time
    // inteiro. Não há dado pessoal aqui, e URL assinada expiraria no meio
    // do evento.
    public: true,
    fileSizeLimit: MAX_BYTES,
  });
}

/* ------------------------------- listar ---------------------------------- */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("eventos_destaque")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("inicio", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ eventos: data ?? [] });
}

/* ------------------------- criar / atualizar ----------------------------- */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const ct = req.headers.get("content-type") ?? "";

  /* -------- upload da capa (multipart) -------- */
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Arquivo não enviado" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Imagem acima de 8 MB" }, { status: 400 });
    }
    if (!MIMES.has(file.type)) {
      return Response.json({ error: "Use JPG, PNG ou WEBP" }, { status: 400 });
    }
    const admin = supabaseAdmin();
    await garantirBucket(admin);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const caminho = `${auth.orgId}/${Date.now()}.${ext}`;
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(caminho, file, { contentType: file.type, upsert: false });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    const { data } = admin.storage.from(BUCKET).getPublicUrl(caminho);
    return Response.json({ url: data.publicUrl });
  }

  /* -------- salvar o evento (json) -------- */
  const b = (await req.json()) as {
    id?: string;
    nome?: string;
    capaUrl?: string | null;
    frase?: string | null;
    descricao?: string | null;
    inicio?: string;
    fim?: string;
    metaGeral?: number | null;
    metaLb?: number;
    mensagem?: string | null;
    ativo?: boolean;
  };
  if (!b.nome?.trim()) return Response.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!b.inicio || !b.fim) return Response.json({ error: "Informe início e término" }, { status: 400 });
  if (b.fim < b.inicio) {
    return Response.json({ error: "O término não pode ser antes do início" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const campos = {
    nome: b.nome.trim(),
    capa_url: b.capaUrl ?? null,
    frase: b.frase ?? null,
    descricao: b.descricao ?? null,
    inicio: b.inicio,
    fim: b.fim,
    meta_geral: b.metaGeral ?? null,
    meta_lb: b.metaLb ?? 0,
    mensagem: b.mensagem ?? null,
    ativo: b.ativo ?? false,
    atualizado_em: new Date().toISOString(),
  };

  /*
   * Um evento ativo por vez.
   *
   * Dois eventos ativos ao mesmo tempo fariam o dashboard escolher um por
   * ordem de data — e o time veria uma meta hoje e outra amanhã sem ninguém
   * ter mexido em nada. Ligar um desliga os outros, explicitamente.
   */
  if (campos.ativo) {
    await admin
      .from("eventos_destaque")
      .update({ ativo: false })
      .eq("org_id", auth.orgId)
      .neq("id", b.id ?? "00000000-0000-0000-0000-000000000000");
  }

  if (b.id) {
    const { error } = await admin
      .from("eventos_destaque")
      .update(campos)
      .eq("id", b.id)
      .eq("org_id", auth.orgId);
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ ok: true, id: b.id });
  }

  const { data, error } = await admin
    .from("eventos_destaque")
    .insert({ ...campos, org_id: auth.orgId })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true, id: (data as { id: string }).id });
}

/* ------------------------------- remover --------------------------------- */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("eventos_destaque")
    .delete()
    .eq("id", id)
    .eq("org_id", auth.orgId);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
