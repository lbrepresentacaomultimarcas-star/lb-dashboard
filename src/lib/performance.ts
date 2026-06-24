/**
 * Motor do "Índice LB de Performance" — nota de desempenho comercial 0–100%
 * por vendedor, por CICLO de produção (reusa ciclo.ts no momento da extração).
 *
 * MÓDULO INDEPENDENTE: não toca em vendas/metas/comissões/ranking de vendas.
 * Funções PURAS (fáceis de testar). A extração dos indicadores brutos a partir
 * de leads/vendas/audit_log acontece na camada de ligação (etapa de wiring);
 * aqui ficam a fórmula, a classificação, a evolução e a comparação.
 */

export type FaixaPerf = "elite" | "excelente" | "bom" | "atencao" | "precisa_melhorar";

/** Pesos de cada indicador na nota final (somam ~100; editáveis pelo admin). */
export type PesosPerformance = {
  conversao: number;
  fechamentos: number;
  agendamentos: number;
  propostas: number;
  atualizacao: number;
};

/** Metas: bater a meta = 100% naquele indicador (editáveis pelo admin). */
export type MetasPerformance = {
  conversao: number;    // % de conversão considerada "100%"
  fechamentos: number;  // qtde de fechados no ciclo
  agendamentos: number; // qtde de agendamentos no ciclo
  propostas: number;    // qtde de propostas no ciclo
  diasFrescor: number;  // lead "atualizado" se mexido nos últimos N dias
  limiarEvolucao: number; // variação (pts) p/ contar como subiu/caiu
  metaEmpresa: number;  // meta MÍNIMA de performance da empresa (nota %)
};

export type ConfigPerformance = {
  pesos: PesosPerformance;
  metas: MetasPerformance;
};

/** Padrão aprovado pelo usuário (23/06/2026). */
export const CONFIG_PERFORMANCE_PADRAO: ConfigPerformance = {
  pesos: { conversao: 40, fechamentos: 25, agendamentos: 15, propostas: 10, atualizacao: 10 },
  metas: { conversao: 30, fechamentos: 6, agendamentos: 20, propostas: 30, diasFrescor: 7, limiarEvolucao: 2, metaEmpresa: 80 },
};

/** Indicadores brutos de UM vendedor num ciclo — TODOS vindos do funil (leads
 *  + movimentação dos cards no audit_log). Nenhum contador paralelo. */
export type IndicadoresBrutos = {
  /** chegadas do card em "Fechado" no ciclo (movimentação do funil) */
  fechados: number;
  /** leads/oportunidades trabalhados no ciclo (base da conversão) */
  oportunidades: number;
  /** transições "→ reunião agendada" no ciclo */
  agendamentos: number;
  /** transições "→ fazer e passar proposta" no ciclo */
  propostas: number;
  /** chegadas do card em "Perdido" no ciclo (informativo, fora da nota) */
  perdidos?: number;
  /** leads ativos (não fechados/perdidos) do vendedor */
  leadsAtivos: number;
  /** leads ativos atualizados dentro de diasFrescor */
  leadsAtualizados: number;
};

export type SubNotas = {
  conversao: number;
  fechamentos: number;
  agendamentos: number;
  propostas: number;
  atualizacao: number;
};

export type ResultadoPerformance = {
  subNotas: SubNotas;
  /** % de conversão "cru" (fechados/oportunidades), pra exibir */
  conversaoPct: number;
  nota: number; // 0–100
  faixa: FaixaPerf;
};

export type Tendencia = "subiu" | "estavel" | "caiu" | "novo";

export const FAIXA_INFO: Record<
  FaixaPerf,
  { label: string; min: number; cor: string; mensagem: string }
> = {
  elite: {
    label: "Elite",
    min: 90,
    cor: "#22C55E",
    mensagem: "Excelente desempenho. Continue assim.",
  },
  excelente: {
    label: "Excelente",
    min: 80,
    cor: "#4ade80",
    mensagem: "Ótima performance. Próximo nível: Elite.",
  },
  bom: {
    label: "Bom",
    min: 70,
    cor: "#FACC15",
    mensagem: "Bom desempenho. Há espaço para crescimento.",
  },
  atencao: {
    label: "Atenção",
    min: 60,
    cor: "#fb923c",
    mensagem: "Sua conversão e movimentação estão abaixo da média da equipe.",
  },
  precisa_melhorar: {
    label: "Precisa Melhorar",
    min: 0,
    cor: "#f43f5e",
    mensagem:
      "Seu desempenho está abaixo da meta definida. Revise seu acompanhamento e atualizações do CRM.",
  },
};

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));

/** Nota 0–100 de um indicador: bater a meta = 100. */
function notaMeta(realizado: number, meta: number): number {
  if (meta <= 0) return 0;
  return clamp100((realizado / meta) * 100);
}

/** As 5 sub-notas (0–100) a partir dos indicadores brutos e metas. */
export function subNotas(b: IndicadoresBrutos, metas: MetasPerformance): SubNotas {
  const conversaoPct = b.oportunidades > 0 ? (b.fechados / b.oportunidades) * 100 : 0;
  // sem leads ativos = nada parado = organização perfeita (100)
  const atualizacaoPct = b.leadsAtivos > 0 ? (b.leadsAtualizados / b.leadsAtivos) * 100 : 100;
  return {
    conversao: notaMeta(conversaoPct, metas.conversao),
    fechamentos: notaMeta(b.fechados, metas.fechamentos),
    agendamentos: notaMeta(b.agendamentos, metas.agendamentos),
    propostas: notaMeta(b.propostas, metas.propostas),
    atualizacao: clamp100(atualizacaoPct),
  };
}

