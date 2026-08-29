import { NextRequest } from "next/server";

import { requireSessao, podeVerAnalise } from "@/lib/sessao-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * DOCUMENTOS DA ANÁLISE.
 *
 * Os arquivos são pessoais (identidade, renda, residência), então:
 *   • o bucket é PRIVADO — nunca existe URL pública;
 *   • cada leitura passa por aqui e é conferida contra o escopo de quem pede;
 *   • o link devolvido é assinado e expira em minutos;
 *   • quem enviou e quem abriu fica registrado no histórico da análise.
 *
 * A rota usa a chave de serviço, que passa por cima do RLS. Por isso a
 * conferência de permissão é feita AQUI, explicitamente — sem ela, este
 * caminho seria um buraco no RBAC.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BUCKET = "analise-docs";
const MAX_BYTES = 10 * 1024 * 1024;
const MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

async function garantirBucket(admin: ReturnType<typeof supabaseAdmin>) {
  const { data: list } = await admin.storage.listBuckets();
  if (list?.some((b) => b.name === BUCKET)) return;
  await admin.storage.createBucket(BUCKET, {
    public: false, // documento pessoal não é público. Nunca.
    fileSizeLimit: MAX_BYTES,
  });
}

/** Busca a análise e confere se quem pediu pode mexer nela. */
async function analiseAutorizada(
  admin: ReturnType<typeof supabaseAdmin>,
  sessao: Awaited<ReturnType<typeof requireSessao>>,
  analiseId: string,
) {
  if (sessao instanceof Response) return { erro: sessao };
  const { data } = await admin
    .from("analises")
    .select("id, org_id, vendedor_id, nome")
    .eq("id", analiseId)
    .maybeSingle();
  const a = data as { id: string; org_id: string; vendedor_id: string | null; nome: string } | null;
  if (!a) return { erro: Response.json({ error: "Análise não encontrada" }, { status: 404 }) };
  if (a.org_id !== sessao.orgId || !podeVerAnalise(sessao, a.vendedor_id)) {
    return { erro: Response.json({ error: "Sem permissão para esta análise" }, { status: 403 }) };
  }
  return { analise: a, sessao };
}

/* ------------------------------------------------------------------ upload */
export async function POST(req: NextRequest) {
  const sessao = await requireSessao();
  if (sessao instanceof Response) return sessao;

  const form = await req.formData();
  const file = form.get("file");
  const analiseId = form.get("analiseId");
  const tipo = form.get("tipo");
  const rotulo = form.get("rotulo");

  if (!(file instanceof File)) return Response.json({ error: "Arquivo obrigatório" }, { status: 400 });
  if (typeof analiseId !== "string" || !analiseId) return Response.json({ error: "analiseId obrigatório" }, { status: 400 });
  if (typeof tipo !== "string" || !tipo) return Response.json({ error: "tipo obrigatório" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Arquivo maior que 10MB" }, { status: 400 });
  if (!MIMES.has(file.type)) {
    return Response.json({ error: `Tipo não aceito (${file.type || "desconhecido"})` }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const check = await analiseAutorizada(admin, sessao, analiseId);
  if (check.erro) return check.erro;

  await garantirBucket(admin);

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().slice(0, 8);
  // caminho previsível por análise, nome aleatório: saber o id de uma análise
  // não deve permitir adivinhar o caminho de um documento.
  const caminho = `${analiseId}/${tipo}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(caminho, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (upErr) return Response.json({ error: `Falha ao guardar: ${upErr.message}` }, { status: 502 });

  const { data: doc, error } = await admin
    .from("analise_documentos")
    .insert({
      org_id: sessao.orgId,
      analise_id: analiseId,
      tipo,
      rotulo: typeof rotulo === "string" && rotulo ? rotulo : null,
      nome_arquivo: file.name,
      caminho,
      mime: file.type,
      tamanho: file.size,
      enviado_por: sessao.userId,
      enviado_por_nome: sessao.nome,
    })
    .select()
    .single();
  if (error) {
    await admin.storage.from(BUCKET).remove([caminho]); // não deixa arquivo órfão
    return Response.json({ error: error.message }, { status: 500 });
  }

  await admin.from("analise_eventos").insert({
    org_id: sessao.orgId,
    analise_id: analiseId,
    tipo: "documento",
    campo: tipo,
    valor_novo: file.name,
    detalhe: "Documento anexado",
    autor_id: sessao.userId,
    autor_nome: sessao.nome,
  });

  return Response.json({ ok: true, documento: doc });
}

/* --------------------------------------------- link assinado para abrir um */
export async function GET(req: NextRequest) {
  const sessao = await requireSessao();
  if (sessao instanceof Response) return sessao;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("analise_documentos")
    .select("id, analise_id, caminho, nome_arquivo")
    .eq("id", id)
    .maybeSingle();
  const doc = data as { id: string; analise_id: string; caminho: string; nome_arquivo: string } | null;
  if (!doc) return Response.json({ error: "Documento não encontrado" }, { status: 404 });

  const check = await analiseAutorizada(admin, sessao, doc.analise_id);
  if (check.erro) return check.erro;

  // 5 minutos: tempo de abrir e ler, não de circular por aí.
  const { data: assinado, error } = await admin.storage.from(BUCKET).createSignedUrl(doc.caminho, 300);
  if (error || !assinado) return Response.json({ error: "Falha ao gerar o link" }, { status: 502 });

  await admin.from("analise_eventos").insert({
    org_id: sessao.orgId,
    analise_id: doc.analise_id,
    tipo: "visualizacao",
    valor_novo: doc.nome_arquivo,
    detalhe: "Documento visualizado",
    autor_id: sessao.userId,
    autor_nome: sessao.nome,
  });

  return Response.json({ url: assinado.signedUrl, nome: doc.nome_arquivo });
}

/* ----------------------------------------------------------------- remover */
export async function DELETE(req: NextRequest) {
  const sessao = await requireSessao();
  if (sessao instanceof Response) return sessao;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("analise_documentos")
    .select("id, analise_id, caminho, nome_arquivo")
    .eq("id", id)
    .maybeSingle();
  const doc = data as { id: string; analise_id: string; caminho: string; nome_arquivo: string } | null;
  if (!doc) return Response.json({ error: "Documento não encontrado" }, { status: 404 });

  const check = await analiseAutorizada(admin, sessao, doc.analise_id);
  if (check.erro) return check.erro;

  await admin.storage.from(BUCKET).remove([doc.caminho]);
  await admin.from("analise_documentos").delete().eq("id", id);
  // o arquivo sai; o registro de que existiu, não.
  await admin.from("analise_eventos").insert({
    org_id: sessao.orgId,
    analise_id: doc.analise_id,
    tipo: "documento",
    valor_anterior: doc.nome_arquivo,
    detalhe: "Documento removido",
    autor_id: sessao.userId,
    autor_nome: sessao.nome,
  });

  return Response.json({ ok: true });
}
