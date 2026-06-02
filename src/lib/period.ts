import { monthLabel } from "./utils";

/**
 * Presets de período disponíveis no filtro global.
 *
 * Inclui "personalizado" pra permitir intervalo livre via date inputs.
 */
export type PeriodPreset =
  | "hoje"
  | "semana"
  | "mes-atual"
  | "mes-anterior"
  | "ultimos-3-meses"
  | "ano-atual"
  | "personalizado";

/**
 * Período resolvido (já com datas concretas).
 *
 * `from` é sempre 00:00:00.000 e `to` é 23:59:59.999 no horário local —
 * isso garante que vendas registradas em qualquer hora do dia entrem no filtro.
 */
export type Period = {
  from: Date;
  to: Date;
  preset: PeriodPreset;
};

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "hoje": "Hoje",
  "semana": "Esta semana",
  "mes-atual": "Mês atual",
  "mes-anterior": "Mês anterior",
  "ultimos-3-meses": "Últimos 3 meses",
  "ano-atual": "Ano atual",
  "personalizado": "Personalizado",
};

/** Ordem na UI do dropdown. */
export const PRESET_ORDER: PeriodPreset[] = [
  "hoje",
  "semana",
  "mes-atual",
  "mes-anterior",
  "ultimos-3-meses",
  "ano-atual",
  "personalizado",
];

// ============================================================
// Helpers internos de data
// ============================================================
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Início da semana (segunda-feira no padrão BR). */
function startOfWeekBR(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=dom .. 6=sab
  // se hoje é domingo, volta 6 dias; senão, volta até segunda
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

/** Dias do mês contendo `monthZeroBased` em `year` (28..31). */
function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate();
}

// ============================================================
// Construção de período a partir de preset
// ============================================================
/**
 * Resolve um preset em datas concretas.
 *
 * `now` é injectable pra teste; em produção sempre `new Date()`.
 */
export function periodFromPreset(preset: PeriodPreset, now: Date = new Date()): Period {
  switch (preset) {
    case "hoje":
      return { preset, from: startOfDay(now), to: endOfDay(now) };

    case "semana":
      return { preset, from: startOfWeekBR(now), to: endOfDay(now) };

    case "mes-atual": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { preset, from: startOfDay(from), to: endOfDay(to) };
    }

    case "mes-anterior": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { preset, from: startOfDay(from), to: endOfDay(to) };
    }

    case "ultimos-3-meses": {
      // 3 meses encerrando hoje: início = 1º dia do mês (atual - 2)
      const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { preset, from: startOfDay(from), to: endOfDay(now) };
    }

    case "ano-atual": {
      const from = new Date(now.getFullYear(), 0, 1);
      return { preset, from: startOfDay(from), to: endOfDay(now) };
    }

    case "personalizado":
    default: {
      // default razoável quando entra em personalizado sem datas escolhidas:
      // últimos 30 dias até hoje
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { preset: "personalizado", from: startOfDay(from), to: endOfDay(now) };
    }
  }
}

/**
 * Constrói um período "personalizado" a partir de duas strings YYYY-MM-DD
 * vindas de `<input type="date">`. Aceita `to` no mesmo dia ou depois.
 */
export function periodFromCustomDates(fromISO: string, toISO: string): Period {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);
  return {
    preset: "personalizado",
    from: startOfDay(from),
    to: endOfDay(to),
  };
}

// ============================================================
// Inspeção de período
// ============================================================
/**
 * Se o período coincide exatamente com um mês fechado (dia 1 até último dia),
 * retorna a chave "YYYY-MM" — útil pra reaproveitar a RPC `ranking_mensal`
 * do Supabase, que é por mês.
 *
 * Caso contrário retorna `null` (cai no cálculo local).
 */
export function periodAsMonth(p: Period): string | null {
  const f = p.from;
  const t = p.to;
  const sameYearMonth =
    f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth();
  if (!sameYearMonth) return null;
  if (f.getDate() !== 1) return null;
  const lastDay = daysInMonth(f.getFullYear(), f.getMonth());
  if (t.getDate() !== lastDay) return null;
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`;
}

/** Rótulo amigável de um período, pra mostrar no header. */
export function formatPeriodLabel(p: Period): string {
  // mês fechado → "novembro de 2025"
  const m = periodAsMonth(p);
  if (m) return monthLabel(m);

  // mesmo dia → "15 de novembro de 2025"
  if (p.from.toDateString() === p.to.toDateString()) {
    return p.from.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  // intervalo → "15 nov – 22 nov 2025"
  const fmt = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const year =
    p.from.getFullYear() === p.to.getFullYear()
      ? p.to.getFullYear()
      : `${p.from.getFullYear()}–${p.to.getFullYear()}`;
  return `${fmt(p.from)} – ${fmt(p.to)} ${year}`;
}

/** Converte uma Date pra "YYYY-MM-DD" pra usar em <input type="date">. */
export function dateToInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============================================================
// Cobertura mensal — fundamental pro rateio proporcional de meta
// ============================================================
export type MonthCoverage = {
  /** chave "YYYY-MM" pra cruzar com a tabela `metas`. */
  key: string;
  year: number;
  /** mês 0-11 (compatível com Date). */
  month: number;
  /** dias do período que caem dentro deste mês (inclusivo). */
  daysCovered: number;
  /** dias totais do mês (28..31). */
  daysInMonth: number;
  /** daysCovered / daysInMonth → fator pra multiplicar a meta mensal. */
  fraction: number;
};

/**
 * Para cada mês tocado pelo período, calcula quantos dias caem dentro
 * e qual fração isso representa do mês inteiro.
 *
 * Exemplo: período 15/out a 10/dez gera:
 *   [
 *     { key: "YYYY-10", daysCovered: 17, daysInMonth: 31, fraction: 17/31 },
 *     { key: "YYYY-11", daysCovered: 30, daysInMonth: 30, fraction: 1.0  },
 *     { key: "YYYY-12", daysCovered: 10, daysInMonth: 31, fraction: 10/31 },
 *   ]
 *
 * Soma das frações = quantos "meses equivalentes" o período representa
 * — base do rateio proporcional de meta.
 */
export function monthCoverage(p: Period): MonthCoverage[] {
  const result: MonthCoverage[] = [];
  const cur = new Date(p.from.getFullYear(), p.from.getMonth(), 1);
  const lastBucket = new Date(p.to.getFullYear(), p.to.getMonth(), 1);

  while (cur.getTime() <= lastBucket.getTime()) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const dim = daysInMonth(y, m);

    const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m, dim, 23, 59, 59, 999);

    const rangeStart = p.from.getTime() > monthStart.getTime() ? p.from : monthStart;
    const rangeEnd = p.to.getTime() < monthEnd.getTime() ? p.to : monthEnd;

    // diferença em ms convertida pra dias e arredondada
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.max(
      1,
      Math.round((rangeEnd.getTime() - rangeStart.getTime() + 1) / msPerDay),
    );

    result.push({
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
      year: y,
      month: m,
      daysCovered: days,
      daysInMonth: dim,
      fraction: days / dim,
    });

    cur.setMonth(cur.getMonth() + 1);
  }

  return result;
}