/** Média ponderada das sub-notas pelos pesos → nota final 0–100. */
export function notaFinal(sn: SubNotas, pesos: PesosPerformance): number {
  const soma =
    pesos.conversao + pesos.fechamentos + pesos.agendamentos + pesos.propostas + pesos.atualizacao;
  if (soma <= 0) return 0;
  const total =
    sn.conversao * pesos.conversao +
    sn.fechamentos * pesos.fechamentos +
    sn.agendamentos * pesos.agendamentos +
    sn.propostas * pesos.propostas +
    sn.atualizacao * pesos.atualizacao;
  return total / soma;
}

/** Faixa de classificação a partir da nota. */
export function faixaDeNota(nota: number): FaixaPerf {
  if (nota >= 90) return "elite";
  if (nota >= 80) return "excelente";
  if (nota >= 70) return "bom";
  if (nota >= 60) return "atencao";
  return "precisa_melhorar";
}

/** Cálculo completo de um vendedor: sub-notas + nota + faixa. */
export function calcularPerformance(
  b: IndicadoresBrutos,
  config: ConfigPerformance = CONFIG_PERFORMANCE_PADRAO,
): ResultadoPerformance {
  const sn = subNotas(b, config.metas);
  const nota = notaFinal(sn, config.pesos);
  const conversaoPct = b.oportunidades > 0 ? (b.fechados / b.oportunidades) * 100 : 0;
  return { subNotas: sn, conversaoPct, nota, faixa: faixaDeNota(nota) };
}

/** Evolução vs ciclo anterior (null = sem histórico → "novo"). */
export function evolucao(
  notaAtual: number,
  notaAnterior: number | null | undefined,
  limiar = 2,
): { tendencia: Tendencia; delta: number } {
  if (notaAnterior == null) return { tendencia: "novo", delta: 0 };
  const delta = notaAtual - notaAnterior;
  const tendencia: Tendencia = delta >= limiar ? "subiu" : delta <= -limiar ? "caiu" : "estavel";
  return { tendencia, delta };
}

/** Seta visual da tendência. */
export const SETA: Record<Tendencia, string> = {
  subiu: "⬆",
  estavel: "➡",
  caiu: "⬇",
  novo: "•",
};

/** Comparação com a média da equipe, em % (positivo = acima). */
export function comparacaoEquipe(nota: number, mediaEquipe: number): number {
  if (mediaEquipe <= 0) return 0;
  return ((nota - mediaEquipe) / mediaEquipe) * 100;
}

/**
 * Situação vs a meta MÍNIMA da empresa.
 * `atingiu` = nota alcançou a meta; `diferenca` = pontos de distância (sempre
 * positivo). Ex.: nota 74, meta 80 → { atingiu:false, diferenca:6 } ("faltam 6%");
 * nota 91, meta 80 → { atingiu:true, diferenca:11 } ("acima da meta em 11%").
 */
export function versusMeta(
  nota: number,
  metaEmpresa: number,
): { atingiu: boolean; diferenca: number } {
  const d = nota - metaEmpresa;
  return { atingiu: d >= 0, diferenca: Math.abs(d) };
}

/** Meta batida = a sub-nota encostou no teto (realizado alcançou a meta). */
export function metaBatida(subNota: number): boolean {
  return subNota >= 100;
}

export type ChaveIndicador =
  | "conversao"
  | "fechamentos"
  | "agendamentos"
  | "propostas"
  | "atualizacao";

/** Detalhe por indicador p/ a UI: realizado, meta usada, sub-nota e se bateu. */
export type DetalheIndicador = {
  chave: ChaveIndicador;
  label: string;
  realizado: number;
  meta: number;
  unidade: "%" | "qtd";
  subNota: number;
  batida: boolean;
};

/**
 * Quebra os indicadores pra exibição: o valor realizado, a META usada no
 * cálculo e se a meta foi batida. Alimenta os selos "meta batida/não batida"
 * e o "meta atual utilizada no cálculo".
 */
export function detalharIndicadores(
  b: IndicadoresBrutos,
  config: ConfigPerformance = CONFIG_PERFORMANCE_PADRAO,
): DetalheIndicador[] {
  const sn = subNotas(b, config.metas);
  const conversaoPct = b.oportunidades > 0 ? (b.fechados / b.oportunidades) * 100 : 0;
  const atualizacaoPct = b.leadsAtivos > 0 ? (b.leadsAtualizados / b.leadsAtivos) * 100 : 100;
  return [
    { chave: "conversao", label: "Conversão", realizado: conversaoPct, meta: config.metas.conversao, unidade: "%", subNota: sn.conversao, batida: metaBatida(sn.conversao) },
    { chave: "fechamentos", label: "Fechamentos", realizado: b.fechados, meta: config.metas.fechamentos, unidade: "qtd", subNota: sn.fechamentos, batida: metaBatida(sn.fechamentos) },
    { chave: "agendamentos", label: "Agendamentos", realizado: b.agendamentos, meta: config.metas.agendamentos, unidade: "qtd", subNota: sn.agendamentos, batida: metaBatida(sn.agendamentos) },
    { chave: "propostas", label: "Propostas", realizado: b.propostas, meta: config.metas.propostas, unidade: "qtd", subNota: sn.propostas, batida: metaBatida(sn.propostas) },
    { chave: "atualizacao", label: "Atualização do CRM", realizado: atualizacaoPct, meta: 100, unidade: "%", subNota: sn.atualizacao, batida: metaBatida(sn.atualizacao) },
  ];
}
