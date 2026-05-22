import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const pct = (n: number) =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export const monthKey = (d: Date | string) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
};

export const todayMonth = () => monthKey(new Date());

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Converte string pra número no formato brasileiro. Robusto:
 * - "171187"        → 171187
 * - "171.187"       → 171187      (ponto = milhar quando 3 dígitos depois)
 * - "171.187,50"    → 171187.5    (vírgula = decimal)
 * - "2.500.000"     → 2500000     (vários pontos = milhar)
 * - "2.500.000,75"  → 2500000.75
 * - "2,5"           → 2.5         (comissão)
 * - "2.5"           → 2.5         (ponto único c/ 1-2 dígitos = decimal)
 * - "R$ 50.000,00"  → 50000
 * Retorna 0 se não conseguir.
 */
export function parseNumBR(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  let s = String(raw).trim().replace(/[R$\s%]/gi, "");
  if (s === "") return 0;

  if (s.includes(",")) {
    // vírgula = decimal; pontos = milhar
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) {
      // vários pontos = separadores de milhar
      s = s.replace(/\./g, "");
    } else if (dots === 1) {
      const depois = s.split(".")[1] ?? "";
      // 3 dígitos depois do ponto único = milhar (BR): 171.187 → 171187
      // 1-2 dígitos = decimal: 2.5 → 2.5
      if (depois.length === 3) s = s.replace(/\./g, "");
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Formata número pro padrão BR pra exibir no input (sem símbolo R$). */
export function formatNumBR(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
