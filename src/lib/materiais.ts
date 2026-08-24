"use client";

// Camada de navegador dos materiais premium do Resultados LB.
// Constrói os DadosMaterial a partir do resumo/itens e gera as saídas:
// imagens (feed/story/status), PDF executivo (capa premium + página de
// conteúdo com gráficos/cards/tabela) e relatório corporativo para impressão.
// Todo o desenho vive em ./materiais-render (puro, testável).

import {
  creditoCurto,
  dimensoes,
  donut,
  renderMaterial,
  resolverSegmento,
  type Comunicacao,
  type DadosMaterial,
  type FormatoMaterial,
  type LogosCo,
  type TemplateFeed,
} from "./materiais-render";
import { BRLc, dataLabel, mesLabel, type Contemplacao, type ResumoResultados } from "./resultados";
import { settings } from "./settings";

/* ------------------------------ Co-branding -------------------------------- */
// Logos LB (principal) + Multimarcas (parceira) para carimbar as artes. Ficam em
// cache de módulo pra o desenho (síncrono) usar; as Configurações podem trocar as
// imagens (override em localStorage) ou usar os padrões em /public.

const LOGO_LB_PADRAO = "/logo-lb.jpg";
const LOGO_PARCEIRA_PADRAO = "/logo-multimarcas.jpg";

let LOGOS: LogosCo = {};
let carregandoLogos: Promise<LogosCo> | null = null;

function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Fonte atual de cada logo (override das Configurações ou padrão em /public). */
export function fontesLogos(): { lb: string; parceira: string; mostrarParceira: boolean } {
  return {
    lb: settings.get("logo_principal") ?? LOGO_LB_PADRAO,
    parceira: settings.get("logo_parceira") ?? LOGO_PARCEIRA_PADRAO,
    mostrarParceira: settings.getBool("exibir_logo_parceira", true),
  };
}

/** Carrega (uma vez) as logos para o cache de módulo usado nas artes. */
export async function carregarLogos(): Promise<LogosCo> {
  if (carregandoLogos) return carregandoLogos;
  carregandoLogos = (async () => {
    const f = fontesLogos();
    const [lb, parceira] = await Promise.all([
      carregarImagem(f.lb),
      f.mostrarParceira ? carregarImagem(f.parceira) : Promise.resolve(null),
    ]);
    LOGOS = { lb, parceira };
    return LOGOS;
  })();
  return carregandoLogos;
}

/** Invalida o cache (chamar após trocar logo/toggle nas Configurações). */
export function resetLogos() {
  LOGOS = {};
  carregandoLogos = null;
}

/** Converte uma imagem carregada em data URL PNG (pro jsPDF). */
function imgParaDataUrl(img: CanvasImageSource | null | undefined): { url: string; ratio: number } | null {
  if (!img) return null;
  const w = (img as HTMLImageElement).naturalWidth || (img as { width?: number }).width || 0;
  const h = (img as HTMLImageElement).naturalHeight || (img as { height?: number }).height || 0;
  if (!w || !h) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d");
  if (!cx) return null;
  cx.drawImage(img, 0, 0);
  return { url: c.toDataURL("image/png"), ratio: w / h };
}

export { dimensoes, nomeTemplate, aplicarModelo, MODELOS_COMUNICACAO, SELOS_PRONTOS } from "./materiais-render";
export type {
  Comunicacao,
  DadosMaterial,
  FormatoMaterial,
  ModeloComunicacao,
  ModoAssinatura,
  TemplateFeed,
} from "./materiais-render";

