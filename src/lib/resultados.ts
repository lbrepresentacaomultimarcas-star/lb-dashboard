"use client";

// Módulo "Resultados LB" — contemplações OFICIAIS da administradora em Sergipe.
// Camada própria (não toca no store global): leitura/gravação na tabela
// resultados_contemplacoes, agregações do dashboard e geração de materiais
// (artes em canvas + PDF institucional). O parser do PDF oficial fica em
// ./resultados-parser (arquivo puro, testado contra resultados reais).

import { supabaseBrowser, supabaseEnabled } from "./supabase/client";
import type { LinhaImportada } from "./resultados-parser";

export { parsearResultados } from "./resultados-parser";
export type { LinhaImportada, ResultadoParse, TipoContemplacao } from "./resultados-parser";

export const BRLc = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* ----------------------------------- Tipos ---------------------------------- */

export type Contemplacao = LinhaImportada & { id: string };

/* ------------------------------ Dados (Supabase) ----------------------------- */

type Row = Record<string, unknown>;

function fromDb(r: Row): Contemplacao {
  return {
    id: String(r.id),
    uf: String(r.uf ?? "SE"),
    grupo: String(r.grupo),
    cota: String(r.cota),
    tipoBem: r.tipo_bem == null ? null : String(r.tipo_bem),
    tipoContemplacao: String(r.tipo_contemplacao) as Contemplacao["tipoContemplacao"],
    pctLance: r.pct_lance == null ? null : Number(r.pct_lance),
    parcelasLance: r.parcelas_lance == null ? null : Number(r.parcelas_lance),
    valorLance: r.valor_lance == null ? null : Number(r.valor_lance),
    creditoEstimado: r.credito_estimado == null ? null : Number(r.credito_estimado),
    numAssembleia: r.num_assembleia == null ? null : Number(r.num_assembleia),
    dataContemplacao: r.data_contemplacao == null ? null : String(r.data_contemplacao),
    mesRef: String(r.mes_ref),
    fonte: r.fonte == null ? null : String(r.fonte),
  };
}

export const resultadosApi = {
  async listar(): Promise<Contemplacao[]> {
    if (!supabaseEnabled) return [];
    const { data } = await supabaseBrowser()
      .from("resultados_contemplacoes")
      .select("*")
      .order("mes_ref", { ascending: false })
      .limit(20000);
    return ((data ?? []) as Row[]).map(fromDb);
  },

  /** Insere em lote ignorando duplicados (índice único cuida da idempotência). */
  async salvar(linhas: LinhaImportada[]): Promise<{ ok: boolean; erro?: string; inseridos: number }> {
    if (!supabaseEnabled) return { ok: false, erro: "Supabase não configurado.", inseridos: 0 };
    const rows = linhas.map((l) => ({
      uf: l.uf,
      grupo: l.grupo,
      cota: l.cota,
      tipo_bem: l.tipoBem,
      tipo_contemplacao: l.tipoContemplacao,
      pct_lance: l.pctLance,
      parcelas_lance: l.parcelasLance,
      valor_lance: l.valorLance,
      credito_estimado: l.creditoEstimado,
      num_assembleia: l.numAssembleia,
      data_contemplacao: l.dataContemplacao,
      mes_ref: l.mesRef,
      fonte: l.fonte,
    }));
    const { error, count } = await supabaseBrowser()
      .from("resultados_contemplacoes")
      .upsert(rows, { onConflict: "org_id,grupo,cota,mes_ref", ignoreDuplicates: true, count: "exact" });
    if (error) return { ok: false, erro: error.message, inseridos: 0 };
    return { ok: true, inseridos: count ?? rows.length };
  },
};

/* --------------------------------- Agregações -------------------------------- */

export type FiltroMeses = 1 | 3 | 6 | 12 | 0; // 0 = tudo

export function filtrarPeriodo(itens: Contemplacao[], meses: FiltroMeses): Contemplacao[] {
  if (meses === 0) return itens;
  const corte = new Date();
  corte.setMonth(corte.getMonth() - meses + 1);
  const chave = `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, "0")}`;
  return itens.filter((i) => i.mesRef >= chave);
}

