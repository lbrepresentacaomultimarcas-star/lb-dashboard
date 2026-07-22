// Helpers de SERVIDOR do módulo Resultados LB: download/listagem na pasta
// pública oficial do Drive da administradora + extração de texto de PDF.
// Usado pelas rotas /api/resultados/extrair (importação manual) e
// /api/resultados/sync (sincronização automática do mês corrente).

export const MAX_PDF = 15 * 1024 * 1024;
export const MAX_ARQUIVOS_PASTA = 12;

/** Pasta-raiz OFICIAL de resultados da administradora (pública). Fica salva
 *  no sistema — ninguém precisa colar link. Estrutura: raiz → "Resultados de
 *  {ANO}" → "{MÊS} DE {ANO}" → PDFs "RESULTADOS DAS ASSEMBLEIAS…". */
export const PASTA_RAIZ_OFICIAL =
  process.env.RESULTADOS_DRIVE_RAIZ || "1x2Ru5pz2m0UCimm05E-trQO_hseRypHB";

const MESES_PT = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mensagem completa da exceção: nome, mensagem e primeiras linhas da stack. */
export function msgCompleta(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const stack = (e.stack ?? "")
    .split("\n")
    .slice(0, 6)
    .map((l) => l.trim())
    .join(" ⇐ ");
  return `${e.name}: ${e.message}${stack ? ` | stack: ${stack}` : ""}`;
}

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
    log.push(`⚠️ Polyfill indisponível (${msgCompleta(e)}) — seguindo sem ele.`);
  }
}

export function driveFileId(url: string): string | null {
  const m =
    /drive\.google\.com\/(?:file\/d\/([\w-]{10,})|open\?id=([\w-]{10,})|uc\?(?:[^#\s]*&)?id=([\w-]{10,}))/i.exec(url);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

export function driveFolderId(url: string): string | null {
  const m =
    /drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})|(?:embedded)?folderview\?(?:[^#\s]*&)?id=([\w-]{10,}))/i.exec(
      url,
    );
  return m ? (m[1] ?? m[2]) : null;
}

export async function baixar(url: string): Promise<{ buf: Buffer; tipo: string }> {
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!resp.ok) throw new Error(`Link inacessível (HTTP ${resp.status}).`);
  return { buf: Buffer.from(await resp.arrayBuffer()), tipo: resp.headers.get("content-type") ?? "" };
}

export const ehPdf = (buf: Buffer, tipo: string) =>
  tipo.includes("pdf") || buf.subarray(0, 5).toString("latin1") === "%PDF-";

export type ResultadoExtracao = { texto: string; paginas: number };

/** Camada 1: pdf-parse — mesma biblioteca usada na calibração do parser. */
async function extrairComPdfParse(buf: Buffer): Promise<ResultadoExtracao> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const r = await parser.getText();
    const paginas = Number((r as unknown as { total?: number }).total ?? 0);
    return { texto: r.text ?? "", paginas };
  } finally {
    await parser.destroy();
  }
}

/** Camada 2 (reserva): pdfjs-dist direto (build legacy p/ Node), com CADA
 *  etapa isolada em try/catch pra registrar exatamente onde falha. */
async function extrairComPdfjs(buf: Buffer, log: string[]): Promise<ResultadoExtracao> {
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    log.push(`🔧 Extrator reserva: pdfjs-dist v${pdfjs.version} carregado.`);
  } catch (e) {
    log.push(`✖ import(pdfjs-dist) falhou: ${msgCompleta(e)}`);
    throw e;
  }

  let task: ReturnType<typeof pdfjs.getDocument>;
  try {
    task = pdfjs.getDocument({
      data: new Uint8Array(buf),
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    });
  } catch (e) {
    log.push(`✖ getDocument() falhou: ${msgCompleta(e)}`);
    throw e;
  }

  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
    log.push(`📖 Documento aberto: ${doc.numPages} página(s).`);
  } catch (e) {
    log.push(`✖ document.promise falhou: ${msgCompleta(e)}`);
    throw e;
  }

  try {
    let texto = "";
    let itensTotal = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      let page: Awaited<ReturnType<typeof doc.getPage>>;
      try {
        page = await doc.getPage(n);
      } catch (e) {
        log.push(`✖ getPage(${n}) falhou: ${msgCompleta(e)}`);
        continue;
      }
      try {
        const tc = await page.getTextContent();
        itensTotal += tc.items.length;
        for (const it of tc.items) {
          const t = it as { str?: string; hasEOL?: boolean };
          if (typeof t.str === "string") texto += t.str + (t.hasEOL ? "\n" : "\t");
        }
        texto += "\n";
        log.push(`✔ Página ${n}: ${tc.items.length} item(ns) de texto.`);
      } catch (e) {
        log.push(`✖ getTextContent() na página ${n} falhou: ${msgCompleta(e)}`);
      }
    }
    if (itensTotal === 0)
      log.push(
        "🖼️ Este PDF não tem camada de texto (parece escaneado/só imagem). O resultado oficial normalmente tem texto — confira se é o arquivo certo; se for escaneado mesmo, use o campo de colar texto (ou me peça pra ligar OCR).",
      );
    return { texto, paginas: doc.numPages };
  } finally {
    await doc.destroy();
  }
}

