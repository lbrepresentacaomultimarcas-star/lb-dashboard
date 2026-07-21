// Motor de renderização dos materiais premium do módulo Resultados LB.
// Arquivo PURO (sem "use client", sem browser/supabase) — as funções recebem
// um contexto de canvas e desenham. Isso permite renderizar tanto no navegador
// (download/preview) quanto no Node (@napi-rs/canvas) para inspeção visual.
//
// Identidade LB: fundo escuro elegante, dourado protagonista, branco, azul só
// como iluminação. Profundidade, glow, partículas, textura, mapa de Sergipe,
// ícones vetoriais por segmento, gráficos (donut/barras), cards e selo Recorde.

export type Ctx = CanvasRenderingContext2D;

export type FormatoMaterial = "feed" | "story" | "status" | "pdf-capa";
export type TemplateFeed = "Premium" | "Executivo" | "Comercial";

export type SegmentoDado = { nome: string; qtd: number; credito: number };
export type MesDado = { mes: string; label: string; qtd: number; credito: number };

export type DadosMaterial = {
  titulo: string;
  subtitulo: string;
  periodo: string;
  total: number;
  sorteios: number;
  lances: number;
  credito: number;
  segmentos: SegmentoDado[];
  porMes: MesDado[];
  recorde: string | null;
  destaqueUnico?: { grupo: string; cota: string; tipo: string } | null;
  preparadoPor?: string;
};

/* --------------------------------- Paleta ---------------------------------- */

export const PALETA = {
  fundo0: "#0B1626",
  fundo1: "#060A12",
  ouroClaro: "#F4D67B",
  ouro: "#D4A72C",
  ouroEscuro: "#9A7016",
  branco: "#FFFFFF",
  brancoSuave: "#E9EEF6",
  cinza: "#93A4BC",
  azulLuz: "#3E74AD",
  azulLuz2: "#20406A",
};

/* ------------------------------- Utilidades -------------------------------- */

const fonte = (peso: number, px: number, fam = "'Arial','Helvetica',sans-serif") => `${peso} ${px}px ${fam}`;

function hexRgb(h: string): [number, number, number] {
  let s = h.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function mix(a: string, b: string, t: number) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
const aclarar = (h: string, t = 0.3) => mix(h, "#ffffff", t);
const escurecer = (h: string, t = 0.3) => mix(h, "#000000", t);

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function creditoCurto(v: number) {
  if (v >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1e3) return `R$ ${Math.round(v / 1e3)} mil`;
  return brl(v);
}

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function comSombra(ctx: Ctx, cor: string, blur: number, fn: () => void, dx = 0, dy = 0) {
  ctx.save();
  ctx.shadowColor = cor;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = dx;
  ctx.shadowOffsetY = dy;
  fn();
  ctx.restore();
}

/** Texto com brilho suave — usado nos números protagonistas. */
function textoGlow(ctx: Ctx, txt: string, x: number, y: number, f: string, cor: string, glow: string, blur: number, align: CanvasTextAlign = "center", baseline: CanvasTextBaseline = "alphabetic") {
  ctx.save();
  ctx.font = f;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.shadowColor = glow;
  ctx.shadowBlur = blur;
  ctx.fillStyle = cor;
  ctx.fillText(txt, x, y);
  ctx.restore();
}

function gradOuro(ctx: Ctx, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, PALETA.ouroClaro);
  g.addColorStop(0.5, PALETA.ouro);
  g.addColorStop(1, PALETA.ouroEscuro);
  return g;
}

function wrap(ctx: Ctx, txt: string, max: number): string[] {
  const palavras = txt.split(" ");
  const linhas: string[] = [];
  let cur = "";
  for (const p of palavras) {
    const t = cur ? `${cur} ${p}` : p;
    if (ctx.measureText(t).width > max && cur) {
      linhas.push(cur);
      cur = p;
    } else cur = t;
  }
  if (cur) linhas.push(cur);
  return linhas;
}

function textoEspacado(ctx: Ctx, txt: string, cx: number, y: number, tracking: number) {
  const larguras = [...txt].map((c) => ctx.measureText(c).width + tracking);
  const total = larguras.reduce((s, w) => s + w, 0) - tracking;
  let x = cx - total / 2;
  ctx.textAlign = "left";
  [...txt].forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += larguras[i];
  });
  ctx.textAlign = "center";
}

/* -------------------------- Segmentos + ícones ----------------------------- */

type DesenhoIcone = (ctx: Ctx, cx: number, cy: number, s: number, cor: string) => void;

function base(ctx: Ctx, cor: string, s: number) {
  ctx.strokeStyle = cor;
  ctx.fillStyle = cor;
  ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}
function anel(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

const icoCasa: DesenhoIcone = (ctx, cx, cy, s, cor) => {
  base(ctx, cor, s);
  const w = s * 0.86, h = s * 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h * 0.05);
  ctx.lineTo(cx, cy - h * 0.62);
  ctx.lineTo(cx + w / 2, cy - h * 0.05);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.4, cy - h * 0.12);
  ctx.lineTo(cx - w * 0.4, cy + h * 0.5);
  ctx.lineTo(cx + w * 0.4, cy + h * 0.5);
  ctx.lineTo(cx + w * 0.4, cy - h * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(cx - w * 0.12, cy + h * 0.12, w * 0.24, h * 0.38);
  ctx.stroke();
};