export type ResumoResultados = {
  total: number;
  sorteios: number;
  lances: number;
  valorLances: number; // soma dos lances pagos pelos contemplados de SE
  creditoEstimado: number; // soma dos créditos estimados (só lances têm valor)
  porTipo: { nome: string; qtd: number }[];
  porBem: { nome: string; qtd: number; credito: number }[];
  porGrupo: { grupo: string; qtd: number; bem: string | null }[];
  porMes: { mes: string; qtd: number; credito: number }[];
};

export function resumir(itens: Contemplacao[]): ResumoResultados {
  const tipo = new Map<string, number>();
  const bem = new Map<string, { qtd: number; credito: number }>();
  const grupo = new Map<string, { qtd: number; bem: string | null }>();
  const mes = new Map<string, { qtd: number; credito: number }>();
  let sorteios = 0;
  let valorLances = 0;
  let creditoEstimado = 0;
  for (const i of itens) {
    if (i.tipoContemplacao === "Sorteio") sorteios++;
    valorLances += i.valorLance ?? 0;
    creditoEstimado += i.creditoEstimado ?? 0;
    tipo.set(i.tipoContemplacao, (tipo.get(i.tipoContemplacao) ?? 0) + 1);
    const nb = i.tipoBem ?? "Não informado";
    const b = bem.get(nb) ?? { qtd: 0, credito: 0 };
    b.qtd++;
    b.credito += i.creditoEstimado ?? 0;
    bem.set(nb, b);
    const g = grupo.get(i.grupo) ?? { qtd: 0, bem: i.tipoBem };
    g.qtd++;
    g.bem = g.bem ?? i.tipoBem;
    grupo.set(i.grupo, g);
    const m = mes.get(i.mesRef) ?? { qtd: 0, credito: 0 };
    m.qtd++;
    m.credito += i.creditoEstimado ?? 0;
    mes.set(i.mesRef, m);
  }
  const ordemTipo = ["Sorteio", "Lance Fixo", "Lance Livre"];
  return {
    total: itens.length,
    sorteios,
    lances: itens.length - sorteios,
    valorLances,
    creditoEstimado,
    porTipo: ordemTipo.filter((t) => tipo.has(t)).map((t) => ({ nome: t, qtd: tipo.get(t) ?? 0 })),
    porBem: [...bem.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.qtd - a.qtd),
    porGrupo: [...grupo.entries()].map(([g, v]) => ({ grupo: g, ...v })).sort((a, b) => b.qtd - a.qtd),
    porMes: [...mes.entries()].map(([m, v]) => ({ mes: m, ...v })).sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

export const mesLabel = (m: string) => {
  const [a, mm] = m.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mm) - 1] ?? mm}/${a.slice(2)}`;
};

export const dataLabel = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/* --------------------------- Materiais (canvas + PDF) ------------------------- */

const NAVY = "#132743";
const NAVY2 = "#0a1626";
const GOLD = "#d4a72c";

function baixarCanvas(canvas: HTMLCanvasElement, nome: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(u);
  }, "image/png");
}

export type ArteTipo = "feed" | "story" | "status";

/** Gera a arte (Instagram feed/story ou status do WhatsApp) com a identidade
 *  navy/dourado da LB — 100% no navegador, sem serviços externos. */
export function gerarArte(tipo: ArteTipo, d: {
  titulo: string;
  destaqueQtd: string;
  destaqueValor: string;
  periodo: string;
  preparadoPor?: string;
}) {
  const W = 1080;
  const H = tipo === "feed" ? 1080 : 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, NAVY);
  grad.addColorStop(1, NAVY2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // moldura dourada
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 10;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  ctx.textAlign = "center";
  const cx = W / 2;
  let y = tipo === "feed" ? 190 : 340;

  ctx.fillStyle = GOLD;
  ctx.font = "bold 54px Arial";
  ctx.fillText("LB REPRESENTAÇÕES", cx, y);
  y += 54;
  ctx.fillStyle = "#ffffffcc";
  ctx.font = "28px Arial";
  ctx.fillText("Resultados oficiais da administradora — Sergipe", cx, y);

  y += tipo === "feed" ? 130 : 220;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 52px Arial";
  wrapText(ctx, d.titulo, cx, y, W - 220, 62);

  y += tipo === "feed" ? 170 : 260;
  ctx.fillStyle = GOLD;
  ctx.font = "bold 150px Arial";
  ctx.fillText(d.destaqueQtd, cx, y);
  y += 64;
  ctx.fillStyle = "#ffffff";
  ctx.font = "34px Arial";
  ctx.fillText("contemplações em Sergipe", cx, y);

  y += tipo === "feed" ? 120 : 200;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 72px Arial";
  ctx.fillText(d.destaqueValor, cx, y);
  y += 48;
  ctx.fillStyle = "#ffffffb0";
  ctx.font = "30px Arial";
  ctx.fillText(`em crédito estimado · ${d.periodo}`, cx, y);

  const yRodape = H - (tipo === "feed" ? 120 : 180);
  ctx.fillStyle = "#ffffffb0";
  ctx.font = "26px Arial";
  if (d.preparadoPor) {
    ctx.fillText(`Apresentação preparada por ${d.preparadoPor}`, cx, yRodape);
    ctx.fillText("Consultor LB Representações", cx, yRodape + 36);
  } else {
    ctx.fillText("Fale com um consultor LB Representações", cx, yRodape);
  }

  baixarCanvas(canvas, `resultados-lb-${tipo}.png`);
}

function wrapText(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, maxW: number, lh: number) {
  const palavras = texto.split(" ");
  let linha = "";
  for (const p of palavras) {
    const t = linha ? `${linha} ${p}` : p;
    if (ctx.measureText(t).width > maxW && linha) {
      ctx.fillText(linha, x, y);
      linha = p;
      y += lh;
    } else linha = t;
  }
  if (linha) ctx.fillText(linha, x, y);
}

/** PDF institucional (jsPDF dinâmico — mesmo padrão do export do CRM). */
export async function gerarPdfInstitucional(d: {
  periodo: string;
  resumo: ResumoResultados;
  itens: Contemplacao[];
  preparadoPor?: string;
}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF();
  const navy: [number, number, number] = [19, 39, 67];

  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 42, "F");
  doc.setTextColor(212, 167, 44).setFont("helvetica", "bold").setFontSize(20);
  doc.text("LB REPRESENTAÇÕES", 105, 18, { align: "center" });
  doc.setTextColor(255).setFontSize(11).setFont("helvetica", "normal");
  doc.text(`Resultados oficiais da administradora — Sergipe · ${d.periodo}`, 105, 28, { align: "center" });

  doc.setTextColor(30).setFont("helvetica", "bold").setFontSize(14);
  doc.text(
    `${d.resumo.total} contemplações (${d.resumo.sorteios} sorteios · ${d.resumo.lances} lances) · ${BRLc(d.resumo.creditoEstimado)} em crédito estimado`,
    105,
    56,
    { align: "center" },
  );

  const linhas = [...d.itens]
    .sort((a, b) => (b.dataContemplacao ?? b.mesRef).localeCompare(a.dataContemplacao ?? a.mesRef))
    .slice(0, 40);
  autoTable(doc, {
    startY: 66,
    head: [["Data", "Grupo", "Cota", "Tipo", "Bem", "Lance", "Valor do lance", "Crédito estimado"]],
    body: linhas.map((i) => [
      dataLabel(i.dataContemplacao),
      i.grupo,
      i.cota,
      i.tipoContemplacao,
      i.tipoBem ?? "—",
      i.pctLance != null ? `${i.pctLance.toLocaleString("pt-BR")}%` : "—",
      i.valorLance != null ? BRLc(i.valorLance) : "—",
      i.creditoEstimado != null ? BRLc(i.creditoEstimado) : "—",
    ]),
    headStyles: { fillColor: navy },
    styles: { fontSize: 8 },
  });
  const fim = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  autoTable(doc, {
    startY: fim + 6,
    head: [["Tipo de bem", "Contemplações", "Crédito estimado"]],
    body: d.resumo.porBem.map((m) => [m.nome, String(m.qtd), m.credito ? BRLc(m.credito) : "—"]),
    headStyles: { fillColor: navy },
    styles: { fontSize: 9 },
  });

  doc.setFontSize(8).setTextColor(120);
  doc.text(
    "Crédito estimado a partir do % do lance oficial · sorteios não têm valor divulgado no resultado.",
    105,
    283,
    { align: "center" },
  );
  doc.setFontSize(9);
  const rodape = d.preparadoPor
    ? `Apresentação preparada por ${d.preparadoPor} · Consultor LB Representações`
    : "LB Representações · dados oficiais da administradora";
  doc.text(rodape, 105, 290, { align: "center" });

  doc.save("resultados-lb-sergipe.pdf");
}
