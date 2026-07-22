import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  MAX_PDF,
  baixar,
  driveFileId,
  driveFolderId,
  ehPdf,
  extrairPdfsDaPasta,
  msgCompleta,
  pdfParaTexto,
} from "@/lib/server/resultados-drive";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Importação MANUAL (histórico antigo): extrai o TEXTO de resultados
 *  oficiais (PDF por upload ou link, pasta do Drive, ou página HTML).
 *  Só admin importa. O parse/filtro de Sergipe acontece no cliente com
 *  PRÉVIA antes de salvar — nada é gravado automaticamente por esta rota.
 *  O dia a dia usa /api/resultados/sync (automático, sem link). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const log: string[] = [`🧠 Servidor Node ${process.version}.`];
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
        log.push(`📁 Pasta do Drive reconhecida (id ${idPasta.slice(0, 8)}…).`);
        const { partes, primeiroErro } = await extrairPdfsDaPasta(idPasta, log);
        if (partes.length === 0)
          return falha(
            primeiroErro
              ? `Nenhum PDF da pasta pôde ser lido. Primeiro erro: ${primeiroErro}`
              : "Essa pasta não tem PDFs de RESULTADO — abra a pasta do MÊS (ex.: JULHO DE 2026) e cole o link dela.",
            422,
          );
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
    return falha(msgCompleta(e), 500);
  }
}