/** Monta o pacote de dados que alimenta todos os templates. */
export function construirDados(input: {
  resumo: ResumoResultados;
  itens: Contemplacao[];
  periodoLabel: string;
  recorde: string | null;
  preparadoPor?: string;
  comunicacao?: Comunicacao | null;
}): DadosMaterial {
  const { resumo, itens, periodoLabel, recorde, preparadoPor, comunicacao } = input;
  const unico =
    resumo.total === 1 && itens[0]
      ? { grupo: itens[0].grupo, cota: itens[0].cota, tipo: itens[0].tipoContemplacao }
      : null;
  return {
    titulo: "Resultados em Sergipe",
    subtitulo: "Contemplações oficiais da administradora",
    periodo: periodoLabel,
    total: resumo.total,
    sorteios: resumo.sorteios,
    lances: resumo.lances,
    credito: resumo.creditoEstimado,
    segmentos: resumo.porBem.map((b) => ({ nome: b.nome, qtd: b.qtd, credito: b.credito })),
    porMes: resumo.porMes.map((m) => ({ mes: m.mes, label: mesLabel(m.mes), qtd: m.qtd, credito: m.credito })),
    recorde,
    destaqueUnico: unico,
    preparadoPor,
    comunicacao: comunicacao ?? null,
  };
}

/** Renderiza um material dentro de um <canvas> já existente (preview ao vivo). */
export function renderEmCanvas(canvas: HTMLCanvasElement, formato: FormatoMaterial, dados: DadosMaterial, template?: TemplateFeed) {
  const { W, H } = dimensoes(formato);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  renderMaterial(ctx, formato, dados, template, LOGOS);
}