const icoCarro: DesenhoIcone = (ctx, cx, cy, s, cor) => {
  base(ctx, cor, s);
  const w = s * 0.92;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy + s * 0.06);
  ctx.lineTo(cx - w * 0.42, cy - s * 0.04);
  ctx.lineTo(cx - w * 0.28, cy - s * 0.22);
  ctx.quadraticCurveTo(cx - w * 0.24, cy - s * 0.28, cx - w * 0.16, cy - s * 0.28);
  ctx.lineTo(cx + w * 0.2, cy - s * 0.28);
  ctx.quadraticCurveTo(cx + w * 0.3, cy - s * 0.28, cx + w * 0.36, cy - s * 0.16);
  ctx.lineTo(cx + w * 0.44, cy - s * 0.02);
  ctx.lineTo(cx + w / 2, cy + s * 0.06);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.42, cy + s * 0.06);
  ctx.lineTo(cx + w * 0.42, cy + s * 0.06);
  ctx.stroke();
  const wy = cy + s * 0.12;
  anel(ctx, cx - w * 0.26, wy, s * 0.1);
  anel(ctx, cx + w * 0.26, wy, s * 0.1);
};

const icoMoto: DesenhoIcone = (ctx, cx, cy, s, cor) => {
  base(ctx, cor, s);
  const r = s * 0.18;
  anel(ctx, cx - s * 0.3, cy + s * 0.14, r);
  anel(ctx, cx + s * 0.32, cy + s * 0.14, r);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.3, cy + s * 0.14);
  ctx.lineTo(cx - s * 0.04, cy - s * 0.02);
  ctx.lineTo(cx + s * 0.18, cy - s * 0.02);
  ctx.lineTo(cx + s * 0.32, cy + s * 0.14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12, cy - s * 0.02);
  ctx.lineTo(cx - s * 0.22, cy - s * 0.2);
  ctx.lineTo(cx - s * 0.36, cy - s * 0.2);
  ctx.stroke();
};

const icoCaminhao: DesenhoIcone = (ctx, cx, cy, s, cor) => {
  base(ctx, cor, s);
  ctx.beginPath();
  ctx.rect(cx - s * 0.44, cy - s * 0.22, s * 0.5, s * 0.34);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.06, cy - s * 0.06);
  ctx.lineTo(cx + s * 0.24, cy - s * 0.06);
  ctx.lineTo(cx + s * 0.42, cy + s * 0.02);
  ctx.lineTo(cx + s * 0.42, cy + s * 0.12);
  ctx.lineTo(cx + s * 0.06, cy + s * 0.12);
  ctx.stroke();
  anel(ctx, cx - s * 0.26, cy + s * 0.16, s * 0.1);
  anel(ctx, cx + s * 0.28, cy + s * 0.16, s * 0.1);
};

const icoMaquina: DesenhoIcone = (ctx, cx, cy, s, cor) => {
  base(ctx, cor, s);
  anel(ctx, cx + s * 0.22, cy + s * 0.12, s * 0.22);
  anel(ctx, cx - s * 0.3, cy + s * 0.2, s * 0.12);
  ctx.beginPath();
  ctx.rect(cx - s * 0.36, cy - s * 0.24, s * 0.34, s * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.02, cy - s * 0.1);
  ctx.lineTo(cx + s * 0.22, cy - s * 0.1);
  ctx.lineTo(cx + s * 0.22, cy + s * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.28, cy - s * 0.24);
  ctx.lineTo(cx - s * 0.28, cy - s * 0.4);
  ctx.stroke();
};

const icoMaleta: DesenhoIcone = (ctx, cx, cy, s, cor) => {
  base(ctx, cor, s);
  ctx.beginPath();
  ctx.rect(cx - s * 0.42, cy - s * 0.16, s * 0.84, s * 0.44);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.16, cy - s * 0.16);
  ctx.lineTo(cx - s * 0.16, cy - s * 0.3);
  ctx.lineTo(cx + s * 0.16, cy - s * 0.3);
  ctx.lineTo(cx + s * 0.16, cy - s * 0.16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy + s * 0.04);
  ctx.lineTo(cx + s * 0.42, cy + s * 0.04);
  ctx.stroke();
};

const icoSol: DesenhoIcone = (ctx, cx, cy, s, cor) => {
  base(ctx, cor, s);
  anel(ctx, cx, cy, s * 0.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3);
    ctx.lineTo(cx + Math.cos(a) * s * 0.44, cy + Math.sin(a) * s * 0.44);
    ctx.stroke();
  }
};

const icoDiamante: DesenhoIcone = (ctx, cx, cy, s, cor) => {
  base(ctx, cor, s);
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.34);
  ctx.lineTo(cx + s * 0.34, cy);
  ctx.lineTo(cx, cy + s * 0.34);
  ctx.lineTo(cx - s * 0.34, cy);
  ctx.closePath();
  ctx.stroke();
};

type Segmento = { chave: string; label: string; cor: string; icone: DesenhoIcone };

const SEG: Record<string, Segmento> = {
  imovel: { chave: "imovel", label: "Imóveis", cor: PALETA.ouro, icone: icoCasa },
  auto: { chave: "auto", label: "Automóveis", cor: PALETA.ouroClaro, icone: icoCarro },
  moto: { chave: "moto", label: "Motos", cor: "#C9962E", icone: icoMoto },
  caminhao: { chave: "caminhao", label: "Caminhões", cor: PALETA.brancoSuave, icone: icoCaminhao },
  maquina: { chave: "maquina", label: "Máquinas", cor: "#B98A2A", icone: icoMaquina },
  capital: { chave: "capital", label: "Capital de Giro", cor: PALETA.azulLuz, icone: icoMaleta },
  solar: { chave: "solar", label: "Energia Solar", cor: "#EBC65E", icone: icoSol },
  outro: { chave: "outro", label: "Outros", cor: PALETA.ouro, icone: icoDiamante },
};

