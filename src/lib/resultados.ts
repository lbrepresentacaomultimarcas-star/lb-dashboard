"use client";

// Módulo "Resultados LB" — contemplações OFICIAIS da administradora em Sergipe.
// Camada própria (não toca no store global): leitura/gravação na tabela
// resultados_contemplacoes e agregações do dashboard. O parser do PDF oficial
// fica em ./resultados-parser (puro) e a geração de materiais em ./materiais.

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
  /** Igual aos demais reloads do store: devolve {data, error} pra quem chama
   *  decidir. NUNCA mais engole o erro silenciosamente (era o que zerava o
   *  módulo num hiccup de rede/auth enquanto vendas/leads se preservavam). */
  async listarSafe(): Promise<{ data: Contemplacao[]; error: string | null }> {
    if (!supabaseEnabled) return { data: [], error: null };
    const { data, error } = await supabaseBrowser()
      .from("resultados_contemplacoes")
      .select("*")
      .order("mes_ref", { ascending: false })
      .limit(20000);
    if (error) {
      console.error("[resultados] falha ao ler resultados_contemplacoes:", error);
      return { data: [], error: error.message };
    }
    return { data: ((data ?? []) as Row[]).map(fromDb), error: null };
  },

  async listar(): Promise<Contemplacao[]> {
    return (await this.listarSafe()).data;
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

/** Filtro pelo PERÍODO GLOBAL (mesmo seletor do Dashboard): compara a data
 *  da contemplação; registros sem data caem no mês de referência. */
export function filtrarPorIntervalo(itens: Contemplacao[], from: Date, to: Date): Contemplacao[] {
  const f = from.getTime();
  const t = to.getTime();
  const chaveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const mesDe = chaveMes(from);
  const mesAte = chaveMes(to);
  return itens.filter((i) => {
    if (i.dataContemplacao) {
      // Meio-dia local: evita a borda de fuso ao converter "YYYY-MM-DD".
      const d = new Date(`${i.dataContemplacao.slice(0, 10)}T12:00:00`).getTime();
      return d >= f && d <= t;
    }
    return i.mesRef >= mesDe && i.mesRef <= mesAte;
  });
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
