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

/* ----------------------- Classificação inteligente (5 níveis) ---------------- */

export type Nivel = "muito_baixa" | "baixa" | "moderada" | "alta" | "excelente";

/** Cada nível controla cor, ícone, glow, badge, barra e texto na UI.
 *  É uma escala de STATUS: sempre acompanhada de emoji + rótulo (nunca cor só). */
export const NIVEL_INFO: Record<
  Nivel,
  { label: string; emoji: string; cor: string; min: number }
> = {
  muito_baixa: { label: "Muito Baixa", emoji: "🔴", cor: "#ef4444", min: 0 },
  baixa: { label: "Baixa", emoji: "🟠", cor: "#f97316", min: 20 },
  moderada: { label: "Moderada", emoji: "🟡", cor: "#eab308", min: 40 },
  alta: { label: "Alta", emoji: "🟢", cor: "#22c55e", min: 60 },
  excelente: { label: "Excelente", emoji: "🏆", cor: "#f5b301", min: 80 },
};

export const NIVEIS_ORDENADOS: Nivel[] = ["muito_baixa", "baixa", "moderada", "alta", "excelente"];

export function nivelDaProbabilidade(p: number): Nivel {
  if (p >= 80) return "excelente";
  if (p >= 60) return "alta";
  if (p >= 40) return "moderada";
  if (p >= 20) return "baixa";
  return "muito_baixa";
}

function interp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return y0;
  return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

/** Probabilidade ESTIMADA (0–95%) do lance, ancorada nas faixas configuradas
 *  e, quando há histórico, na mediana real do menor lance livre contemplado.
 *  Curva monotônica; teto em 95% de propósito — nunca sugere garantia. */
export function estimarProbabilidade(
  pctLance: number,
  config: ConsorcioConfig,
  mediana: number | null,
): number {
  let a50 = config.faixaMedia; // referência ~50%
  let a80 = config.faixaAlta; // referência ~80%
  if (mediana != null && mediana > 0) {
    a50 = Math.max(1, mediana - 4);
    a80 = mediana + 6;
  }
  if (a80 <= a50) a80 = a50 + 5;

  let p: number;
  if (pctLance <= 0) p = 4;
  else if (pctLance < a50) p = interp(pctLance, 0, 8, a50, 50);
  else if (pctLance < a80) p = interp(pctLance, a50, 50, a80, 80);
  else p = interp(pctLance, a80, 80, a80 * 1.6, 95);
  return Math.max(3, Math.min(95, Math.round(p)));
}

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
  /** Probabilidade estimada (0–95%) — headline do painel premium. */
  probabilidade: number;
  /** Nível (5 faixas) derivado da probabilidade. */
  nivel: Nivel;
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

  const probabilidade = estimarProbabilidade(pctLance, input.config, med);
  const nivel = nivelDaProbabilidade(probabilidade);

  return {
    pctLance,
    probabilidade,
    nivel,
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

/* ------------------ IA comercial: texto e observações por nível --------------- */

const DISCLAIMER =
  "Esta análise serve como apoio à negociação comercial e não representa garantia de contemplação.";

/** Parágrafo de análise que muda conforme o nível. Sempre termina com o aviso. */
export function textoInteligente(nivel: Nivel): string {
  const corpo: Record<Nivel, string> = {
    excelente:
      "Com base nos parâmetros cadastrados e nas configurações atuais do grupo, este lance apresenta excelente competitividade. Caso o comportamento da assembleia permaneça semelhante ao padrão utilizado nesta estimativa, existe uma elevada probabilidade de contemplação.",
    alta:
      "Considerando os parâmetros informados e as configurações do grupo, este lance apresenta boa competitividade. Se a assembleia mantiver um comportamento próximo ao padrão desta estimativa, as chances de contemplação são favoráveis.",
    moderada:
      "Com os parâmetros atuais, este lance fica em uma faixa intermediária de competitividade. Um pequeno aumento no valor do lance pode elevar de forma relevante a probabilidade estimada de contemplação.",
    baixa:
      "Nos parâmetros informados, este lance está abaixo da faixa mais competitiva para o grupo. Recomenda-se avaliar um reforço no valor do lance para melhorar o posicionamento na assembleia.",
    muito_baixa:
      "Com os valores atuais, este lance apresenta baixa competitividade frente à referência do grupo. Vale rever o valor ofertado antes de apresentar a proposta ao cliente.",
  };
  return `${corpo[nivel]} ${DISCLAIMER}`;
}

export type ObsComercial = { tipo: "ok" | "atencao"; texto: string };

/** Observações automáticas de apoio ao VENDEDOR (não são promessa ao cliente).
 *  Cartões coloridos, linguagem profissional. */
export function analiseComercial(r: SimulacaoResultado, carta: number): ObsComercial[] {
  const obs: ObsComercial[] = [];

  if (r.nivel === "excelente" || r.nivel === "alta") {
    obs.push({ tipo: "ok", texto: "Lance muito competitivo." });
    obs.push({ tipo: "ok", texto: "Boa oportunidade para ofertar agora." });
  } else if (r.nivel === "moderada") {
    obs.push({ tipo: "atencao", texto: "Lance próximo da faixa mínima recomendada." });
    obs.push({ tipo: "atencao", texto: "Vale considerar pequeno aumento para melhorar a competitividade." });
  } else {
    obs.push({ tipo: "atencao", texto: "Lance abaixo da faixa recomendada — considere reforçar o valor." });
  }

  if (r.valorEmbutido > 0) {
    obs.push({ tipo: "ok", texto: "Excelente uso de lance embutido." });
  }
  if (carta > 0 && r.creditoLiquido / carta >= 0.7) {
    obs.push({ tipo: "ok", texto: "Crédito líquido adequado." });
  }
  if (carta > 0 && r.recursoProprio / carta <= 0.2 && r.recursoProprio > 0) {
    obs.push({ tipo: "ok", texto: "Recurso próprio baixo." });
  }
  return obs;
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