const SEG_ALIAS: Record<string, string> = {
  imovel: "imovel", imoveis: "imovel",
  automovel: "auto", automoveis: "auto", auto: "auto", carro: "auto", veiculo: "auto", veiculos: "auto",
  moto: "moto", motocicleta: "moto", motos: "moto",
  caminhao: "caminhao", caminhoes: "caminhao",
  maquina: "maquina", maquinas: "maquina", trator: "maquina", pesados: "maquina",
  servico: "capital", servicos: "capital", capital: "capital", "capital de giro": "capital",
  "energia solar": "solar", solar: "solar", energia: "solar",
};

export function resolverSegmento(nome: string): Segmento {
  const k = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return SEG[SEG_ALIAS[k] ?? "outro"] ?? SEG.outro;
}

/** Badge circular premium com o ícone vetorial do segmento. */
export function badgeSegmento(ctx: Ctx, cx: number, cy: number, r: number, seg: Segmento) {
  ctx.save();
  comSombra(ctx, rgba(hexRgb(seg.cor), 0.5), r * 0.5, () => {
    rrect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.5);
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, "rgba(255,255,255,0.10)");
    g.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = g;
    ctx.fill();
  });
  rrect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.5);
  ctx.lineWidth = Math.max(1.2, r * 0.05);
  ctx.strokeStyle = rgba(hexRgb(seg.cor), 0.55);
  ctx.stroke();
  seg.icone(ctx, cx, cy, r * 1.15, seg.cor);
  ctx.restore();
}

/* ----------------------------- Fundo premium ------------------------------- */

