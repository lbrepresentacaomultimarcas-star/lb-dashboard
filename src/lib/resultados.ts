"use client";

// Módulo "Resultados LB" — contemplações OFICIAIS da administradora em Sergipe.
// Camada própria (não toca no store global): parser do arquivo/link, filtro SE,
// agregações do dashboard, leitura/gravação na tabela resultados_contemplacoes
// e geração de materiais (artes em canvas + PDF institucional).

import { supabaseBrowser, supabaseEnabled } from "./supabase/client";

export const BRLc = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* ----------------------------------- Tipos ---------------------------------- */

export type Contemplacao = {
  id: string;
  cidade: string;
  estado: string;
  tipoBem: string | null;
  valorCredito: number | null;
  grupo: string | null;
  cota: string | null;
  dataContemplacao: string | null; // "YYYY-MM-DD"
  tipoContemplacao: string | null;
  mesRef: string; // "YYYY-MM"
  fonte: string | null;
};

/* ----------------------- Municípios de Sergipe (75) -------------------------- */

export const CIDADES_SE = [
  "Amparo de São Francisco", "Aquidabã", "Aracaju", "Arauá", "Areia Branca", "Barra dos Coqueiros",
  "Boquim", "Brejo Grande", "Campo do Brito", "Canhoba", "Canindé de São Francisco", "Capela",
  "Carira", "Carmópolis", "Cedro de São João", "Cristinápolis", "Cumbe", "Divina Pastora",
  "Estância", "Feira Nova", "Frei Paulo", "Gararu", "General Maynard", "Gracho Cardoso",
  "Ilha das Flores", "Indiaroba", "Itabaiana", "Itabaianinha", "Itabi", "Itaporanga d'Ajuda",
  "Japaratuba", "Japoatã", "Lagarto", "Laranjeiras", "Macambira", "Malhada dos Bois", "Malhador",
  "Maruim", "Moita Bonita", "Monte Alegre de Sergipe", "Muribeca", "Neópolis", "Nossa Senhora Aparecida",
  "Nossa Senhora da Glória", "Nossa Senhora das Dores", "Nossa Senhora de Lourdes", "Nossa Senhora do Socorro",
  "Pacatuba", "Pedra Mole", "Pedrinhas", "Pinhão", "Pirambu", "Poço Redondo", "Poço Verde",
  "Porto da Folha", "Propriá", "Riachão do Dantas", "Riachuelo", "Ribeirópolis", "Rosário do Catete",
  "Salgado", "Santa Luzia do Itanhy", "Santa Rosa de Lima", "Santana do São Francisco", "Santo Amaro das Brotas",
  "São Cristóvão", "São Domingos", "São Francisco", "São Miguel do Aleixo", "Simão Dias", "Siriri",
  "Telha", "Tobias Barreto", "Tomar do Geru", "Umbaúba",
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const CIDADES_NORM = new Map(CIDADES_SE.map((c) => [norm(c), c]));

/* ------------------------------ Parser do arquivo ---------------------------- */

export type LinhaImportada = Omit<Contemplacao, "id">;

const RE_VALOR = /R?\$?\s?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})/;
const RE_DATA = /(\d{2})\/(\d{2})\/(\d{4})/;
const RE_TIPO_CONT = /(sorteio|lance\s*fixo|lance\s*livre|lance\s*embutido|loteria|lance)/i;
const RE_TIPO_BEM = /(im[oó]vel|autom[oó]vel|auto\b|ve[ií]culo|carro|moto(?:cicleta)?|caminh[aã]o|servi[cç]o)/i;

function tipoBemLabel(m: string): string {
  const t = norm(m);
  if (t.startsWith("imo")) return "Imóvel";
  if (t.startsWith("moto")) return "Moto";
  if (t.startsWith("caminh")) return "Caminhão";
  if (t.startsWith("servi")) return "Serviço";
  return "Automóvel";
}

function tipoContLabel(m: string): string {
  const t = norm(m);
  if (t.includes("sorteio") || t.includes("loteria")) return "Sorteio";
  if (t.includes("fixo")) return "Lance fixo";
  if (t.includes("livre")) return "Lance livre";
  if (t.includes("embutido")) return "Lance embutido";
  return "Lance";
}

/** Extrai contemplações de SERGIPE do texto bruto do PDF/página oficial.
 *  Heurístico e tolerante: reconhece a cidade (lista dos 75 municípios) na
 *  linha e captura valor, grupo, cota, data e tipos quando presentes. */
