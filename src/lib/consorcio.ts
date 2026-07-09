"use client";

// Módulo Consórcio — camada de dados e cálculo PRÓPRIA (não toca no store
// global). Tabelas: consorcio_grupos / consorcio_creditos /
// consorcio_assembleias / consorcio_config (ver supabase/migration-consorcio.sql).

import { supabaseBrowser, supabaseEnabled } from "./supabase/client";

/* ----------------------------------- Tipos ---------------------------------- */

export type ConsorcioSegmento = "IMV" | "AUT" | "MOT" | "CAM" | "SRV";

export const SEGMENTO_INFO: Record<ConsorcioSegmento, { label: string; emoji: string }> = {
  IMV: { label: "Imóvel", emoji: "🏠" },
  AUT: { label: "Automóvel", emoji: "🚗" },
  MOT: { label: "Moto", emoji: "🏍️" },
  CAM: { label: "Caminhão", emoji: "🚚" },
  SRV: { label: "Serviço", emoji: "🛠️" },
};

export type ConsorcioGrupo = {
  id: string;
  grupo: string;
  segmento: ConsorcioSegmento | null;
  situacao: "liberado" | "bloqueado";
  pdfUrl: string | null;
  prazoTotal: number | null;
  taxaAdm: number | null;
  antecipacaoTx: number | null;
  taxaFr: number | null;
  taxaSeguro: number | null;
  planoLight: boolean | null;
  pctEmbutido: number | null;
  baseEmbutido: "credito" | "lance" | null;
  atualizadoEm: string;
};

export type ConsorcioCredito = {
  id: string;
  grupo: string;
  segmento: ConsorcioSegmento | null;
  codBem: string;
  valor: number;
  prazoTotal: number | null;
  taxaAdm: number | null;
  antecipacaoTx: number | null;
  taxaFr: number | null;
  taxaSeguro: number | null;
  planoLight: boolean | null;
  pctEmbutido: number | null;
  baseEmbutido: "credito" | "lance" | null;
  atualizadoEm: string;
};

export type ConsorcioAssembleia = {
  id: string;
  grupo: string;
  data: string; // "YYYY-MM-DD"
  numero: number | null;
  contempladosFixo: number;
  contempladosLivre: number;
  menorLanceLivrePct: number | null;
  observacao: string | null;
};

export type ConsorcioConfig = {
  faixaAlta: number; // lance >= X% → 🟢
  faixaMedia: number; // lance >= X% → 🟡 (abaixo → 🔴)
};

export const CONFIG_PADRAO: ConsorcioConfig = { faixaAlta: 40, faixaMedia: 25 };

/* -------------------------------- Simulador --------------------------------- */

export type Classificacao = "alta" | "media" | "baixa";

export const CLASSIFICACAO_INFO: Record<
  Classificacao,
  { label: string; emoji: string; tone: "success" | "warn" | "danger" }
> = {
  alta: { label: "Chance alta", emoji: "🟢", tone: "success" },
  media: { label: "Chance média", emoji: "🟡", tone: "warn" },
  baixa: { label: "Chance baixa", emoji: "🔴", tone: "danger" },
};

export type SimulacaoInput = {
  valorCarta: number;
  valorLance: number;
  usarEmbutido: boolean;
  /** % máximo de embutido permitido no grupo (regra Multimarcas: até 30% do crédito). */
  pctEmbutidoGrupo: number;
  config: ConsorcioConfig;
  /** Resultados registrados do grupo (opcional — refina a estimativa). */
  historico?: ConsorcioAssembleia[];
};

export type SimulacaoResultado = {
  pctLance: number;
  classificacao: Classificacao;
  /** Valor embutido usado (0 se não usar). */
  valorEmbutido: number;
  /** Recurso próprio necessário (lance − embutido). */
  recursoProprio: number;
  /** Crédito líquido que o cliente recebe se embutir. */
  creditoLiquido: number;
  /** Mediana do menor lance livre contemplado no histórico (se houver). */
  medianaHistorico: number | null;
  totalAssembleiasHistorico: number;
  explicacao: string[];
};