function brilho(ctx: Ctx, x: number, y: number, r: number, cor: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(hexRgb(cor), alpha));
  g.addColorStop(1, rgba(hexRgb(cor), 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function textura(ctx: Ctx, W: number, H: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.02)";
  ctx.lineWidth = 1;
  for (let x = -H; x < W; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }
  ctx.restore();
}

function particulas(ctx: Ctx, W: number, H: number, seed = 7) {
  const rnd = prng(seed);
  const n = Math.round((W * H) / 24000);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, r = rnd() * 2.6 + 0.6, a = rnd() * 0.4 + 0.08;
    ctx.save();
    ctx.shadowColor = rgba(hexRgb(PALETA.ouroClaro), 0.8);
    ctx.shadowBlur = 8;
    ctx.fillStyle = rgba(hexRgb(PALETA.ouroClaro), a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function vinheta(ctx: Ctx, W: number, H: number) {
  const g = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Silhueta simplificada de Sergipe (normalizada 0..1) — marca d'água discreta.
const SERGIPE = [
  [0.30, 0.05], [0.44, 0.03], [0.56, 0.08], [0.67, 0.15], [0.79, 0.20],
  [0.87, 0.31], [0.91, 0.44], [0.88, 0.56], [0.81, 0.67], [0.72, 0.77],
  [0.62, 0.85], [0.51, 0.91], [0.42, 0.92], [0.35, 0.85], [0.29, 0.76],
  [0.22, 0.67], [0.16, 0.56], [0.12, 0.44], [0.14, 0.32], [0.19, 0.20], [0.25, 0.10],
];

export function mapaSergipe(ctx: Ctx, x: number, y: number, w: number, h: number, opts: { alpha?: number; cor?: string; preencher?: boolean; glow?: boolean } = {}) {
  const { alpha = 0.06, cor = PALETA.ouro, preencher = true, glow = false } = opts;
  ctx.save();
  ctx.beginPath();
  SERGIPE.forEach(([px, py], i) => {
    const nx = x + px * w, ny = y + py * h;
    const [ax, ay] = SERGIPE[(i + 1) % SERGIPE.length];
    const mx = x + ((px + ax) / 2) * w, my = y + ((py + ay) / 2) * h;
    if (i === 0) ctx.moveTo(nx, ny);
    ctx.quadraticCurveTo(nx, ny, mx, my);
  });
  ctx.closePath();
  if (glow) {
    ctx.shadowColor = rgba(hexRgb(cor), 0.6);
    ctx.shadowBlur = 40;
  }
  if (preencher) {
    ctx.fillStyle = rgba(hexRgb(cor), alpha);
    ctx.fill();
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(hexRgb(cor), Math.min(1, alpha * 3));
  ctx.stroke();
  ctx.restore();
}

export function fundo(ctx: Ctx, W: number, H: number, opts: { mapa?: boolean; mapaCentro?: boolean } = {}) {
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, PALETA.fundo0);
  g.addColorStop(1, PALETA.fundo1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  brilho(ctx, W * 0.86, H * 0.06, Math.max(W, H) * 0.72, PALETA.azulLuz, 0.28);
  brilho(ctx, W * 0.08, H * 0.98, Math.max(W, H) * 0.66, PALETA.ouro, 0.14);
  textura(ctx, W, H);
  if (opts.mapa !== false) {
    if (opts.mapaCentro) mapaSergipe(ctx, W * 0.2, H * 0.24, W * 0.6, W * 0.6, { alpha: 0.05 });
    else mapaSergipe(ctx, W * 0.52, H * 0.5, W * 0.56, W * 0.56, { alpha: 0.045 });
  }
  particulas(ctx, W, H);
  vinheta(ctx, W, H);
}

/* --------------------------------- Moldura --------------------------------- */

export function moldura(ctx: Ctx, W: number, H: number, inset = 34) {
  ctx.save();
  rrect(ctx, inset, inset, W - inset * 2, H - inset * 2, 28);
  ctx.strokeStyle = gradOuro(ctx, inset, inset, W - inset, H - inset);
  ctx.lineWidth = 3;
  ctx.stroke();
  rrect(ctx, inset + 10, inset + 10, W - (inset + 10) * 2, H - (inset + 10) * 2, 22);
  ctx.strokeStyle = "rgba(244,214,123,0.22)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/* ----------------------------- Marca / lockup ------------------------------ */

export function marca(ctx: Ctx, cx: number, y: number, escala = 1, comTagline = true) {
  const r = 34 * escala;
  ctx.save();
  // monograma
  comSombra(ctx, rgba(hexRgb(PALETA.ouro), 0.55), 26 * escala, () => {
    rrect(ctx, cx - r, y - r, r * 2, r * 2, r * 0.42);
    ctx.strokeStyle = gradOuro(ctx, cx - r, y - r, cx + r, y + r);
    ctx.lineWidth = 3 * escala;
    ctx.stroke();
  });
  ctx.fillStyle = PALETA.ouroClaro;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fonte(900, 34 * escala);
  ctx.fillText("LB", cx, y + 2 * escala);
  ctx.textBaseline = "alphabetic";
  // wordmark
  ctx.fillStyle = PALETA.branco;
  ctx.font = fonte(800, 30 * escala);
  textoEspacado(ctx, "LB REPRESENTAÇÕES", cx, y + r + 40 * escala, 4 * escala);
  if (comTagline) {
    ctx.fillStyle = rgba(hexRgb(PALETA.ouro), 0.9);
    ctx.font = fonte(600, 15 * escala);
    textoEspacado(ctx, "CONSULTORIA EM CONSÓRCIOS", cx, y + r + 66 * escala, 3 * escala);
  }
  ctx.restore();
}

/* -------------------------------- Gráficos --------------------------------- */

export function donut(ctx: Ctx, cx: number, cy: number, rExt: number, rInt: number, fatias: { valor: number; cor: string }[], centro?: { titulo: string; sub: string }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0) || 1;
  let ang = -Math.PI / 2;
  const gap = 0.03;
  ctx.save();
  fatias.forEach((f) => {
    const frac = f.valor / total;
    const a2 = ang + frac * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rExt, ang + gap / 2, a2 - gap / 2);
    ctx.arc(cx, cy, rInt, a2 - gap / 2, ang + gap / 2, true);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - rExt, cy - rExt, cx + rExt, cy + rExt);
    g.addColorStop(0, aclarar(f.cor, 0.25));
    g.addColorStop(1, escurecer(f.cor, 0.12));
    comSombra(ctx, rgba(hexRgb(f.cor), 0.35), 16, () => {
      ctx.fillStyle = g;
      ctx.fill();
    });
    ang = a2;
  });
  if (centro) {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = PALETA.branco;
    ctx.font = fonte(900, rExt * 0.5);
    ctx.fillText(centro.titulo, cx, cy + rExt * 0.1);
    ctx.fillStyle = PALETA.cinza;
    ctx.font = fonte(600, rExt * 0.15);
    ctx.fillText(centro.sub, cx, cy + rExt * 0.4);
  }
  ctx.restore();
}

export function barras(ctx: Ctx, x: number, y: number, w: number, h: number, dados: { valor: number; label: string }[]) {
  if (dados.length === 0) return;
  const max = Math.max(...dados.map((d) => d.valor), 1);
  const slot = w / dados.length;
  const bw = Math.min(slot * 0.5, 78);
  ctx.save();
  ctx.textAlign = "center";
  // linha de base
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + h - 30);
  ctx.lineTo(x + w, y + h - 30);
  ctx.stroke();
  dados.forEach((d, i) => {
    const bh = Math.max(8, (d.valor / max) * (h - 70));
    const bx = x + slot * i + (slot - bw) / 2;
    const by = y + h - 30 - bh;
    const g = ctx.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, PALETA.ouroClaro);
    g.addColorStop(1, PALETA.ouroEscuro);
    comSombra(ctx, rgba(hexRgb(PALETA.ouro), 0.45), 18, () => {
      ctx.fillStyle = g;
      rrect(ctx, bx, by, bw, bh, bw * 0.3);
      ctx.fill();
    }, 0, 5);
    ctx.fillStyle = PALETA.branco;
    ctx.font = fonte(800, 24);
    ctx.fillText(String(d.valor), bx + bw / 2, by - 12);
    ctx.fillStyle = PALETA.cinza;
    ctx.font = fonte(600, 19);
    ctx.fillText(d.label, bx + bw / 2, y + h - 6);
  });
  ctx.restore();
}

/** Card de estatística (vidro) com ícone opcional, valor protagonista e rótulo. */
export function cartao(ctx: Ctx, x: number, y: number, w: number, h: number, d: { rotulo: string; valor: string; sub?: string; cor?: string; icone?: DesenhoIcone }) {
  const cor = d.cor ?? PALETA.ouro;
  ctx.save();
  comSombra(ctx, "rgba(0,0,0,0.4)", 24, () => {
    rrect(ctx, x, y, w, h, 22);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "rgba(255,255,255,0.07)");
    g.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = g;
    ctx.fill();
  }, 0, 10);
  rrect(ctx, x, y, w, h, 22);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = rgba(hexRgb(cor), 0.4);
  ctx.stroke();
  // brilho superior
  rrect(ctx, x + 1, y + 1, w - 2, h * 0.5, 20);
  const gg = ctx.createLinearGradient(x, y, x, y + h * 0.5);
  gg.addColorStop(0, "rgba(255,255,255,0.06)");
  gg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gg;
  ctx.fill();

  const pad = 26;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  // rótulo (caps, dourado) no topo
  ctx.fillStyle = rgba(hexRgb(cor), 0.95);
  ctx.font = fonte(700, 20);
  ctx.fillText(d.rotulo.toUpperCase(), x + pad, y + 46);
  // valor protagonista logo abaixo (auto-encolhe pra caber na largura do card)
  let vs = Math.min(w * 0.22, h * 0.42, 60);
  ctx.font = fonte(900, vs);
  while (ctx.measureText(d.valor).width > w - pad * 2 && vs > 20) {
    vs -= 2;
    ctx.font = fonte(900, vs);
  }
  ctx.fillStyle = PALETA.branco;
  ctx.fillText(d.valor, x + pad, y + 46 + vs);
  if (d.sub) {
    ctx.fillStyle = PALETA.cinza;
    ctx.font = fonte(500, 17);
    ctx.fillText(d.sub, x + pad, y + 46 + vs + 28);
  }
  // ícone (badge) no canto superior direito
  if (d.icone) {
    const br = Math.min(h * 0.2, 30);
    ctx.save();
    rrect(ctx, x + w - br * 2 - 20, y + 20, br * 2, br * 2, br * 0.5);
    ctx.strokeStyle = rgba(hexRgb(cor), 0.5);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    d.icone(ctx, x + w - br - 20, y + 20 + br, br * 1.1, cor);
    ctx.restore();
  }
  ctx.restore();
}