export async function pdfParaTexto(buf: Buffer, log: string[]): Promise<ResultadoExtracao> {
  await polyfillDom(log);
  try {
    const r = await extrairComPdfParse(buf);
    if (r.texto.trim()) return r;
    log.push("⚠️ pdf-parse retornou texto vazio — acionando extrator reserva (pdfjs direto).");
  } catch (e) {
    log.push(`⚠️ pdf-parse falhou: ${msgCompleta(e)} — acionando extrator reserva (pdfjs direto).`);
  }
  return extrairComPdfjs(buf, log);
}

/** Lista os arquivos de uma pasta pública do Drive (sem API key). */
export async function listarPastaDrive(idPasta: string): Promise<{ id: string; nome: string }[]> {
  const { buf } = await baixar(`https://drive.google.com/embeddedfolderview?id=${idPasta}#list`);
  const html = buf.toString("utf8");
  const out: { id: string; nome: string }[] = [];
  const re = /id="entry-([\w-]+)"[\s\S]*?flip-entry-title">([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push({ id: m[1], nome: m[2].trim() });
  return out;
}

/** Baixa e extrai o texto de todos os PDFs de RESULTADO de uma pasta do mês.
 *  Devolve as partes com o separador ===ARQUIVO=== que o parser entende. */
export async function extrairPdfsDaPasta(
  idPasta: string,
  log: string[],
): Promise<{ partes: string[]; primeiroErro: string }> {
  const entradas = await listarPastaDrive(idPasta);
  log.push(`📁 Pasta encontrada: ${entradas.length} item(ns).`);
  const pdfs = entradas
    .filter((e) => /\.pdf$/i.test(e.nome) && /resultado/i.test(e.nome))
    .slice(0, MAX_ARQUIVOS_PASTA);
  log.push(`📄 PDFs de RESULTADO selecionados: ${pdfs.length}.`);
  const partes: string[] = [];
  let primeiroErro = "";
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
      const m = msgCompleta(e);
      if (!primeiroErro) primeiroErro = m;
      log.push(`✖ ${p.nome}: ${m}`);
    }
  }
  return { partes, primeiroErro };
}

/** Acha a subpasta cujo nome (sem acentos, minúsculo) contém o trecho. */
function acharSubpasta(
  entradas: { id: string; nome: string }[],
  contem: string[],
): { id: string; nome: string } | null {
  return (
    entradas.find((e) => {
      const n = norm(e.nome);
      return contem.every((c) => n.includes(c));
    }) ?? null
  );
}

/** Navega raiz → "Resultados de {ano}" → "{mês} de {ano}" e devolve o id da
 *  pasta do mês (null se ainda não existir — ex.: virada de mês). */
export async function pastaDoMes(
  ano: number,
  mesIdx: number,
  log: string[],
): Promise<string | null> {
  const raiz = await listarPastaDrive(PASTA_RAIZ_OFICIAL);
  const pastaAno = acharSubpasta(raiz, [String(ano)]);
  if (!pastaAno) {
    log.push(`✖ Pasta do ano ${ano} não encontrada na pasta oficial (${raiz.length} itens na raiz).`);
    return null;
  }
  log.push(`📁 Ano: “${pastaAno.nome}”.`);
  const meses = await listarPastaDrive(pastaAno.id);
  const alvo = acharSubpasta(meses, [MESES_PT[mesIdx]]);
  if (!alvo) {
    log.push(`ℹ️ Pasta de ${MESES_PT[mesIdx]}/${ano} ainda não existe (${meses.length} meses publicados).`);
    return null;
  }
  log.push(`📁 Mês: “${alvo.nome}”.`);
  return alvo.id;
}

/** Sincronização automática: extrai o texto dos resultados do MÊS ATUAL
 *  (e do mês anterior nos primeiros 5 dias, pra pegar retroativos). */
export async function sincronizarMesCorrente(
  log: string[],
  agora: Date = new Date(),
): Promise<{ texto: string; arquivos: number }> {
  const alvos: { ano: number; mes: number }[] = [
    { ano: agora.getFullYear(), mes: agora.getMonth() },
  ];
  if (agora.getDate() <= 5) {
    const ant = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    alvos.push({ ano: ant.getFullYear(), mes: ant.getMonth() });
  }

  const partes: string[] = [];
  let arquivos = 0;
  for (const a of alvos) {
    const id = await pastaDoMes(a.ano, a.mes, log);
    if (!id) continue;
    const r = await extrairPdfsDaPasta(id, log);
    partes.push(...r.partes);
    arquivos += r.partes.length;
  }
  return { texto: partes.join("\n"), arquivos };
}
