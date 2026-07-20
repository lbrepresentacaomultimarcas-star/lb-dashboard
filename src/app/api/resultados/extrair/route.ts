import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Extrai o TEXTO de um resultado oficial (PDF por upload ou link, ou página
 *  HTML por link). Só admin importa. O parse/filtro de Sergipe acontece no
 *  cliente (lib/resultados.ts) com PRÉVIA antes de salvar — nada é gravado
 *  automaticamente por esta rota. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let texto = "";
    let fonte = "";

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");
      if (!(file instanceof File) || file.size === 0)
        return Response.json({ error: "Envie um arquivo PDF." }, { status: 400 });
      if (file.size > 15 * 1024 * 1024)
        return Response.json({ error: "PDF muito grande (máx. 15 MB)." }, { status: 400 });
      fonte = file.name;
      const buf = Buffer.from(await file.arrayBuffer());
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buf });
      const r = await parser.getText();
      await parser.destroy();
      texto = r.text ?? "";
    } else {
      const body = (await req.json()) as { url?: string };
      const url = (body.url ?? "").trim();
      if (!/^https?:\/\//i.test(url))
        return Response.json({ error: "Informe um link válido (http/https)." }, { status: 400 });
      fonte = url;
      const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
      if (!resp.ok) return Response.json({ error: `Link inacessível (${resp.status}).` }, { status: 502 });
      const tipo = resp.headers.get("content-type") ?? "";
      if (tipo.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buf });
        const r = await parser.getText();
        await parser.destroy();
        texto = r.text ?? "";
      } else {
        // Página HTML: remove tags e fica com o texto corrido.
        const html = await resp.text();
        texto = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, "\n")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&");
      }
    }

    if (!texto.trim())
      return Response.json({ error: "Não foi possível extrair texto desse arquivo/link." }, { status: 422 });

    return Response.json({ texto: texto.slice(0, 800_000), fonte });
  } catch (e) {
    console.error("[resultados/extrair] falhou:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao extrair o conteúdo." },
      { status: 500 },
    );
  }
}
