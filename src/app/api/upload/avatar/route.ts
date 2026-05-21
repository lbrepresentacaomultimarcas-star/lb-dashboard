import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Garante que o bucket "avatars" existe e é público.
 * Idempotente — só cria na primeira vez.
 */
async function ensureBucket(admin: ReturnType<typeof supabaseAdmin>) {
  const { data: list } = await admin.storage.listBuckets();
  const exists = list?.some((b) => b.name === BUCKET);
  if (!exists) {
    await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: Array.from(ALLOWED_MIME),
    });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const formData = await req.formData();
  const file = formData.get("file");
  const targetId = formData.get("targetId");

  if (!(file instanceof File)) {
    return Response.json({ error: "Arquivo (file) obrigatório" }, { status: 400 });
  }
  if (typeof targetId !== "string" || !targetId) {
    return Response.json({ error: "targetId obrigatório" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Arquivo maior que 2MB" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return Response.json({ error: "Formato deve ser JPG, PNG ou WebP" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  await ensureBucket(admin);

  // Path determinístico = id do alvo. Upsert sobrescreve a foto anterior.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uerr } = await admin.storage
    .from(BUCKET)
    .upload(targetId, bytes, {
      contentType: file.type,
      upsert: true,
      cacheControl: "60",
    });

  if (uerr) {
    return Response.json({ error: uerr.message }, { status: 400 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(targetId);
  return Response.json({ ok: true, url: pub.publicUrl });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const targetId = req.nextUrl.searchParams.get("targetId");
  if (!targetId) {
    return Response.json({ error: "targetId obrigatório" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.storage.from(BUCKET).remove([targetId]);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