/** Pílula (chip) de rótulo com contorno dourado. */
export function pilula(ctx: Ctx, cx: number, y: number, txt: string, px = 22, altura = 46, cor = PALETA.ouro) {
  ctx.save();
  ctx.font = fonte(700, 22);
  const w = ctx.measureText(txt).width + px * 2;
  rrect(ctx, cx - w / 2, y, w, altura, altura / 2);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = rgba(hexRgb(cor), 0.5);
  ctx.stroke();
  ctx.fillStyle = PALETA.brancoSuave;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt, cx, y + altura / 2 + 1);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
  return w;
}

/** Selo "Recorde" com starburst dourado. */
export function seloRecorde(ctx: Ctx, cx: number, cy: number, r: number, texto: string) {
  ctx.save();
  ctx.rotate(0);
  const pts = 22;
  comSombra(ctx, rgba(hexRgb(PALETA.ouro), 0.6), 34, () => {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const rr = i % 2 ? r : r * 0.84;
      const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, PALETA.ouroClaro);
    g.addColorStop(1, PALETA.ouroEscuro);
    ctx.fillStyle = g;
    ctx.fill();
  });
  ctx.strokeStyle = "rgba(20,14,4,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#20180A";
  ctx.textAlign = "center";
  ctx.font = fonte(900, r * 0.34);
  ctx.fillText("RECORDE", cx, cy + r * 0.02);
  ctx.font = fonte(700, r * 0.17);
  ctx.fillText(texto, cx, cy + r * 0.32);
  ctx.restore();
}

/** Rodapé com assinatura do consultor (baseline "top", empilha para baixo). */
function rodape(ctx: Ctx, cx: number, yTop: number, d: DadosMaterial, escala = 1) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  // filete decorativo
  const fw = 120 * escala;
  ctx.strokeStyle = rgba(hexRgb(PALETA.ouro), 0.5);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - fw / 2, yTop - 18 * escala);
  ctx.lineTo(cx + fw / 2, yTop - 18 * escala);
  ctx.stroke();
  if (d.preparadoPor) {
    ctx.fillStyle = PALETA.cinza;
    ctx.font = fonte(500, 20 * escala);
    ctx.fillText("Apresentação preparada por", cx, yTop);
    ctx.fillStyle = PALETA.branco;
    ctx.font = fonte(800, 26 * escala);
    ctx.fillText(d.preparadoPor, cx, yTop + 26 * escala);
    ctx.fillStyle = rgba(hexRgb(PALETA.ouro), 0.9);
    ctx.font = fonte(600, 17 * escala);
    ctx.fillText("Consultor LB Representações", cx, yTop + 58 * escala);
  } else {
    ctx.fillStyle = rgba(hexRgb(PALETA.ouro), 0.9);
    ctx.font = fonte(700, 22 * escala);
    ctx.fillText("Fale com um consultor LB Representações", cx, yTop);
  }
  ctx.restore();
}

/* ------------------------------ Inteligência ------------------------------- */

export function templateFeed(d: DadosMaterial): TemplateFeed {
  if (d.total <= 1) return "Premium";
  if (d.total >= 5 && d.segmentos.length >= 2 && d.porMes.length >= 2) return "Executivo";
  return "Comercial";
}

