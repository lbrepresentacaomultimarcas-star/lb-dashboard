import { NextRequest } from "next/server";
import { requireSessao } from "@/lib/sessao-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BUCKET = "promocoes";
const MAX_BYTES = 5 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

/*
 * FOTO DO MURAL DE PROMOÇÃO.
 *
 * Quem pode enviar: o próprio promovido ou o admin da empresa. A gravação usa
 * a chave de serviço (passa por cima da RLS), então a conferência de quem está
 * enviando acontece aqui, explicitamente.
 *
 * O bucket é público de propósito: a foto aparece para a equipe inteira no
 * Dashboard durante 3 dias.
 */

async function garantirBucket(admin: ReturnType<typeof supabaseAdmin>) {
  const { data: list } = await admin.storage.listBuckets();
  if (list?.some((b) => b.name === BUCKET)) return;
  await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES, allowedMimeTypes: [...MIMES] });
}

async function promocaoPermitida(promocaoId: string) {
  const sessao = await requireSessao();
  if (sessao instanceof Response) return sessao;
  const admin = supabaseAdmin();
  const { data: promo, error } = await admin
    .from("promocoes_agendadas")
    .select("id, org_id, profile_id, status, foto_url")
    .eq("id", promocaoId)
    .maybeSingle();
  if (error || !promo) return Response.json({ error: "Promoção não encontrada" }, { status: 404 });
  const p = promo as { id: string; org_id: string; profile_id: string; status: string; foto_url: string | null };
  const ehDono = p.profile_id === sessao.userId;
  const ehAdmin = sessao.papel === "admin" && p.org_id === sessao.orgId;
  if (!ehDono && !ehAdmin) return Response.json({ error: "Só o promovido ou o administrador enviam a foto." }, { status: 403 });
  if (p.status !== "realizada") return Response.json({ error: "A foto vai para o mural depois da promoção." }, { status: 400 });
  return { admin, promo: p };
}

function caminhoDe(url: string | null): string | null {
  if (!url) return null;
  const marca = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split("?")[0]) : null;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const promocaoId = form.get("promocaoId");
  if (typeof promocaoId !== "string" || !promocaoId) return Response.json({ error: "promocaoId obrigatório" }, { status: 400 });
  if (!(file instanceof File)) return Response.json({ error: "Escolha uma foto." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "A foto pode ter no máximo 5 MB." }, { status: 400 });
  if (!MIMES.has(file.type)) return Response.json({ error: "Use uma foto JPG, PNG ou WebP." }, { status: 400 });

  const ok = await promocaoPermitida(promocaoId);
  if (ok instanceof Response) return ok;
  const { admin, promo } = ok;

  await garantirBucket(admin);
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const caminho = `${promo.org_id}/${promo.id}-${Date.now()}.${ext}`;
  const { error: up } = await admin.storage
    .from(BUCKET)
    .upload(caminho, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (up) return Response.json({ error: up.message }, { status: 400 });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(caminho);
  const { error: grava } = await admin.from("promocoes_agendadas").update({ foto_url: pub.publicUrl }).eq("id", promo.id);
  if (grava) {
    await admin.storage.from(BUCKET).remove([caminho]); // não deixa arquivo órfão
    return Response.json({ error: grava.message }, { status: 400 });
  }
  // a foto anterior sai do armazenamento
  const antiga = caminhoDe(promo.foto_url);
  if (antiga) await admin.storage.from(BUCKET).remove([antiga]);
  return Response.json({ ok: true, url: pub.publicUrl });
}

export async function DELETE(req: NextRequest) {
  const promocaoId = req.nextUrl.searchParams.get("promocaoId");
  if (!promocaoId) return Response.json({ error: "promocaoId obrigatório" }, { status: 400 });
  const ok = await promocaoPermitida(promocaoId);
  if (ok instanceof Response) return ok;
  const { admin, promo } = ok;
  const { error } = await admin.from("promocoes_agendadas").update({ foto_url: null }).eq("id", promo.id);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  const antiga = caminhoDe(promo.foto_url);
  if (antiga) await admin.storage.from(BUCKET).remove([antiga]);
  return Response.json({ ok: true });
}
