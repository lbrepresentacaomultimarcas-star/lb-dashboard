import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Extrai o TEXTO de resultados oficiais (PDF por upload ou link, pasta do
 *  Google Drive com os PDFs do mês, ou página HTML). Só admin importa.
 *  O parse/filtro de Sergipe acontece no cliente (lib/resultados-parser.ts)
 *  com PRÉVIA antes de salvar — nada é gravado automaticamente por esta rota.
 *  Toda resposta (sucesso ou erro) devolve `log` com o passo a passo real. */

const MAX_PDF = 15 * 1024 * 1024;
const MAX_ARQUIVOS_PASTA = 12;

/** pdfjs v5 espera DOMMatrix/ImageData/Path2D no global mesmo pra extrair
 *  texto em alguns builds. No servidor eles não existem — usa os do
 *  @napi-rs/canvas (dependência do pdf-parse). Nunca sobrescreve se já há. */
async function polyfillDom(log: string[]) {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix !== "undefined") return;
  try {
    const c = (await import("@napi-rs/canvas")) as Record<string, unknown>;
    if (typeof g.DOMMatrix === "undefined" && c.DOMMatrix) g.DOMMatrix = c.DOMMatrix;
    if (typeof g.ImageData === "undefined" && c.ImageData) g.ImageData = c.ImageData;
    if (typeof g.Path2D === "undefined" && c.Path2D) g.Path2D = c.Path2D;
    log.push("🧩 Polyfill DOM aplicado (DOMMatrix/ImageData/Path2D).");
  } catch (e) {
    log.push(`⚠️ Polyfill indisponível (${e instanceof Error ? e.message : e}) — seguindo sem ele.`);
  }
}

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
  if (!resp.ok) throw new Error(`Link inacessível (HTTP ${resp.status}).`);
  return { buf: Buffer.from(await resp.arrayBuffer()), tipo: resp.headers.get("content-type") ?? "" };
}

const ehPdf = (buf: Buffer, tipo: string) =>
  tipo.includes("pdf") || buf.subarray(0, 5).toString("latin1") === "%PDF-";

async function pdfParaTexto(buf: Buffer, log: string[]): Promise<{ texto: string; paginas: number }> {
  await polyfillDom(log);
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buf });
  try {
    const r = await parser.getText();
    const paginas = Number((r as unknown as { total?: number }).total ?? 0);
    return { texto: r.text ?? "", paginas };
  } finally {
    await parser.destroy();
  }
}