export function nomeTemplate(formato: FormatoMaterial, d: DadosMaterial): string {
  if (formato === "feed") return templateFeed(d);
  if (formato === "story") return "Story";
  if (formato === "status") return "Status";
  return "Capa Executiva";
}

export function dimensoes(formato: FormatoMaterial): { W: number; H: number } {
  if (formato === "feed") return { W: 1080, H: 1080 };
  if (formato === "pdf-capa") return { W: 1240, H: 1754 };
  return { W: 1080, H: 1920 };
}

function segFatias(d: DadosMaterial) {
  return d.segmentos.slice(0, 6).map((s) => {
    const seg = resolverSegmento(s.nome);
    return { valor: s.qtd, cor: seg.cor, seg, nome: s.nome };
  });
}

/* ------------------- Blocos de fluxo vertical (retornam y) ------------------ */
// Todos desenham a partir de yTop (baseline "top") e devolvem o y final, para
// empilhar sem colisões independentemente do nº de linhas do texto.

function blocoEyebrow(ctx: Ctx, cx: number, yTop: number, txt: string, px = 26) {
  ctx.textBaseline = "top";
  ctx.fillStyle = rgba(hexRgb(PALETA.ouro), 0.95);
  ctx.font = fonte(700, px);
  textoEspacado(ctx, txt, cx, yTop, px * 0.2);
  return yTop + px + 8;
}

function blocoTitulo(ctx: Ctx, cx: number, yTop: number, txt: string, size: number, maxW: number) {
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillStyle = PALETA.branco;
  ctx.font = fonte(900, size);
  const linhas = wrap(ctx, txt, maxW);
  const lh = size * 1.04;
  linhas.forEach((l, i) => ctx.fillText(l, cx, yTop + i * lh));
  return yTop + linhas.length * lh;
}

function blocoFaixaRecorde(ctx: Ctx, xRef: number, yTop: number, texto: string, ancora: "centro" | "dir" = "centro", escala = 1) {
  const label = `RECORDE  ·  ${texto.toUpperCase()}`;
  const px = 26 * escala;
  ctx.font = fonte(800, px);
  const w = ctx.measureText(label).width + 120 * escala, h = 60 * escala;
  const cx = ancora === "dir" ? xRef - w / 2 : xRef;
  comSombra(ctx, rgba(hexRgb(PALETA.ouro), 0.55), 26, () => {
    rrect(ctx, cx - w / 2, yTop, w, h, h / 2);
    ctx.fillStyle = gradOuro(ctx, cx - w / 2, yTop, cx + w / 2, yTop + h);
    ctx.fill();
  });
  ctx.fillStyle = "#20180A";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fonte(800, px);
  ctx.fillText(label, cx, yTop + h / 2 + 1);
  ctx.textBaseline = "top";
  return yTop + h;
}

function blocoNumero(ctx: Ctx, cx: number, yTop: number, txt: string, size: number, cor = PALETA.ouroClaro) {
  textoGlow(ctx, txt, cx, yTop, fonte(900, size), cor, rgba(hexRgb(PALETA.ouro), 0.6), size * 0.16, "center", "top");
  return yTop + size * 0.82;
}

function blocoLinha(ctx: Ctx, cx: number, yTop: number, txt: string, size: number, cor = PALETA.branco, peso = 800) {
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillStyle = cor;
  ctx.font = fonte(peso, size);
  ctx.fillText(txt, cx, yTop);
  return yTop + size * 1.15;
}

/* -------------------------------- Templates -------------------------------- */

function feedPremium(ctx: Ctx, d: DadosMaterial) {
  const W = 1080, H = 1080;
  fundo(ctx, W, H, { mapaCentro: true });
  moldura(ctx, W, H);
  marca(ctx, W / 2, 120, 0.9);
  let y = 258;
  y = blocoEyebrow(ctx, W / 2, y, "RESULTADO OFICIAL · SERGIPE", 24) + 10;
  if (d.recorde) y = blocoFaixaRecorde(ctx, W / 2, y, d.recorde) + 18;
  y = blocoNumero(ctx, W / 2, y, String(d.total), 356) + 2;
  y = blocoLinha(ctx, W / 2, y, d.total === 1 ? "contemplação em Sergipe" : "contemplações em Sergipe", 42) + 12;

  const un = d.destaqueUnico;
  if (un) {
    const seg = resolverSegmento(d.segmentos[0]?.nome ?? "outro");
    badgeSegmento(ctx, W / 2, y + 54, 52, seg);
    ctx.fillStyle = PALETA.brancoSuave;
    ctx.font = fonte(700, 30);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`Grupo ${un.grupo} · Cota ${un.cota} · ${un.tipo}`, W / 2, y + 116);
  } else if (d.credito > 0) {
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = PALETA.cinza;
    ctx.font = fonte(600, 26);
    ctx.fillText("crédito estimado liberado", W / 2, y + 4);
    blocoNumero(ctx, W / 2, y + 38, creditoCurto(d.credito), 86, PALETA.branco);
  }
  rodape(ctx, W / 2, 968, d, 0.85);
}