function mediana(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Cálculo puro da simulação de contemplação (sem efeitos; fácil de testar).
 *  IMPORTANTE: é sempre uma ESTIMATIVA — a contemplação depende da assembleia
 *  e nunca é garantida. A UI reforça esse aviso. */
export function simularContemplacao(input: SimulacaoInput): SimulacaoResultado {
  const carta = Math.max(0, input.valorCarta);
  const lance = Math.max(0, Math.min(input.valorLance, carta));
  const pctLance = carta > 0 ? (lance / carta) * 100 : 0;

  const pctEmbutidoMax = Math.max(0, input.pctEmbutidoGrupo);
  const embutidoMax = (carta * pctEmbutidoMax) / 100;
  const valorEmbutido = input.usarEmbutido ? Math.min(lance, embutidoMax) : 0;
  const recursoProprio = Math.max(0, lance - valorEmbutido);
  const creditoLiquido = carta - valorEmbutido;

  const hist = (input.historico ?? [])
    .map((a) => a.menorLanceLivrePct)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const med = mediana(hist);

  // Classificação: faixas configuradas; com histórico, a comparação com a
  // mediana dos lances contemplados prevalece (dados reais > regra genérica).
  let classificacao: Classificacao;
  if (med !== null) {
    if (pctLance >= med + 3) classificacao = "alta";
    else if (pctLance >= med - 3) classificacao = "media";
    else classificacao = "baixa";
  } else {
    if (pctLance >= input.config.faixaAlta) classificacao = "alta";
    else if (pctLance >= input.config.faixaMedia) classificacao = "media";
    else classificacao = "baixa";
  }

  const explicacao: string[] = [];
  explicacao.push(
    `O lance de ${formatBRL(lance)} representa ${pctLance.toFixed(1)}% do crédito de ${formatBRL(carta)}.`,
  );
  if (med !== null) {
    explicacao.push(
      `Nas ${hist.length} assembleias registradas deste grupo, o menor lance livre contemplado ficou em torno de ${med.toFixed(1)}% (mediana). ` +
        (pctLance >= med
          ? "Seu lance está igual ou acima dessa referência."
          : "Seu lance está abaixo dessa referência."),
    );
  } else {
    explicacao.push(
      `Sem resultados de assembleias registrados para este grupo, a classificação usa as faixas configuradas ` +
        `(alta ≥ ${input.config.faixaAlta}% · média ≥ ${input.config.faixaMedia}%).`,
    );
  }
  if (input.usarEmbutido && valorEmbutido > 0) {
    explicacao.push(
      `Com lance embutido de ${formatBRL(valorEmbutido)} (limite do grupo: ${pctEmbutidoMax}% do crédito), ` +
        `o recurso próprio necessário é ${formatBRL(recursoProprio)} e o crédito líquido passa a ${formatBRL(creditoLiquido)}.`,
    );
  }
  explicacao.push(
    "Estimativa para apoiar a negociação: a contemplação depende do resultado da assembleia e NUNCA é garantida.",
  );

  return {
    pctLance,
    classificacao,
    valorEmbutido,
    recursoProprio,
    creditoLiquido,
    medianaHistorico: med,
    totalAssembleiasHistorico: hist.length,
    explicacao,
  };
}

export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ------------------------------ Dados (Supabase) ----------------------------- */

type Row = Record<string, unknown>;
const s = (r: Row, k: string) => (r[k] == null ? null : String(r[k]));
const n = (r: Row, k: string) => (r[k] == null ? null : Number(r[k]));

function grupoFromDb(r: Row): ConsorcioGrupo {
  return {
    id: String(r.id),
    grupo: String(r.grupo),
    segmento: (s(r, "segmento") as ConsorcioSegmento) ?? null,
    situacao: (s(r, "situacao") as "liberado" | "bloqueado") ?? "liberado",
    pdfUrl: s(r, "pdf_url"),
    prazoTotal: n(r, "prazo_total"),
    taxaAdm: n(r, "taxa_adm"),
    antecipacaoTx: n(r, "antecipacao_tx"),
    taxaFr: n(r, "taxa_fr"),
    taxaSeguro: n(r, "taxa_seguro"),
    planoLight: r.plano_light == null ? null : Boolean(r.plano_light),
    pctEmbutido: n(r, "pct_embutido"),
    baseEmbutido: (s(r, "base_embutido") as "credito" | "lance") ?? null,
    atualizadoEm: String(r.atualizado_em ?? ""),
  };
}

function creditoFromDb(r: Row): ConsorcioCredito {
  return {
    id: String(r.id),
    grupo: String(r.grupo),
    segmento: (s(r, "segmento") as ConsorcioSegmento) ?? null,
    codBem: String(r.cod_bem),
    valor: Number(r.valor ?? 0),
    prazoTotal: n(r, "prazo_total"),
    taxaAdm: n(r, "taxa_adm"),
    antecipacaoTx: n(r, "antecipacao_tx"),
    taxaFr: n(r, "taxa_fr"),
    taxaSeguro: n(r, "taxa_seguro"),
    planoLight: r.plano_light == null ? null : Boolean(r.plano_light),
    pctEmbutido: n(r, "pct_embutido"),
    baseEmbutido: (s(r, "base_embutido") as "credito" | "lance") ?? null,
    atualizadoEm: String(r.atualizado_em ?? ""),
  };
}

function assembleiaFromDb(r: Row): ConsorcioAssembleia {
  return {
    id: String(r.id),
    grupo: String(r.grupo),
    data: String(r.data),
    numero: n(r, "numero"),
    contempladosFixo: Number(r.contemplados_fixo ?? 0),
    contempladosLivre: Number(r.contemplados_livre ?? 0),
    menorLanceLivrePct: n(r, "menor_lance_livre_pct"),
    observacao: s(r, "observacao"),
  };
}

export const consorcioApi = {
  async listarGrupos(): Promise<ConsorcioGrupo[]> {
    if (!supabaseEnabled) return [];
    const { data } = await supabaseBrowser()
      .from("consorcio_grupos")
      .select("*")
      .order("grupo");
    return ((data ?? []) as Row[]).map(grupoFromDb);
  },

  async listarCreditos(): Promise<ConsorcioCredito[]> {
    if (!supabaseEnabled) return [];
    const { data } = await supabaseBrowser()
      .from("consorcio_creditos")
      .select("*")
      .order("valor");
    return ((data ?? []) as Row[]).map(creditoFromDb);
  },

  async listarAssembleias(): Promise<ConsorcioAssembleia[]> {
    if (!supabaseEnabled) return [];
    const { data } = await supabaseBrowser()
      .from("consorcio_assembleias")
      .select("*")
      .order("data", { ascending: false });
    return ((data ?? []) as Row[]).map(assembleiaFromDb);
  },

  async salvarAssembleia(a: Omit<ConsorcioAssembleia, "id">): Promise<string | null> {
    if (!supabaseEnabled) return "Supabase não configurado.";
    const { error } = await supabaseBrowser().from("consorcio_assembleias").upsert(
      {
        grupo: a.grupo,
        data: a.data,
        numero: a.numero,
        contemplados_fixo: a.contempladosFixo,
        contemplados_livre: a.contempladosLivre,
        menor_lance_livre_pct: a.menorLanceLivrePct,
        observacao: a.observacao,
      },
      { onConflict: "org_id,grupo,data" },
    );
    return error ? error.message : null;
  },

  async excluirAssembleia(id: string): Promise<string | null> {
    if (!supabaseEnabled) return "Supabase não configurado.";
    const { error } = await supabaseBrowser().from("consorcio_assembleias").delete().eq("id", id);
    return error ? error.message : null;
  },

  async obterConfig(): Promise<ConsorcioConfig> {
    if (!supabaseEnabled) return CONFIG_PADRAO;
    const { data } = await supabaseBrowser().from("consorcio_config").select("*").maybeSingle();
    if (!data) return CONFIG_PADRAO;
    return {
      faixaAlta: Number((data as Row).faixa_alta ?? CONFIG_PADRAO.faixaAlta),
      faixaMedia: Number((data as Row).faixa_media ?? CONFIG_PADRAO.faixaMedia),
    };
  },

  async salvarConfig(cfg: ConsorcioConfig): Promise<string | null> {
    if (!supabaseEnabled) return "Supabase não configurado.";
    const { error } = await supabaseBrowser()
      .from("consorcio_config")
      .upsert({ faixa_alta: cfg.faixaAlta, faixa_media: cfg.faixaMedia, atualizado_em: new Date().toISOString() }, { onConflict: "org_id" });
    return error ? error.message : null;
  },

  /** Sincroniza grupos/créditos a partir do Drive/planilha (rota admin). */
  async sincronizar(): Promise<{ ok: boolean; erro?: string; grupos?: number; creditos?: number }> {
    const r = await fetch("/api/consorcio/sync", { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { error?: string; grupos?: number; creditos?: number };
    if (!r.ok) return { ok: false, erro: j.error ?? `Falha (${r.status})` };
    return { ok: true, grupos: j.grupos, creditos: j.creditos };
  },
};