/** Lista os arquivos de uma pasta pública do Drive (sem API key). */
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

  const log: string[] = [];
  const falha = (error: string, status: number) => {
    log.push(`✖ ${error}`);
    console.error("[resultados/extrair]", error, "| log:", log);
    return Response.json({ error, log }, { status });
  };

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let texto = "";
    let fonte = "";
    let arquivos = 1;

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");
      if (!(file instanceof File) || file.size === 0) return falha("Envie um arquivo PDF.", 400);
      if (file.size > MAX_PDF) return falha("PDF muito grande (máx. 15 MB).", 400);
      fonte = file.name;
      log.push(`📄 Upload recebido: ${file.name} (${file.size.toLocaleString("pt-BR")} bytes).`);
      const r = await pdfParaTexto(Buffer.from(await file.arrayBuffer()), log);
      texto = r.texto;
      log.push(`✔ Texto extraído: ${r.paginas || "?"} página(s), ${texto.length.toLocaleString("pt-BR")} caracteres.`);
    } else {
      const body = (await req.json()) as { url?: string };
      const url = (body.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) return falha("Informe um link válido (http/https).", 400);

      const idPasta = driveFolderId(url);
      const idArquivo = idPasta ? null : driveFileId(url);

      if (idPasta) {
        // Pasta do mês no Drive: importa todos os PDFs de resultado de uma vez.
        log.push(`📁 Pasta do Drive reconhecida (id ${idPasta.slice(0, 8)}…).`);
        const entradas = await listarPastaDrive(idPasta);
        log.push(`📁 Pasta encontrada: ${entradas.length} item(ns).`);
        const pdfs = entradas
          .filter((e) => /\.pdf$/i.test(e.nome) && /resultado/i.test(e.nome))
          .slice(0, MAX_ARQUIVOS_PASTA);
        log.push(`📄 PDFs de RESULTADO selecionados: ${pdfs.length}.`);
        if (pdfs.length === 0)
          return falha(
            entradas.length > 0
              ? "Essa pasta não tem PDFs de RESULTADO — abra a pasta do MÊS (ex.: JULHO DE 2026) e cole o link dela."
              : "Pasta vazia ou sem acesso público — confira o link.",
            422,
          );
        const partes: string[] = [];
        for (const p of pdfs) {
          try {
            const { buf, tipo } = await baixar(`https://drive.google.com/uc?export=download&id=${p.id}`);
            if (!ehPdf(buf, tipo)) {
              log.push(`✖ ${p.nome}: o download não retornou um PDF (${tipo || "tipo desconhecido"}).`);
              continue;
            }
            if (buf.length > MAX_PDF) {
              log.push(`✖ ${p.nome}: muito grande (${buf.length.toLocaleString("pt-BR")} bytes).`);
              continue;
            }
            log.push(`⬇️ ${p.nome} baixado (${buf.length.toLocaleString("pt-BR")} bytes).`);
            const r = await pdfParaTexto(buf, log);
            partes.push(`===ARQUIVO: ${p.nome}===\n${r.texto}`);
            log.push(`✔ ${p.nome}: ${r.paginas || "?"} página(s), ${r.texto.length.toLocaleString("pt-BR")} caracteres.`);
          } catch (e) {
            log.push(`✖ ${p.nome}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (partes.length === 0)
          return falha("Nenhum PDF da pasta pôde ser lido — veja o diagnóstico acima.", 502);
        arquivos = partes.length;
        fonte = `pasta do Drive (${partes.length} arquivo${partes.length > 1 ? "s" : ""})`;
        texto = partes.join("\n");
      } else if (idArquivo) {
        log.push(`📄 Arquivo do Drive reconhecido (id ${idArquivo.slice(0, 8)}…).`);
        const { buf, tipo } = await baixar(`https://drive.google.com/uc?export=download&id=${idArquivo}`);
        if (!ehPdf(buf, tipo)) return falha("Esse link do Drive não é um PDF público.", 422);
        if (buf.length > MAX_PDF) return falha("PDF muito grande (máx. 15 MB).", 400);
        log.push(`⬇️ Download realizado (${buf.length.toLocaleString("pt-BR")} bytes).`);
        fonte = url;
        const r = await pdfParaTexto(buf, log);
        texto = r.texto;
        log.push(`✔ Texto extraído: ${r.paginas || "?"} página(s), ${texto.length.toLocaleString("pt-BR")} caracteres.`);
      } else {
        const { buf, tipo } = await baixar(url);
        fonte = url;
        if (ehPdf(buf, tipo)) {
          if (buf.length > MAX_PDF) return falha("PDF muito grande (máx. 15 MB).", 400);
          log.push(`⬇️ PDF baixado (${buf.length.toLocaleString("pt-BR")} bytes).`);
          const r = await pdfParaTexto(buf, log);
          texto = r.texto;
          log.push(`✔ Texto extraído: ${r.paginas || "?"} página(s), ${texto.length.toLocaleString("pt-BR")} caracteres.`);
        } else {
          // Página HTML: remove tags e fica com o texto corrido.
          log.push("🌐 Link não é PDF — lendo como página HTML.");
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

    if (!texto.trim()) return falha("Não foi possível extrair texto desse arquivo/link.", 422);

    return Response.json({ texto: texto.slice(0, 800_000), fonte, arquivos, log });
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Falha ao extrair o conteúdo.", 500);
  }
}
