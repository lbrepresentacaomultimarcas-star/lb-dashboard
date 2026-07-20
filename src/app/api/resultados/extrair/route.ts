import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Extrai o TEXTO de resultados oficiais (PDF por upload ou link, pasta do
 *  Google Drive com os PDFs do mês, ou página HTML). Só admin importa.
 *  O parse/filtro de Sergipe acontece no cliente (lib/resultados-parser.ts)
 *  com PRÉVIA antes de salvar — nada é gravado automaticamente por esta rota. */

const MAX_PDF = 15 * 1024 * 1024;
const MAX_ARQUIVOS_PASTA = 12;

function driveFileId(url: string): string | null {
  const m =
    /drive\.google\.com\/(?:file\/d\/([\w-]{10,})|open\?id=([\w-]{10,})|uc\?(?:[^#\s]*&)?id=([\w-]{10,}))/i.exec(url);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

function driveFolderId(url: string): string | null {
  const m =
    /drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})|(?:embedded)?folderview\?(?:[^#\s]*&)?id=([\w-]{10,}))/i.exec(
      url,
    );
  return m ? (m[1] ?? m[2]) : null;
}

async function baixar(url: string): Promise<{ buf: Buffer; tipo: string }> {
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!resp.ok) throw new Error(`Link inacessível (${resp.status}).`);
  return { buf: Buffer.from(await resp.arrayBuffer()), tipo: resp.headers.get("content-type") ?? "" };
}

const ehPdf = (buf: Buffer, tipo: string) =>
  tipo.includes("pdf") || buf.subarray(0, 5).toString("latin1") === "%PDF-";

async function pdfParaTexto(buf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buf });
  try {
    const r = await parser.getText();
    return r.text ?? "";
  } finally {
    await parser.destroy();
  }
}

/** Lista os PDFs de RESULTADO de uma pasta pública do Drive (sem API key). */
async function listarPastaDrive(idPasta: string): Promise<{ id: string; nome: string }[]> {
  const { buf } = await baixar(`https://drive.google.com/embeddedfolderview?id=${idPasta}#list`);
  const html = buf.toString("utf8");
  const out: { id: string; nome: string }[] = [];
  const re = /id="entry-([\w-]+)"[\s\S]*?flip-entry-title">([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push({ id: m[1], nome: m[2].trim() });
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let texto = "";
    let fonte = "";
    let arquivos = 1;

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");
      if (!(file instanceof File) || file.size === 0)
        return Response.json({ error: "Envie um arquivo PDF." }, { status: 400 });
      if (file.size > MAX_PDF)
        return Response.json({ error: "PDF muito grande (máx. 15 MB)." }, { status: 400 });
      fonte = file.name;
      texto = await pdfParaTexto(Buffer.from(await file.arrayBuffer()));
    } else {
      const body = (await req.json()) as { url?: string };
      const url = (body.url ?? "").trim();
      if (!/^https?:\/\//i.test(url))
        return Response.json({ error: "Informe um link válido (http/https)." }, { status: 400 });

      const idPasta = driveFolderId(url);
      const idArquivo = idPasta ? null : driveFileId(url);

      if (idPasta) {
        // Pasta do mês no Drive: importa todos os PDFs de resultado de uma vez.
        const entradas = await listarPastaDrive(idPasta);
        const pdfs = entradas
          .filter((e) => /\.pdf$/i.test(e.nome) && /resultado/i.test(e.nome))
          .slice(0, MAX_ARQUIVOS_PASTA);
        if (pdfs.length === 0)
          return Response.json(
            {
              error:
                entradas.length > 0
                  ? "Essa pasta não tem PDFs de RESULTADO — abra a pasta do MÊS (ex.: JULHO DE 2026) e cole o link dela."
                  : "Pasta vazia ou sem acesso público — confira o link.",
            },
            { status: 422 },
          );
        const partes: string[] = [];
        for (const p of pdfs) {
          const { buf, tipo } = await baixar(`https://drive.google.com/uc?export=download&id=${p.id}`);
          if (!ehPdf(buf, tipo) || buf.length > MAX_PDF) continue;
          partes.push(`===ARQUIVO: ${p.nome}===\n${await pdfParaTexto(buf)}`);
        }
        if (partes.length === 0)
          return Response.json({ error: "Não consegui baixar os PDFs dessa pasta." }, { status: 502 });
        arquivos = partes.length;
        fonte = `pasta do Drive (${partes.length} arquivo${partes.length > 1 ? "s" : ""})`;
        texto = partes.join("\n");
      } else if (idArquivo) {
        const { buf, tipo } = await baixar(`https://drive.google.com/uc?export=download&id=${idArquivo}`);
        if (!ehPdf(buf, tipo))
          return Response.json({ error: "Esse link do Drive não é um PDF público." }, { status: 422 });
        if (buf.length > MAX_PDF) return Response.json({ error: "PDF muito grande (máx. 15 MB)." }, { status: 400 });
        fonte = url;
        texto = await pdfParaTexto(buf);
      } else {
        const { buf, tipo } = await baixar(url);
        fonte = url;
        if (ehPdf(buf, tipo)) {
          if (buf.length > MAX_PDF) return Response.json({ error: "PDF muito grande (máx. 15 MB)." }, { status: 400 });
          texto = await pdfParaTexto(buf);
        } else {
          // Página HTML: remove tags e fica com o texto corrido.
          texto = buf
            .toString("utf8")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, "\n")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&");
        }
      }
    }

    if (!texto.trim())
      return Response.json({ error: "Não foi possível extrair texto desse arquivo/link." }, { status: 422 });

    return Response.json({ texto: texto.slice(0, 800_000), fonte, arquivos });
  } catch (e) {
    console.error("[resultados/extrair] falhou:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao extrair o conteúdo." },
      { status: 500 },
    );
  }
}