function baixarBlob(blob: Blob, nome: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

/** Gera e baixa a imagem (feed/story/status) em PNG de alta resolução. */
export async function baixarImagem(formato: FormatoMaterial, dados: DadosMaterial, template?: TemplateFeed) {
  await carregarLogos();
  const { W, H } = dimensoes(formato);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  renderMaterial(ctx, formato, dados, template, LOGOS);
  canvas.toBlob((b) => b && baixarBlob(b, `resultados-lb-${formato}.png`), "image/png");
}

function canvasPara(formato: FormatoMaterial, dados: DadosMaterial): HTMLCanvasElement {
  const { W, H } = dimensoes(formato);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (ctx) renderMaterial(ctx, formato, dados, undefined, LOGOS);
  return canvas;
}

/* -------------------------------- PDF executivo ---------------------------- */

const NAVY: [number, number, number] = [11, 22, 38];
const NAVY_CARD: [number, number, number] = [20, 34, 54];
const GOLD: [number, number, number] = [212, 167, 44];
const WHITE: [number, number, number] = [233, 238, 246];
const GREY: [number, number, number] = [147, 164, 188];

/** PDF de apresentação: capa premium (imagem) + página executiva com KPIs,
 *  gráfico donut, distribuição por segmento e tabela das contemplações. */
export async function baixarPdf(dados: DadosMaterial, itens: Contemplacao[]) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  await carregarLogos();

  // ---- Página 1: capa (imagem em alta) ----
  const capa = canvasPara("pdf-capa", dados);
  doc.addImage(capa.toDataURL("image/png"), "PNG", 0, 0, 210, 297);

  // ---- Página 2: conteúdo executivo ----
  doc.addPage();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 297, "F");

  // cabeçalho (co-branding: LB à esquerda + Multimarcas à direita)
  doc.setFillColor(8, 15, 27);
  doc.rect(0, 0, 210, 30, "F");
  const lbImg = imgParaDataUrl(LOGOS.lb);
  const parcImg = imgParaDataUrl(LOGOS.parceira);
  let txtX = 14;
  if (lbImg) {
    try {
      doc.addImage(lbImg.url, "PNG", 12, 6, 18, 18);
      txtX = 34;
    } catch {}
  }
  doc.setTextColor(...GOLD).setFont("helvetica", "bold").setFontSize(15);
  doc.text("LB REPRESENTAÇÕES", txtX, 14);
  doc.setTextColor(...WHITE).setFont("helvetica", "normal").setFontSize(9.5);
  doc.text(`Resultados oficiais · Sergipe · ${dados.periodo}`, txtX, 22);
  if (parcImg) {
    const ph = 12;
    const pw = Math.min(52, ph * parcImg.ratio);
    try {
      doc.addImage(parcImg.url, "PNG", 196 - pw, 9, pw, ph);
    } catch {}
  }
  doc.setDrawColor(...GOLD).setLineWidth(0.4);
  doc.line(14, 30, 196, 30);

  // KPI cards
  const kpis = [
    { r: "Contemplações", v: String(dados.total) },
    { r: "Crédito estimado", v: creditoCurto(dados.credito) },
    { r: "Segmentos", v: String(dados.segmentos.length) },
  ];
  const kw = 58, kh = 26, kg = 4, kx0 = 14, ky = 40;
  kpis.forEach((k, i) => {
    const x = kx0 + i * (kw + kg);
    doc.setFillColor(...NAVY_CARD).setDrawColor(...GOLD).setLineWidth(0.3);
    doc.roundedRect(x, ky, kw, kh, 3, 3, "FD");
    doc.setTextColor(...GOLD).setFont("helvetica", "bold").setFontSize(8);
    doc.text(k.r.toUpperCase(), x + 5, ky + 8);
    doc.setTextColor(...WHITE).setFont("helvetica", "bold").setFontSize(16);
    doc.text(k.v, x + 5, ky + 20);
  });

  // donut (imagem) + legenda
  const dcanvas = document.createElement("canvas");
  dcanvas.width = 520;
  dcanvas.height = 520;
  const dctx = dcanvas.getContext("2d");
  if (dctx) {
    const fat = dados.segmentos.slice(0, 6).map((s) => ({ valor: s.qtd, cor: resolverSegmento(s.nome).cor }));
    donut(dctx, 260, 260, 200, 120, fat, { titulo: String(dados.total), sub: "contempl." });
  }
  const dy = 76;
  doc.addImage(dcanvas.toDataURL("image/png"), "PNG", 14, dy, 62, 62);
  doc.setTextColor(...WHITE).setFont("helvetica", "bold").setFontSize(11);
  doc.text("Distribuição por segmento", 84, dy + 6);
  let ly = dy + 16;
  dados.segmentos.slice(0, 6).forEach((s) => {
    const seg = resolverSegmento(s.nome);
    const c = seg.cor.replace("#", "");
    const rgbC: [number, number, number] = [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
    doc.setFillColor(...rgbC);
    doc.roundedRect(84, ly - 3.4, 4, 4, 1, 1, "F");
    doc.setTextColor(...WHITE).setFont("helvetica", "normal").setFontSize(10);
    doc.text(seg.label, 91, ly);
    doc.setTextColor(...GOLD).setFont("helvetica", "bold").setFontSize(10);
    doc.text(`${s.qtd}`, 150, ly);
    doc.setTextColor(...GREY).setFont("helvetica", "normal").setFontSize(9);
    doc.text(s.credito ? BRLc(s.credito) : "—", 196, ly, { align: "right" });
    ly += 8;
  });

  // tabela de contemplações
  const linhas = [...itens]
    .sort((a, b) => (b.dataContemplacao ?? b.mesRef).localeCompare(a.dataContemplacao ?? a.mesRef))
    .slice(0, 22);
  autoTable(doc, {
    startY: Math.max(dy + 70, ly + 6),
    head: [["Data", "Grupo", "Cota", "Tipo", "Bem", "Lance", "Crédito est."]],
    body: linhas.map((i) => [
      dataLabel(i.dataContemplacao),
      i.grupo,
      i.cota,
      i.tipoContemplacao,
      i.tipoBem ?? "—",
      i.pctLance != null ? `${i.pctLance.toLocaleString("pt-BR")}%` : "—",
      i.creditoEstimado != null ? BRLc(i.creditoEstimado) : "—",
    ]),
    theme: "grid",
    headStyles: { fillColor: GOLD, textColor: [20, 24, 10], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fillColor: [15, 26, 42], textColor: WHITE, lineColor: [40, 56, 80], fontSize: 8, cellPadding: 1.8 },
    alternateRowStyles: { fillColor: [18, 30, 48] },
    margin: { left: 14, right: 14 },
  });

  // rodapé
  doc.setTextColor(...GREY).setFont("helvetica", "italic").setFontSize(7.5);
  doc.text(
    "Crédito estimado a partir do % do lance oficial · sorteios não têm valor divulgado no resultado.",
    105,
    284,
    { align: "center" },
  );
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...WHITE);
  doc.text(
    dados.preparadoPor
      ? `Apresentação preparada por ${dados.preparadoPor} · Consultor LB Representações`
      : "LB Representações · dados oficiais da administradora",
    105,
    290,
    { align: "center" },
  );

  doc.save("resultados-lb-sergipe.pdf");
}