function feedExecutivo(ctx: Ctx, d: DadosMaterial) {
  const W = 1080, H = 1080;
  fundo(ctx, W, H, {});
  moldura(ctx, W, H);
  // cabeçalho
  marca(ctx, 176, 100, 0.6, false);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  ctx.fillStyle = PALETA.branco;
  ctx.font = fonte(800, 30);
  ctx.fillText("RESULTADOS OFICIAIS", W - 70, 88);
  ctx.fillStyle = rgba(hexRgb(PALETA.ouro), 0.9);
  ctx.font = fonte(600, 20);
  ctx.fillText(`Sergipe · ${d.periodo}`, W - 70, 118);
  if (d.recorde) blocoFaixaRecorde(ctx, W - 70, 138, d.recorde, "dir", 0.78);

  // KPIs
  const cy = 200, ch = 188, cw = 300, gap = 24, x0 = 70;
  cartao(ctx, x0, cy, cw, ch, { rotulo: "Contemplações", valor: String(d.total), sub: `${d.sorteios} sorteios · ${d.lances} lances`, cor: PALETA.ouro });
  cartao(ctx, x0 + (cw + gap), cy, cw, ch, { rotulo: "Crédito estimado", valor: creditoCurto(d.credito), sub: "com base nos lances", cor: PALETA.azulLuz });
  cartao(ctx, x0 + (cw + gap) * 2, cy, cw, ch, { rotulo: "Segmentos", valor: String(d.segmentos.length), sub: "tipos de bem", cor: PALETA.ouroClaro });

  // donut de segmentos (esquerda) + legenda (direita)
  const fat = segFatias(d);
  donut(ctx, 290, 640, 148, 92, fat, { titulo: String(d.total), sub: "contempl." });
  ctx.textBaseline = "alphabetic";
  let ly = 548;
  fat.forEach((f) => {
    ctx.fillStyle = f.cor;
    rrect(ctx, 500, ly - 16, 22, 22, 6);
    ctx.fill();
    ctx.fillStyle = PALETA.brancoSuave;
    ctx.font = fonte(700, 24);
    ctx.textAlign = "left";
    ctx.fillText(f.seg.label, 534, ly + 2);
    ctx.fillStyle = PALETA.ouroClaro;
    ctx.font = fonte(800, 24);
    ctx.textAlign = "right";
    ctx.fillText(String(f.valor), 1010, ly + 2);
    ly += 44;
  });

  // barras por mês (base)
  if (d.porMes.length >= 2) {
    ctx.fillStyle = PALETA.branco;
    ctx.font = fonte(700, 24);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Evolução mensal", 70, 838);
    barras(ctx, 70, 852, W - 140, 150, d.porMes.slice(-6).map((m) => ({ valor: m.qtd, label: m.label })));
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = PALETA.cinza;
  ctx.font = fonte(500, 18);
  ctx.fillText(d.preparadoPor ? `Preparado por ${d.preparadoPor} · Consultor LB Representações` : "LB Representações · dados oficiais da administradora", W / 2, 1024);
}

function feedComercial(ctx: Ctx, d: DadosMaterial) {
  const W = 1080, H = 1080;
  fundo(ctx, W, H, {});
  moldura(ctx, W, H);
  marca(ctx, W / 2, 110, 0.7);
  let y = 244;
  y = blocoTitulo(ctx, W / 2, y, "CONSÓRCIO CONTEMPLA EM SERGIPE", 56, 900) + 16;
  if (d.recorde) y = blocoFaixaRecorde(ctx, W / 2, y, d.recorde) + 14;

  const cy = y + 6;
  cartao(ctx, 70, cy, 450, 210, { rotulo: "Contemplações", valor: String(d.total), sub: `${d.sorteios} sorteios · ${d.lances} lances`, cor: PALETA.ouro });
  cartao(ctx, 560, cy, 450, 210, { rotulo: "Crédito estimado", valor: creditoCurto(d.credito), sub: "liberado no período", cor: PALETA.azulLuz });

  // chips de segmentos com ícone
  const segs = d.segmentos.slice(0, 5);
  const cw = 176, gap = 16, largura = segs.length * cw + (segs.length - 1) * gap;
  let sx = W / 2 - largura / 2;
  const sy = cy + 300;
  segs.forEach((s) => {
    const seg = resolverSegmento(s.nome);
    badgeSegmento(ctx, sx + cw / 2, sy, 42, seg);
    ctx.fillStyle = PALETA.brancoSuave;
    ctx.font = fonte(700, 22);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(seg.label, sx + cw / 2, sy + 60);
    ctx.fillStyle = PALETA.ouroClaro;
    ctx.font = fonte(800, 30);
    ctx.fillText(String(s.qtd), sx + cw / 2, sy + 86);
    sx += cw + gap;
  });

  rodape(ctx, W / 2, 968, d, 0.82);
}

function story(ctx: Ctx, d: DadosMaterial) {
  const W = 1080, H = 1920;
  fundo(ctx, W, H, {});
  moldura(ctx, W, H, 40);
  marca(ctx, W / 2, 195, 1.05);
  let y = 350;
  y = blocoEyebrow(ctx, W / 2, y, "RESULTADO OFICIAL · SERGIPE", 30) + 6;
  y = blocoTitulo(ctx, W / 2, y, "CONSÓRCIO CONTEMPLA EM SERGIPE", 62, 900) + 16;
  if (d.recorde) y = blocoFaixaRecorde(ctx, W / 2, y, d.recorde) + 18;
  y = blocoNumero(ctx, W / 2, y, String(d.total), 400) + 2;
  y = blocoLinha(ctx, W / 2, y, "contemplações em Sergipe", 50) + 22;

  cartao(ctx, 130, y, W - 260, 190, { rotulo: "Crédito estimado liberado", valor: creditoCurto(d.credito), sub: `${d.sorteios} por sorteio · ${d.lances} por lance`, cor: PALETA.azulLuz });
  y += 190 + 46;

  const segs = d.segmentos.slice(0, 4);
  const cw = 200, gap = 24, largura = segs.length * cw + (segs.length - 1) * gap;
  let sx = W / 2 - largura / 2;
  segs.forEach((s) => {
    const seg = resolverSegmento(s.nome);
    badgeSegmento(ctx, sx + cw / 2, y + 56, 56, seg);
    ctx.fillStyle = PALETA.brancoSuave;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = fonte(700, 24);
    ctx.fillText(seg.label, sx + cw / 2, y + 126);
    ctx.fillStyle = PALETA.ouroClaro;
    ctx.font = fonte(800, 34);
    ctx.fillText(String(s.qtd), sx + cw / 2, y + 154);
    sx += cw + gap;
  });

  rodape(ctx, W / 2, 1748, d, 1.05);
}

function status(ctx: Ctx, d: DadosMaterial) {
  const W = 1080, H = 1920;
  fundo(ctx, W, H, {});
  moldura(ctx, W, H, 40);
  marca(ctx, W / 2, 205, 1.05);
  let y = 380;
  y = blocoTitulo(ctx, W / 2, y, "O CONSÓRCIO CONTEMPLA EM SERGIPE", 72, 920) + 18;
  if (d.recorde) y = blocoFaixaRecorde(ctx, W / 2, y, d.recorde) + 16;
  y = blocoNumero(ctx, W / 2, y, String(d.total), 380) + 2;
  y = blocoLinha(ctx, W / 2, y, "contemplações oficiais", 50) + 34;

  const cw = 300, gap = 20, x0 = W / 2 - (cw * 1.5 + gap);
  const cards = [
    { rotulo: "Crédito estimado", valor: creditoCurto(d.credito), cor: PALETA.azulLuz },
    { rotulo: "Por sorteio", valor: String(d.sorteios), cor: PALETA.ouro },
    { rotulo: "Por lance", valor: String(d.lances), cor: PALETA.ouroClaro },
  ];
  cards.forEach((it, i) => cartao(ctx, x0 + i * (cw + gap), y, cw, 190, it));
  y += 190 + 76;

  y = blocoLinha(ctx, W / 2, y, "Fale agora com a LB", 58, PALETA.ouroClaro, 900) + 6;
  blocoLinha(ctx, W / 2, y, "e realize a sua carta contemplada", 34, PALETA.brancoSuave, 600);

  rodape(ctx, W / 2, 1748, d, 1.0);
}

function capaPdf(ctx: Ctx, d: DadosMaterial) {
  const W = 1240, H = 1754;
  fundo(ctx, W, H, { mapaCentro: true });
  moldura(ctx, W, H, 46);
  marca(ctx, W / 2, 240, 1.15);
  let y = 428;
  y = blocoEyebrow(ctx, W / 2, y, "RELATÓRIO OFICIAL DE CONTEMPLAÇÕES", 26) + 8;
  y = blocoTitulo(ctx, W / 2, y, "RESULTADOS EM SERGIPE", 72, 1060) + 6;
  y = blocoLinha(ctx, W / 2, y, d.periodo, 30, PALETA.cinza, 600) + 20;
  if (d.recorde) y = blocoFaixaRecorde(ctx, W / 2, y, d.recorde) + 20;
  y = blocoNumero(ctx, W / 2, y, String(d.total), 300) + 2;
  y = blocoLinha(ctx, W / 2, y, "contemplações oficiais em Sergipe", 44) + 26;

  cartao(ctx, W / 2 - 470, y, 450, 176, { rotulo: "Crédito estimado", valor: creditoCurto(d.credito), sub: "com base nos lances", cor: PALETA.azulLuz });
  cartao(ctx, W / 2 + 20, y, 450, 176, { rotulo: "Segmentos", valor: String(d.segmentos.length), sub: "tipos de bem", cor: PALETA.ouroClaro });
  y += 176 + 40;

  const segs = d.segmentos.slice(0, 5);
  ctx.font = fonte(700, 24);
  const larguras = segs.map((s) => {
    const seg = resolverSegmento(s.nome);
    return ctx.measureText(`${seg.label}  ${s.qtd}`).width + 70;
  });
  const largura = larguras.reduce((a, b) => a + b, 0) + (segs.length - 1) * 16;
  let sx = W / 2 - largura / 2;
  segs.forEach((s, i) => {
    const seg = resolverSegmento(s.nome);
    pilula(ctx, sx + larguras[i] / 2, y, `${seg.label}  ${s.qtd}`, 30, 54, seg.cor);
    sx += larguras[i] + 16;
  });

  rodape(ctx, W / 2, 1616, d, 1.1);
}

/* -------------------------------- Dispatch --------------------------------- */

export function renderMaterial(ctx: Ctx, formato: FormatoMaterial, d: DadosMaterial, template?: TemplateFeed) {
  if (formato === "feed") {
    const t = template ?? templateFeed(d);
    if (t === "Premium") return feedPremium(ctx, d);
    if (t === "Executivo") return feedExecutivo(ctx, d);
    return feedComercial(ctx, d);
  }
  if (formato === "story") return story(ctx, d);
  if (formato === "status") return status(ctx, d);
  return capaPdf(ctx, d);
}