export function parsearResultados(texto: string, mesRefPadrao: string, fonte: string): LinhaImportada[] {
  const out: LinhaImportada[] = [];
  const linhas = texto.split(/\r?\n/);

  for (const bruta of linhas) {
    const linha = bruta.replace(/\s{2,}/g, " ").trim();
    if (linha.length < 8) continue;
    const nl = norm(linha);

    // Cidade de Sergipe presente na linha? (maior nome primeiro evita colisões)
    let cidade: string | null = null;
    for (const [chave, nome] of CIDADES_NORM) {
      if (nl.includes(chave)) {
        if (!cidade || nome.length > cidade.length) cidade = nome;
      }
    }
    // Sem cidade reconhecida: aceita apenas se a linha marca explicitamente SE
    if (!cidade && !/(\/SE\b|\bSE\b\s*$|-\s*SE\b)/.test(linha)) continue;

    const valor = RE_VALOR.exec(linha);
    const data = RE_DATA.exec(linha);
    const tCont = RE_TIPO_CONT.exec(linha);
    const tBem = RE_TIPO_BEM.exec(linha);

    // Grupo/cota: pares numéricos (grupo 3-5 dígitos; cota 1-4, com dígito opcional)
    let grupo: string | null = null;
    let cota: string | null = null;
    const gc = /\b(\d{3,5})\b[\s./-]+\b(\d{1,4}(?:-\d)?)\b/.exec(linha.replace(RE_VALOR, " ").replace(RE_DATA, " "));
    if (gc) {
      grupo = gc[1];
      cota = gc[2];
    }

    // Linha precisa ter ao menos um sinal forte além da cidade
    if (!valor && !gc && !tCont) continue;

    const dataIso = data ? `${data[3]}-${data[2]}-${data[1]}` : null;
    out.push({
      cidade: cidade ?? "Sergipe (cidade não informada)",
      estado: "SE",
      tipoBem: tBem ? tipoBemLabel(tBem[1]) : null,
      valorCredito: valor ? Number(valor[1].replace(/\./g, "").replace(",", ".")) : null,
      grupo,
      cota,
      dataContemplacao: dataIso,
      tipoContemplacao: tCont ? tipoContLabel(tCont[1]) : null,
      mesRef: dataIso ? dataIso.slice(0, 7) : mesRefPadrao,
      fonte,
    });
  }
  return out;
}

/* ------------------------------ Dados (Supabase) ----------------------------- */

type Row = Record<string, unknown>;

function fromDb(r: Row): Contemplacao {
  return {
    id: String(r.id),
    cidade: String(r.cidade),
    estado: String(r.estado ?? "SE"),
    tipoBem: r.tipo_bem == null ? null : String(r.tipo_bem),
    valorCredito: r.valor_credito == null ? null : Number(r.valor_credito),
    grupo: r.grupo == null ? null : String(r.grupo),
    cota: r.cota == null ? null : String(r.cota),
    dataContemplacao: r.data_contemplacao == null ? null : String(r.data_contemplacao),
    tipoContemplacao: r.tipo_contemplacao == null ? null : String(r.tipo_contemplacao),
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
      cidade: l.cidade,
      estado: l.estado,
      tipo_bem: l.tipoBem,
      valor_credito: l.valorCredito,
      grupo: l.grupo,
      cota: l.cota,
      data_contemplacao: l.dataContemplacao,
      tipo_contemplacao: l.tipoContemplacao,
      mes_ref: l.mesRef,
      fonte: l.fonte,
    }));
    const { error, count } = await supabaseBrowser()
      .from("resultados_contemplacoes")
      .upsert(rows, { onConflict: "org_id,mes_ref,grupo,cota,cidade", ignoreDuplicates: true, count: "exact" });
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
  valorTotal: number;
  porModalidade: { nome: string; qtd: number; valor: number }[];
  porCidade: { cidade: string; qtd: number; valor: number }[];
  porMes: { mes: string; qtd: number; valor: number }[];
};

export function resumir(itens: Contemplacao[]): ResumoResultados {
  const mod = new Map<string, { qtd: number; valor: number }>();
  const cid = new Map<string, { qtd: number; valor: number }>();
  const mes = new Map<string, { qtd: number; valor: number }>();
  let valorTotal = 0;
  for (const i of itens) {
    valorTotal += i.valorCredito ?? 0;
    const m = i.tipoBem ?? i.tipoContemplacao ?? "Não informado";
    const a = mod.get(m) ?? { qtd: 0, valor: 0 };
    a.qtd++;
    a.valor += i.valorCredito ?? 0;
    mod.set(m, a);
    const b = cid.get(i.cidade) ?? { qtd: 0, valor: 0 };
    b.qtd++;
    b.valor += i.valorCredito ?? 0;
    cid.set(i.cidade, b);
    const c = mes.get(i.mesRef) ?? { qtd: 0, valor: 0 };
    c.qtd++;
    c.valor += i.valorCredito ?? 0;
    mes.set(i.mesRef, c);
  }
  return {
    total: itens.length,
    valorTotal,
    porModalidade: [...mod.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.qtd - a.qtd),
    porCidade: [...cid.entries()].map(([cidade, v]) => ({ cidade, ...v })).sort((a, b) => b.qtd - a.qtd),
    porMes: [...mes.entries()].map(([m, v]) => ({ mes: m, ...v })).sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

export const mesLabel = (m: string) => {
  const [a, mm] = m.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mm) - 1] ?? mm}/${a.slice(2)}`;
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
  ctx.fillText(`em crédito liberado · ${d.periodo}`, cx, y);

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
  doc.text(`${d.resumo.total} contemplações · ${BRLc(d.resumo.valorTotal)} em crédito liberado`, 105, 56, { align: "center" });

  autoTable(doc, {
    startY: 66,
    head: [["Cidade", "Contemplações", "Valor liberado"]],
    body: d.resumo.porCidade.slice(0, 20).map((c) => [c.cidade, String(c.qtd), BRLc(c.valor)]),
    headStyles: { fillColor: navy },
    styles: { fontSize: 9 },
  });
  const fim = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  autoTable(doc, {
    startY: fim + 6,
    head: [["Modalidade", "Contemplações", "Valor"]],
    body: d.resumo.porModalidade.map((m) => [m.nome, String(m.qtd), BRLc(m.valor)]),
    headStyles: { fillColor: navy },
    styles: { fontSize: 9 },
  });

  doc.setFontSize(9).setTextColor(120);
  const rodape = d.preparadoPor
    ? `Apresentação preparada por ${d.preparadoPor} · Consultor LB Representações`
    : "LB Representações · dados oficiais da administradora";
  doc.text(rodape, 105, 290, { align: "center" });

  doc.save("resultados-lb-sergipe.pdf");
}