/* --------------------------- Relatório para impressão ---------------------- */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Relatório corporativo (layout claro, cabeçalho premium) impresso via iframe. */
export function imprimirRelatorio(dados: DadosMaterial, itens: Contemplacao[]) {
  const { lb: lbSrc, parceira: parcSrc, mostrarParceira } = fontesLogos();
  const linhas = [...itens]
    .sort((a, b) => (b.dataContemplacao ?? b.mesRef).localeCompare(a.dataContemplacao ?? a.mesRef))
    .slice(0, 40);

  const segChips = dados.segmentos
    .map((s) => `<span class="chip">${esc(resolverSegmento(s.nome).label)} · <b>${s.qtd}</b></span>`)
    .join("");

  const tbody = linhas
    .map(
      (i) => `<tr>
      <td>${esc(dataLabel(i.dataContemplacao))}</td>
      <td class="b">${esc(i.grupo)}</td>
      <td>${esc(i.cota)}</td>
      <td>${esc(i.tipoContemplacao)}</td>
      <td>${esc(i.tipoBem ?? "—")}</td>
      <td class="r">${i.pctLance != null ? `${i.pctLance.toLocaleString("pt-BR")}%` : "—"}</td>
      <td class="r">${i.valorLance != null ? esc(BRLc(i.valorLance)) : "—"}</td>
      <td class="r g">${i.creditoEstimado != null ? esc(BRLc(i.creditoEstimado)) : "—"}</td>
    </tr>`,
    )
    .join("");

  const recordeTag = dados.recorde ? `<span class="rec">RECORDE · ${esc(dados.recorde.toUpperCase())}</span>` : "";

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Resultados LB — Sergipe</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #17233a; }
  .band { background: linear-gradient(120deg,#0B1626,#132743); color:#fff; padding: 26px 34px; display:flex; justify-content:space-between; align-items:center; }
  .band .mono { display:flex; align-items:center; gap:14px; }
  .band .right { display:flex; align-items:center; gap:16px; }
  .band .plaque { background:#fff; border-radius:10px; padding:6px 10px; display:inline-flex; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,.25); }
  .band .plaque img { height:46px; width:auto; display:block; }
  .band h1 { margin:0; font-size:20px; letter-spacing:2px; }
  .band p { margin:2px 0 0; font-size:11px; color:#D4A72C; letter-spacing:1px; }
  .band .per { text-align:right; font-size:12px; color:#cdd8e8; }
  .rec { display:inline-block; margin-top:6px; background:linear-gradient(90deg,#F4D67B,#9A7016); color:#20180A; font-weight:800; font-size:11px; padding:4px 12px; border-radius:20px; }
  .wrap { padding: 26px 34px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#9A7016; border-bottom:2px solid #eadfbf; padding-bottom:6px; margin:22px 0 12px; }
  .resumo { font-size:13px; line-height:1.6; color:#33425f; }
  .kpis { display:flex; gap:14px; margin:16px 0 4px; }
  .kpi { flex:1; border:1px solid #e3e7ee; border-left:4px solid #D4A72C; border-radius:10px; padding:14px 16px; }
  .kpi .r { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#8a97ad; }
  .kpi .v { font-size:24px; font-weight:800; color:#0B1626; margin-top:2px; }
  .chips { margin:10px 0 4px; }
  .chip { display:inline-block; border:1px solid #e3e7ee; border-radius:20px; padding:5px 12px; margin:0 6px 6px 0; font-size:12px; color:#33425f; }
  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:11px; }
  th { background:#0B1626; color:#F4D67B; text-align:left; padding:8px 8px; font-size:10px; letter-spacing:.5px; }
  td { padding:7px 8px; border-bottom:1px solid #eef1f5; }
  tr:nth-child(even) td { background:#f7f9fc; }
  td.b { font-weight:700; } td.r { text-align:right; } td.g { color:#9A7016; font-weight:700; }
  .foot { margin-top:20px; padding-top:12px; border-top:1px solid #e3e7ee; font-size:10px; color:#8a97ad; text-align:center; }
  .foot b { color:#0B1626; }
  @page { size:A4; margin:0; }
</style></head>
<body>
  <div class="band">
    <div class="mono">
      <div class="plaque"><img src="${lbSrc}" alt="LB Representações"></div>
      <div><h1>LB REPRESENTAÇÕES</h1><p>CONSULTORIA EM CONSÓRCIOS</p>${recordeTag}</div>
    </div>
    <div class="right">
      ${mostrarParceira ? `<div class="plaque"><img src="${parcSrc}" alt="Multimarcas Consórcios"></div>` : ""}
      <div class="per"><b>RELATÓRIO OFICIAL</b><br>Resultados em Sergipe<br>${esc(dados.periodo)}</div>
    </div>
  </div>
  <div class="wrap">
    <h2>Resumo executivo</h2>
    <p class="resumo">No período de <b>${esc(dados.periodo)}</b>, o consórcio registrou <b>${dados.total} contemplações oficiais</b> em Sergipe
      (${dados.sorteios} por sorteio e ${dados.lances} por lance), com <b>${esc(creditoCurto(dados.credito))}</b> em crédito estimado liberado,
      distribuídas em ${dados.segmentos.length} segmento(s) de bem. Os dados são oficiais da administradora; o crédito é estimado a partir do percentual dos lances vencedores.</p>
    <div class="kpis">
      <div class="kpi"><div class="r">Contemplações</div><div class="v">${dados.total}</div></div>
      <div class="kpi"><div class="r">Crédito estimado</div><div class="v">${esc(creditoCurto(dados.credito))}</div></div>
      <div class="kpi"><div class="r">Sorteios · Lances</div><div class="v">${dados.sorteios} · ${dados.lances}</div></div>
      <div class="kpi"><div class="r">Segmentos</div><div class="v">${dados.segmentos.length}</div></div>
    </div>
    <h2>Segmentos contemplados</h2>
    <div class="chips">${segChips || "—"}</div>
    <h2>Contemplações do período</h2>
    <table>
      <thead><tr><th>Data</th><th>Grupo</th><th>Cota</th><th>Tipo</th><th>Bem</th><th>Lance %</th><th>Valor do lance</th><th>Crédito est.</th></tr></thead>
      <tbody>${tbody || `<tr><td colspan="8">Sem registros no período.</td></tr>`}</tbody>
    </table>
    <div class="foot">
      Crédito estimado a partir do % do lance oficial · sorteios não têm valor divulgado no resultado.<br>
      ${dados.preparadoPor ? `Apresentação preparada por <b>${esc(dados.preparadoPor)}</b> · Consultor LB Representações` : "LB Representações · dados oficiais da administradora"}
    </div>
  </div>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const cw = iframe.contentWindow;
  if (!cw) {
    iframe.remove();
    return;
  }
  cw.document.open();
  cw.document.write(html);
  cw.document.close();
  const disparar = () => {
    cw.focus();
    cw.print();
    setTimeout(() => iframe.remove(), 1500);
  };
  // dá tempo pro layout/fontes antes de imprimir
  setTimeout(disparar, 400);
}
