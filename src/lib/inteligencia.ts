// Central de IA — motor estratégico 100% DERIVADO dos dados existentes
// (leads + transições do histórico + vendas + metas). Funções puras: nada é
// gravado, nenhuma regra de negócio muda. Cada bloco responde a uma pergunta
// do gestor: quanto vou faturar? qual a saúde? quem apoiar? o que corre risco?

import type { AuditLog, Lead, LeadStatus, Venda } from "./types";
import { LEAD_STATUS_INFO } from "./types";
import {
  FUNIL_ORDEM,
  extrairTransicoes,
  receitaPrevista,
  variar,
  type AnaliseFunil,
} from "./analise-comercial";
import { LIMITE_DIAS } from "./oportunidades";

const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* ------------------------- 1) Previsão inteligente do mês --------------------- */

export type Tendencia = "alta" | "estavel" | "baixa";

export type PrevisaoInteligente = {
  min: number;
  max: number;
  confianca: number; // 0–100
  tendencia: Tendencia;
  tendenciaTexto: string;
};

export function previsaoInteligente(p: {
  vendidoCiclo: number;
  previsaoRunRate: number; // projeção linear do ciclo (já existente)
  pipelineProvavel: number; // receitaPrevista(geral)
  vendidoCicloAnterior: number;
  fracaoCicloDecorrida: number; // 0–1
  qtdVendasCiclo: number;
}): PrevisaoInteligente {
  const restanteRunRate = Math.max(0, p.previsaoRunRate - p.vendidoCiclo);
  const fracRestante = Math.max(0, 1 - p.fracaoCicloDecorrida);

  // Mínimo conservador: o que já entrou + 70% do ritmo projetado.
  const min = p.vendidoCiclo + restanteRunRate * 0.7;
  // Máximo otimista: ritmo cheio + parte do pipeline provável que ainda cabe no ciclo.
  const max = p.vendidoCiclo + restanteRunRate * 1.1 + p.pipelineProvavel * fracRestante * 0.5;

  // Confiança: cresce com o avanço do ciclo (mais dados) e o volume de vendas.
  const confianca = Math.round(
    Math.min(97, Math.max(35, 35 + p.fracaoCicloDecorrida * 45 + Math.min(p.qtdVendasCiclo, 17))),
  );

  let tendencia: Tendencia = "estavel";
  if (p.vendidoCicloAnterior > 0) {
    const razao = p.previsaoRunRate / p.vendidoCicloAnterior;
    if (razao >= 1.05) tendencia = "alta";
    else if (razao <= 0.95) tendencia = "baixa";
  } else if (p.previsaoRunRate > 0) {
    tendencia = "alta";
  }
  const tendenciaTexto =
    tendencia === "alta" ? "📈 Crescimento" : tendencia === "baixa" ? "📉 Desaceleração" : "➡️ Estável";

  return { min, max, confianca, tendencia, tendenciaTexto };
}

/* --------------------------- 2) Saúde comercial (0–100) ----------------------- */

export type FatorSaude = { nome: string; aproveitamento: number; texto: string };

export type SaudeComercial = {
  nota: number;
  classificacao: "Crítico" | "Regular" | "Bom" | "Excelente" | "Elite";
  cor: string;
  fatores: FatorSaude[]; // o que está derrubando a nota (aproveitamento < 60%)
};

export function saudeComercial(p: {
  geral: AnaliseFunil;
  pctMetaCiclo: number; // 0–100+
  alertasUrgentes: number;
  alertasTotais: number;
  leadsAtivos: number;
}): SaudeComercial {
  const componentes: { nome: string; peso: number; aproveitamento: number; textoBaixo: string }[] = [];
  const g = p.geral;

  const conv = Math.min(1, g.convGeral / 30); // 30% de conversão = teto "excelente"
  componentes.push({
    nome: "Conversão",
    peso: 25,
    aproveitamento: conv,
    textoBaixo: `Conversão geral em ${g.convGeral.toFixed(0)}% — abaixo do ideal (30%+).`,
  });

  const meta = Math.min(1, p.pctMetaCiclo / 100);
  componentes.push({
    nome: "Meta do ciclo",
    peso: 25,
    aproveitamento: meta,
    textoBaixo: `Meta do ciclo em ${p.pctMetaCiclo.toFixed(0)}% — ritmo abaixo do necessário.`,
  });

  const followUp = p.leadsAtivos > 0 ? Math.max(0, 1 - p.alertasTotais / p.leadsAtivos) : 1;
  componentes.push({
    nome: "Follow-up em dia",
    peso: 20,
    aproveitamento: followUp,
    textoBaixo: `${p.alertasTotais} negociação(ões) precisando de follow-up agora.`,
  });

  const esquecidos = p.leadsAtivos > 0 ? Math.max(0, 1 - p.alertasUrgentes / p.leadsAtivos) : 1;
  componentes.push({
    nome: "Leads esquecidos",
    peso: 15,
    aproveitamento: esquecidos,
    textoBaixo: `${p.alertasUrgentes} lead(s) em situação urgente (parados demais).`,
  });

  const idxProposta = FUNIL_ORDEM.indexOf("reuniao");
  const propostas = g.totalLeads > 0 ? Math.min(1, (g.etapas[idxProposta]?.alcancaram ?? 0) / (g.totalLeads * 0.5)) : 0;
  componentes.push({
    nome: "Volume de propostas",
    peso: 8,
    aproveitamento: propostas,
    textoBaixo: "Poucas propostas sendo geradas em relação ao volume de leads.",
  });

  const fechamentos = g.totalLeads > 0 ? Math.min(1, g.fechados / Math.max(1, g.totalLeads * 0.15)) : 0;
  componentes.push({
    nome: "Fechamentos",
    peso: 7,
    aproveitamento: fechamentos,
    textoBaixo: "Fechamentos abaixo do esperado pro volume de leads.",
  });

  const nota = Math.round(componentes.reduce((s, c) => s + c.peso * c.aproveitamento, 0));
  const classificacao =
    nota >= 85 ? "Elite" : nota >= 70 ? "Excelente" : nota >= 50 ? "Bom" : nota >= 30 ? "Regular" : "Crítico";
  const cor =
    nota >= 85 ? "#f5b301" : nota >= 70 ? "#22c55e" : nota >= 50 ? "#a3e635" : nota >= 30 ? "#eab308" : "#ef4444";

  const fatores: FatorSaude[] = componentes
    .filter((c) => c.aproveitamento < 0.6)
    .sort((a, b) => a.aproveitamento - b.aproveitamento)
    .map((c) => ({ nome: c.nome, aproveitamento: Math.round(c.aproveitamento * 100), texto: c.textoBaixo }));

  return { nota, classificacao, cor, fatores };
}

/* ----------------------- 3) Score dos vendedores (0–100) ---------------------- */

export type CriterioScore = { nome: string; pontos: number; max: number };
export type ScoreVendedor = {
  vendedorId: string;
  nome: string;
  nota: number;
  notaAnterior: number | null;
  criterios: CriterioScore[];
};

export function scoresVendedores(p: {
  porVendedor: { vendedorId: string; nome: string; analise: AnaliseFunil }[];
  anteriorPorVendedor: Map<string, AnaliseFunil> | null;
  geral: AnaliseFunil;
  pctMetaPorVendedor: Map<string, number>;
  alertasPorVendedor: Map<string, number>;
}): ScoreVendedor[] {
  const idxProposta = FUNIL_ORDEM.indexOf("reuniao");

  const calc = (a: AnaliseFunil, vendedorId: string): { nota: number; criterios: CriterioScore[] } => {
    const criterios: CriterioScore[] = [];
    const push = (nome: string, frac: number, max: number) =>
      criterios.push({ nome, pontos: Math.round(Math.max(0, Math.min(1, frac)) * max), max });

    push("Conversão", p.geral.convGeral > 0 ? a.convGeral / Math.max(p.geral.convGeral * 1.4, 1) : a.convGeral / 30, 25);
    push("Meta", (p.pctMetaPorVendedor.get(vendedorId) ?? 0) / 100, 20);
    const alertas = p.alertasPorVendedor.get(vendedorId) ?? 0;
    push("Follow-up", a.totalLeads > 0 ? 1 - alertas / Math.max(1, a.totalLeads) : 1, 20);
    push("Propostas", a.totalLeads > 0 ? (a.etapas[idxProposta]?.alcancaram ?? 0) / Math.max(1, a.totalLeads * 0.5) : 0, 10);
    push("Ticket médio", p.geral.ticketMedio > 0 && a.qtdVendas > 0 ? a.ticketMedio / (p.geral.ticketMedio * 1.3) : 0, 10);
    // Pontualidade nas movimentações: tempo médio nas etapas vs o da empresa.
    const tempos = a.etapas.filter((e) => e.tempoMedioDias !== null).map((e) => e.tempoMedioDias as number);
    const temposEmp = p.geral.etapas.filter((e) => e.tempoMedioDias !== null).map((e) => e.tempoMedioDias as number);
    const med = tempos.length ? tempos.reduce((s, v) => s + v, 0) / tempos.length : null;
    const medEmp = temposEmp.length ? temposEmp.reduce((s, v) => s + v, 0) / temposEmp.length : null;
    push("Agilidade", med !== null && medEmp !== null && med > 0 ? medEmp / (med * 1.2) : 0.5, 15);

    const nota = Math.min(100, criterios.reduce((s, c) => s + c.pontos, 0));
    return { nota, criterios };
  };

  return p.porVendedor
    .map(({ vendedorId, nome, analise }) => {
      const atual = calc(analise, vendedorId);
      const antes = p.anteriorPorVendedor?.get(vendedorId);
      const notaAnterior = antes && antes.totalLeads > 0 ? calc(antes, vendedorId).nota : null;
      return { vendedorId, nome, nota: atual.nota, notaAnterior, criterios: atual.criterios };
    })
    .sort((a, b) => b.nota - a.nota);
}

/* --------------- 4+5+8) Risco de perda + score + próxima melhor ação ---------- */

export type RiscoLead = {
  lead: Lead;
  /** 0–100: quanto MAIOR, mais perto de perder. */
  risco: number;
  /** Score de saúde da oportunidade (100 − risco). */
  score: number;
  nivel: "excelente" | "atencao" | "alto";
  motivos: string[];
  acao: string; // Próxima Melhor Ação
  diasParado: number;
};

const ACAO_POR_ETAPA: Record<string, string[]> = {
  oportunidade: ["Ligar agora e fazer o primeiro contato", "Enviar WhatsApp de apresentação hoje"],
  primeiro_contato: ["Fazer follow-up por WhatsApp", "Agendar uma reunião ainda esta semana"],
  reuniao: ["Enviar a proposta hoje", "Ligar e apresentar a proposta por telefone"],
  reuniao_agendada: ["Confirmar a reunião com o cliente", "Enviar lembrete da reunião por WhatsApp"],
  acompanhamento: ["Fazer follow-up com prazo definido", "Negociar condição especial pra fechar agora"],
};

export function riscosDePerda(
  leads: Lead[],
  audits: AuditLog[],
  geral: AnaliseFunil,
  agora: Date = new Date(),
): RiscoLead[] {
  const trans = extrairTransicoes(audits);
  const seed = agora.getDate();
  const out: RiscoLead[] = [];

  for (const lead of leads) {
    if (lead.status === "fechamento" || lead.status === "perdido") continue;
    const limite = LIMITE_DIAS[lead.status] ?? 5;
    const ts = trans.get(lead.id) ?? [];
    const ref = lead.atualizadoEm ?? lead.criadoEm;
    const diasParado = Math.max(0, Math.floor((agora.getTime() - new Date(ref).getTime()) / 86400000));

    let risco = 0;
    const motivos: string[] = [];

    // Tempo parado vs a régua da etapa (peso máximo 55)
    const razaoTempo = limite ? diasParado / limite : 0;
    risco += Math.min(55, razaoTempo * 22);
    if (diasParado > (limite ?? 5)) {
      motivos.push(`Cliente sem resposta há ${diasParado} dia(s) — o aceitável nesta etapa é ${limite}d.`);
    }

    // Etapa de proposta/acompanhamento parada pesa mais (até +15)
    if ((lead.status === "reuniao" || lead.status === "acompanhamento") && diasParado > (limite ?? 4)) {
      risco += 15;
      motivos.push(
        lead.status === "reuniao"
          ? `Proposta pendente há ${diasParado} dia(s) sem retorno.`
          : `Negociação em acompanhamento sem avanço há ${diasParado} dia(s).`,
      );
    }

    // Sem nenhuma movimentação registrada (até +15)
    if (ts.length === 0 && diasParado >= (limite ?? 5)) {
      risco += 15;
      motivos.push("Nenhuma movimentação registrada no funil até agora.");
    }

    // Histórico da etapa: conversão baixa a partir dela (até +15)
    const idx = FUNIL_ORDEM.indexOf(lead.status);
    const prox = idx >= 0 && idx + 1 < FUNIL_ORDEM.length ? geral.etapas[idx + 1] : null;
    if (prox?.convAnterior !== null && prox !== null && prox.convAnterior < 50 && geral.etapas[idx].alcancaram >= 3) {
      risco += (50 - prox.convAnterior) * 0.3;
      motivos.push(`Histórico semelhante: só ${prox.convAnterior.toFixed(0)}% avançam desta etapa — costuma terminar em perda sem ação rápida.`);
    }

    risco = Math.round(Math.max(0, Math.min(97, risco)));
    if (risco < 20) continue; // saudável — não entra na lista de risco

    const score = 100 - risco;
    const nivel = score >= 70 ? "excelente" : score >= 40 ? "atencao" : "alto";
    const acoes = ACAO_POR_ETAPA[lead.status] ?? ["Fazer follow-up com o cliente"];
    out.push({
      lead,
      risco,
      score,
      nivel,
      motivos,
      acao: variar(acoes, seed + lead.nome.length),
      diasParado,
    });
  }

  return out.sort((a, b) => b.risco - a.risco || b.lead.valorEstimado - a.lead.valorEstimado);
}

export const NIVEL_SCORE_INFO = {
  excelente: { emoji: "🟢", label: "Excelente", cor: "#22c55e" },
  atencao: { emoji: "🟡", label: "Atenção", cor: "#eab308" },
  alto: { emoji: "🔴", label: "Alto risco", cor: "#ef4444" },
} as const;

/* --------------------------- 6) Ranking por evolução --------------------------- */

export type Evolucao = {
  vendedorId: string;
  nome: string;
  dConversao: number; // p.p.
  dFaturamento: number; // R$
  dLeads: number; // produtividade (leads trabalhados)
  dPct: number; // crescimento % do faturamento
};

export function rankingEvolucao(
  porVendedor: { vendedorId: string; nome: string; analise: AnaliseFunil }[],
  anteriorPorVendedor: Map<string, AnaliseFunil> | null,
): Evolucao[] {
  if (!anteriorPorVendedor) return [];
  return porVendedor
    .map(({ vendedorId, nome, analise }) => {
      const antes = anteriorPorVendedor.get(vendedorId);
      if (!antes || (antes.totalLeads === 0 && antes.valorVendido === 0)) return null;
      return {
        vendedorId,
        nome,
        dConversao: analise.convGeral - antes.convGeral,
        dFaturamento: analise.valorVendido - antes.valorVendido,
        dLeads: analise.totalLeads - antes.totalLeads,
        dPct: antes.valorVendido > 0 ? ((analise.valorVendido - antes.valorVendido) / antes.valorVendido) * 100 : analise.valorVendido > 0 ? 100 : 0,
      };
    })
    .filter((x): x is Evolucao => x !== null)
    .sort((a, b) => b.dPct - a.dPct);
}

/* ------------------------ 9) Comparação entre períodos ------------------------ */

export type ComparacaoPeriodo = {
  label: string;
  atualQtd: number;
  atualValor: number;
  anteriorQtd: number;
  anteriorValor: number;
  deltaPct: number | null;
};

export function comparacoesPeriodos(vendas: Venda[], agora: Date = new Date()): ComparacaoPeriodo[] {
  const dia = 86400000;
  const iniDia = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const hoje0 = iniDia(agora);
  const iniSemana = (() => {
    const x = new Date(hoje0);
    const dow = (x.getDay() + 6) % 7; // segunda = 0
    return hoje0 - dow * dia;
  })();
  const iniMes = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
  const iniMesAnt = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).getTime();
  const iniAno = new Date(agora.getFullYear(), 0, 1).getTime();
  const iniAnoAnt = new Date(agora.getFullYear() - 1, 0, 1).getTime();

  const janelas: { label: string; a0: number; a1: number; b0: number; b1: number }[] = [
    { label: "Hoje × Ontem", a0: hoje0, a1: hoje0 + dia, b0: hoje0 - dia, b1: hoje0 },
    { label: "Semana × Anterior", a0: iniSemana, a1: iniSemana + 7 * dia, b0: iniSemana - 7 * dia, b1: iniSemana },
    { label: "Mês × Anterior", a0: iniMes, a1: agora.getTime() + 1, b0: iniMesAnt, b1: iniMes },
    { label: "Ano × Anterior", a0: iniAno, a1: agora.getTime() + 1, b0: iniAnoAnt, b1: iniAno },
  ];

  return janelas.map((j) => {
    let atualQtd = 0;
    let atualValor = 0;
    let anteriorQtd = 0;
    let anteriorValor = 0;
    for (const v of vendas) {
      const t = new Date(v.data).getTime();
      if (t >= j.a0 && t < j.a1) {
        atualQtd++;
        atualValor += v.valor;
      } else if (t >= j.b0 && t < j.b1) {
        anteriorQtd++;
        anteriorValor += v.valor;
      }
    }
    return {
      label: j.label,
      atualQtd,
      atualValor,
      anteriorQtd,
      anteriorValor,
      deltaPct: anteriorValor > 0 ? ((atualValor - anteriorValor) / anteriorValor) * 100 : atualValor > 0 ? 100 : null,
    };
  });
}

/* ------------------------------ 12) Dinheiro parado ---------------------------- */

export type DinheiroParado = {
  totalAberto: number;
  altaChance: number;
  parado: number;
  emRisco: number;
  recuperavel: number;
};

export function dinheiroParado(geral: AnaliseFunil, riscos: RiscoLead[]): DinheiroParado {
  const totalAberto = geral.etapas.slice(0, -1).reduce((s, e) => s + e.valorAtuais, 0);
  const altaChance = receitaPrevista(geral);
  const parado = riscos.reduce((s, r) => s + (r.diasParado > 0 ? r.lead.valorEstimado : 0), 0);
  const emRisco = riscos.filter((r) => r.nivel === "alto").reduce((s, r) => s + r.lead.valorEstimado, 0);
  const recuperavel = geral.taxaRecuperacao !== null ? geral.valorPerdidos * (geral.taxaRecuperacao / 100) : geral.valorPerdidos * 0.15;
  return { totalAberto, altaChance, parado, emRisco, recuperavel };
}

/* --------------------------- Resumos semanal / mensal -------------------------- */

export function resumoPeriodo(
  titulo: "semana" | "mês",
  comp: ComparacaoPeriodo,
  geral: AnaliseFunil,
  agora: Date = new Date(),
): string {
  const seed = agora.getDate() + comp.atualQtd * 3;
  const delta = comp.deltaPct;
  const dir = delta === null ? "sem base de comparação" : delta >= 0 ? `crescimento de ${delta.toFixed(0)}%` : `queda de ${Math.abs(delta).toFixed(0)}%`;
  return variar(
    [
      `Na ${titulo}: ${comp.atualQtd} venda(s) somando ${BRL(comp.atualValor)} — ${dir} sobre o período anterior (${BRL(comp.anteriorValor)}). A conversão geral do recorte está em ${geral.convGeral.toFixed(0)}%.`,
      `Balanço da ${titulo}: ${BRL(comp.atualValor)} em ${comp.atualQtd} venda(s), contra ${BRL(comp.anteriorValor)} no período anterior (${dir}). Funil convertendo ${geral.convGeral.toFixed(0)}% no geral.`,
    ],
    seed,
  );
}

/* ------------------------ 1) Índice Comercial LB (0–100) ---------------------- */

export type ComponenteIndice = { nome: string; pontos: number; max: number };

export type IndiceComercial = {
  nota: number;
  classificacao: "Excelente" | "Muito Bom" | "Bom" | "Atenção" | "Crítico";
  cor: string;
  componentes: ComponenteIndice[];
};

export type EntradaIndice = {
  geral: AnaliseFunil;
  pctMetaCiclo: number;
  alertasTotais: number;
  alertasUrgentes: number;
  leadsAtivos: number;
  valorEmRisco: number;
  valorAberto: number;
};

export function indiceComercialLB(e: EntradaIndice): IndiceComercial {
  const g = e.geral;
  const comp: ComponenteIndice[] = [];
  const add = (nome: string, frac: number, max: number) =>
    comp.push({ nome, pontos: Math.round(Math.max(0, Math.min(1, frac)) * max), max });

  add("Conversão", g.convGeral / 30, 15);
  add("Meta atingida", e.pctMetaCiclo / 100, 15);
  add("Follow-up", e.leadsAtivos > 0 ? 1 - e.alertasTotais / e.leadsAtivos : 1, 10);
  add("Tempo parado", e.leadsAtivos > 0 ? 1 - e.alertasUrgentes / e.leadsAtivos : 1, 10);
  add("Velocidade até fechar", g.tempoAteFecharDias !== null ? 30 / Math.max(30, g.tempoAteFecharDias) : 0.5, 8);
  add("Ticket médio", g.qtdVendas > 0 ? Math.min(1, g.ticketMedio / Math.max(1, g.valorVendido / Math.max(1, g.qtdVendas) * 0.8 + 1)) : 0.5, 7);
  add("Perdas controladas", g.totalLeads > 0 ? 1 - g.perdidos / g.totalLeads : 1, 10);
  add("Recuperações", g.taxaRecuperacao !== null ? g.taxaRecuperacao / 40 : 0.4, 5);
  add("Risco sob controle", e.valorAberto > 0 ? 1 - e.valorEmRisco / e.valorAberto : 1, 10);
  add("Movimentação do funil", g.totalLeads > 0 ? Math.min(1, (g.fechados + g.etapas[2].alcancaram) / Math.max(1, g.totalLeads * 0.6)) : 0, 5);
  add("Valor vendido", g.valorVendido > 0 ? Math.min(1, g.qtdVendas / Math.max(1, g.totalLeads * 0.2)) : 0, 5);

  const nota = Math.min(100, comp.reduce((s, c) => s + c.pontos, 0));
  const classificacao =
    nota >= 95 ? "Excelente" : nota >= 85 ? "Muito Bom" : nota >= 70 ? "Bom" : nota >= 55 ? "Atenção" : "Crítico";
  const cor = nota >= 95 ? "#f5b301" : nota >= 85 ? "#22c55e" : nota >= 70 ? "#a3e635" : nota >= 55 ? "#eab308" : "#ef4444";
  return { nota, classificacao, cor, componentes: comp };
}

/** Explica automaticamente por que a nota mudou (compara os componentes). */
export function explicarIndice(atual: IndiceComercial, anterior: IndiceComercial | null): string {
  if (!anterior) {
    const fracos = [...atual.componentes].sort((a, b) => a.pontos / a.max - b.pontos / b.max).slice(0, 2);
    return `A nota reflete principalmente ${fracos.map((f) => f.nome.toLowerCase()).join(" e ")}, os pontos com maior espaço de melhoria no momento.`;
  }
  const delta = atual.nota - anterior.nota;
  const difs = atual.componentes.map((c, i) => ({ nome: c.nome, d: c.pontos - (anterior.componentes[i]?.pontos ?? 0) }));
  if (delta < 0) {
    const quedas = difs.filter((x) => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 2);
    return quedas.length
      ? `A nota caiu ${Math.abs(delta)} ponto(s), puxada por ${quedas.map((q) => q.nome.toLowerCase()).join(" e ")}.`
      : `A nota caiu ${Math.abs(delta)} ponto(s) em relação ao período anterior.`;
  }
  if (delta > 0) {
    const altas = difs.filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 2);
    return altas.length
      ? `A nota subiu ${delta} ponto(s), impulsionada por ${altas.map((q) => q.nome.toLowerCase()).join(" e ")}.`
      : `A nota subiu ${delta} ponto(s) em relação ao período anterior.`;
  }
  return "Nota estável em relação ao período anterior.";
}

/* --------------------------- 2) Prioridade de hoje ----------------------------- */

export type Prioridade = { titulo: string; texto: string; potencial: number };

export function prioridadeDoDia(riscos: RiscoLead[], agora: Date = new Date()): Prioridade | null {
  if (riscos.length === 0) return null;
  const seed = agora.getDate();

  // Grupo mais valioso: negócios de alto valor parados
  const corte = 50000;
  const grandes = riscos.filter((r) => r.lead.valorEstimado >= corte && r.diasParado >= 3);
  if (grandes.length >= 2) {
    const pot = grandes.reduce((s, r) => s + r.lead.valorEstimado, 0);
    return {
      titulo: "🚨 PRIORIDADE DE HOJE",
      texto: variar(
        [
          `Existem ${grandes.length} oportunidades acima de ${BRL(corte)} sem contato há 3+ dias. É o dinheiro mais quente da casa esfriando.`,
          `${grandes.length} negócios grandes (≥ ${BRL(corte)}) estão parados há 3 dias ou mais — priorize esses contatos antes de qualquer outra tarefa.`,
        ],
        seed,
      ),
      potencial: pot,
    };
  }

  // Senão: o maior risco individual
  const top = riscos[0];
  return {
    titulo: "🚨 PRIORIDADE DE HOJE",
    texto: `${top.lead.nome} (${LEAD_STATUS_INFO[top.lead.status].label.toLowerCase()}) está com ${top.risco}% de risco: ${top.motivos[0] ?? `parado há ${top.diasParado} dia(s)`} ${top.lead.valorEstimado > 0 ? `Há ${BRL(top.lead.valorEstimado)} em jogo.` : ""}`,
    potencial: riscos.slice(0, 5).reduce((s, r) => s + r.lead.valorEstimado, 0),
  };
}

/* ---------------------------- 3) Radar de tendência ---------------------------- */

export type Tendencial = { rotulo: string; emoji: string; cor: string; motivo: string; janelas: { dias: number; atual: number; anterior: number }[] };

export function radarTendencia(vendas: Venda[], agora: Date = new Date()): Tendencial {
  const dia = 86400000;
  const t0 = agora.getTime();
  const soma = (ini: number, fim: number) =>
    vendas.reduce((s, v) => {
      const t = new Date(v.data).getTime();
      return t >= ini && t < fim ? s + v.valor : s;
    }, 0);

  const janelas = [7, 15, 30, 90].map((d) => ({
    dias: d,
    atual: soma(t0 - d * dia, t0),
    anterior: soma(t0 - 2 * d * dia, t0 - d * dia),
  }));

  // Score: média dos deltas relativos (janelas curtas pesam mais)
  const pesos = [0.4, 0.3, 0.2, 0.1];
  let score = 0;
  let base = 0;
  janelas.forEach((j, i) => {
    if (j.anterior > 0) {
      score += ((j.atual - j.anterior) / j.anterior) * pesos[i];
      base += pesos[i];
    } else if (j.atual > 0) {
      score += 0.5 * pesos[i];
      base += pesos[i];
    }
  });
  const r = base > 0 ? score / base : 0;
  const j7 = janelas[0];
  const j30 = janelas[2];

  if (r >= 0.1)
    return {
      rotulo: "Crescimento Forte",
      emoji: "📈",
      cor: "#22c55e",
      motivo: `Últimos 7 dias somaram ${BRL(j7.atual)} (antes: ${BRL(j7.anterior)}); em 30 dias, ${BRL(j30.atual)} contra ${BRL(j30.anterior)}.`,
      janelas,
    };
  if (r <= -0.1)
    return {
      rotulo: "Atenção",
      emoji: "📉",
      cor: "#ef4444",
      motivo: `O ritmo caiu: últimos 7 dias em ${BRL(j7.atual)} (antes ${BRL(j7.anterior)}); 30 dias em ${BRL(j30.atual)} vs ${BRL(j30.anterior)}.`,
      janelas,
    };
  return {
    rotulo: "Estável",
    emoji: "➡️",
    cor: "#eab308",
    motivo: `Vendas mantendo o padrão: ${BRL(j7.atual)} nos últimos 7 dias e ${BRL(j30.atual)} em 30 dias, na linha dos períodos anteriores.`,
    janelas,
  };
}

/* ----------------------------- 4) Meta inteligente ----------------------------- */

export function metaInteligente(p: {
  meta: number;
  vendido: number;
  diasDecorridos: number;
  diasRestantes: number;
}): string {
  if (p.meta <= 0) return "Defina as metas do ciclo em Metas mensais para a previsão de atingimento.";
  const falta = Math.max(0, p.meta - p.vendido);
  if (falta === 0) return "🏆 Meta batida! Agora é ampliar a margem — cada venda daqui é recorde.";
  const ritmoDia = p.vendido / Math.max(1, p.diasDecorridos);
  if (ritmoDia <= 0) return `Faltam ${BRL(falta)} e o ciclo ainda não registrou vendas — hora de acionar o funil com força.`;
  const diasNecessarios = falta / ritmoDia;
  if (diasNecessarios <= p.diasRestantes) {
    return `Mantendo o ritmo atual (${BRL(ritmoDia)}/dia), a meta será atingida em aproximadamente ${Math.ceil(diasNecessarios)} dia(s) — antes do fim do ciclo. ✅`;
  }
  const ritmoNecessario = falta / Math.max(1, p.diasRestantes);
  const aumento = ((ritmoNecessario / ritmoDia) - 1) * 100;
  return `No ritmo atual a meta não fecha: será necessário acelerar ~${aumento.toFixed(0)}% (de ${BRL(ritmoDia)}/dia para ${BRL(ritmoNecessario)}/dia nos ${p.diasRestantes} dia(s) restantes).`;
}

/* ---------------------------- 5) Resumo executivo ------------------------------ */

export function resumoExecutivo(p: {
  nomeGestor: string;
  nota: number;
  riscos: RiscoLead[];
  piorVendedor: { nome: string; nota: number } | null;
  recuperaveis: number;
  agora?: Date;
}): { saudacao: string; recomendacoes: string[] } {
  const agora = p.agora ?? new Date();
  const h = agora.getHours();
  const saud = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = p.nomeGestor.split(" ")[0];

  const rec: string[] = [];
  const grandes = p.riscos.filter((r) => r.lead.valorEstimado >= 50000).slice(0, 5);
  if (grandes.length > 0)
    rec.push(`Ligar para ${grandes.length} cliente(s) acima de ${BRL(50000)}: ${grandes.map((r) => r.lead.nome.split(" ")[0]).join(", ")}.`);
  const propostas = p.riscos.filter((r) => r.lead.status === "reuniao").slice(0, 4);
  if (propostas.length > 0)
    rec.push(`Cobrar ${propostas.length} proposta(s) pendente(s): ${propostas.map((r) => r.lead.nome.split(" ")[0]).join(", ")}.`);
  const acompanhamentos = p.riscos.filter((r) => r.lead.status === "acompanhamento").slice(0, 3);
  if (acompanhamentos.length > 0)
    rec.push(`Acompanhar ${acompanhamentos.length} negociação(ões) em fase final: ${acompanhamentos.map((r) => r.lead.nome.split(" ")[0]).join(", ")}.`);
  if (p.piorVendedor) rec.push(`Apoiar ${p.piorVendedor.nome.split(" ")[0]} (score ${p.piorVendedor.nota}/100) nas negociações abertas.`);
  if (p.recuperaveis > 0) rec.push(`Recuperar oportunidades antigas: ${BRL(p.recuperaveis)} em clientes perdidos com potencial de retorno.`);
  if (rec.length === 0) rec.push("Operação em dia — aproveite para prospectar novas oportunidades.");

  return { saudacao: `${saud}, ${primeiroNome}. Sua operação está em ${p.nota}/100.`, recomendacoes: rec };
}

/* --------------------------- 8) Cenários financeiros --------------------------- */

export type Cenarios = {
  pior: number;
  esperado: number;
  melhor: number;
  provavel: number;
  probMeta: number | null;
};

export function cenariosFinanceiros(p: {
  previsao: PrevisaoInteligente;
  runRate: number;
  pipelineProvavel: number;
  meta: number;
}): Cenarios {
  const esperado = p.runRate;
  const provavel = Math.min(p.previsao.max, esperado + p.pipelineProvavel * 0.3);
  let probMeta: number | null = null;
  if (p.meta > 0) {
    // Posição da meta dentro da faixa min–max → probabilidade heurística.
    if (p.meta <= p.previsao.min) probMeta = 95;
    else if (p.meta >= p.previsao.max) probMeta = 8;
    else probMeta = Math.round(90 - ((p.meta - p.previsao.min) / Math.max(1, p.previsao.max - p.previsao.min)) * 75);
  }
  return { pior: p.previsao.min, esperado, melhor: p.previsao.max, provavel, probMeta };
}

/* ------------------------- 11) Melhor ação do momento -------------------------- */

export type MelhorAcao = { texto: string; lead: Lead } | null;

export function melhorAcaoAgora(riscos: RiscoLead[], agora: Date = new Date()): MelhorAcao {
  if (riscos.length === 0) return null;
  // Maior chance de impacto: valor × urgência (risco), com etapa avançada valendo mais.
  const pesoEtapa: Partial<Record<LeadStatus, number>> = { acompanhamento: 1.3, reuniao: 1.2, reuniao_agendada: 1.1 };
  const top = [...riscos].sort(
    (a, b) =>
      b.lead.valorEstimado * (b.risco / 100) * (pesoEtapa[b.lead.status] ?? 1) -
      a.lead.valorEstimado * (a.risco / 100) * (pesoEtapa[a.lead.status] ?? 1),
  )[0];
  const nome = top.lead.nome.split(" ")[0];
  const verbo: Record<string, string[]> = {
    oportunidade: [`Ligar para ${nome} agora`, `Fazer o primeiro contato com ${nome} hoje`],
    primeiro_contato: [`Cobrar retorno de ${nome} por WhatsApp`, `Reaquecer a conversa com ${nome}`],
    reuniao: [`Enviar a proposta para ${nome} hoje`, `Cobrar a proposta de ${nome}`],
    reuniao_agendada: [`Confirmar a reunião com ${nome}`, `Garantir a presença de ${nome} na reunião`],
    acompanhamento: [`Fechar com ${nome}: fazer a ligação decisiva`, `Negociar condição final com ${nome}`],
  };
  const frase = variar(verbo[top.lead.status] ?? [`Fazer follow-up com ${nome}`], agora.getDate() + nome.length);
  const detalhe = `${top.lead.valorEstimado > 0 ? `${BRL(top.lead.valorEstimado)} · ` : ""}${LEAD_STATUS_INFO[top.lead.status].label} · parado há ${top.diasParado} dia(s) · risco ${top.risco}%`;
  return { texto: `${frase} — ${detalhe}`, lead: top.lead };
}

/* --------------------- 14) Oportunidades de recuperação ------------------------ */

export type Recuperavel = { lead: Lead; motivo: string; diasDesde: number };

export function oportunidadesRecuperacao(leads: Lead[], agora: Date = new Date()): { itens: Recuperavel[]; potencial: number } {
  const itens: Recuperavel[] = [];
  for (const l of leads) {
    if (l.status !== "perdido") continue;
    const dias = Math.floor((agora.getTime() - new Date(l.atualizadoEm ?? l.criadoEm).getTime()) / 86400000);
    itens.push({
      lead: l,
      motivo:
        dias >= 30
          ? `Perdido há ${dias} dia(s) — tempo suficiente pro cenário do cliente ter mudado.`
          : `Perdido há ${dias} dia(s) — retomada ainda quente.`,
      diasDesde: dias,
    });
  }
  itens.sort((a, b) => b.lead.valorEstimado - a.lead.valorEstimado);
  return { itens, potencial: itens.reduce((s, i) => s + i.lead.valorEstimado, 0) };
}

/* ------------------------ 16) Chat IA (estrutura pronta) ----------------------- */

export type PerguntaChat = { id: string; pergunta: string };

export const PERGUNTAS_CHAT: PerguntaChat[] = [
  { id: "ligar", pergunta: "Quem devo ligar primeiro hoje?" },
  { id: "ajuda", pergunta: "Qual vendedor precisa de ajuda?" },
  { id: "conversao", pergunta: "Por que minha conversão caiu?" },
  { id: "fechar", pergunta: "Quais clientes têm maior chance de fechar?" },
  { id: "semana", pergunta: "Quanto posso vender esta semana?" },
  { id: "etapa", pergunta: "Qual etapa está perdendo mais clientes?" },
  { id: "evoluiu", pergunta: "Quem mais evoluiu este mês?" },
  { id: "abaixo", pergunta: "Quem está abaixo da média?" },
  { id: "faturar", pergunta: "Quanto posso faturar até o fim do mês?" },
];

export type ContextoChat = {
  riscos: RiscoLead[];
  scores: ScoreVendedor[];
  geral: AnaliseFunil;
  anterior: AnaliseFunil | null;
  cenarios: Cenarios;
  evolucao: Evolucao[];
  vendas7dias: number;
};

/** Responde as perguntas do gestor com dados REAIS (estrutura do futuro chat —
 *  hoje 100% local; um LLM pode assumir depois usando o mesmo contexto). */
export function responderPergunta(id: string, c: ContextoChat): string {
  switch (id) {
    case "ligar": {
      const top = c.riscos.slice(0, 3);
      if (top.length === 0) return "Ninguém em situação crítica agora — aproveite pra prospectar ou adiantar follow-ups.";
      return `Comece por: ${top
        .map((r) => `${r.lead.nome} (${BRL(r.lead.valorEstimado)}, ${r.diasParado}d parado, risco ${r.risco}%)`)
        .join("; ")}.`;
    }
    case "ajuda": {
      const pior = c.scores[c.scores.length - 1];
      if (!pior) return "Sem vendedores ativos com dados suficientes.";
      const fraco = [...pior.criterios].sort((a, b) => a.pontos / a.max - b.pontos / b.max)[0];
      return `${pior.nome} (score ${pior.nota}/100). Ponto mais fraco: ${fraco.nome.toLowerCase()} (${fraco.pontos}/${fraco.max}). Um acompanhamento próximo nas negociações abertas dele tende a destravar.`;
    }
    case "conversao": {
      if (!c.anterior || c.anterior.totalLeads === 0) return `Conversão atual em ${c.geral.convGeral.toFixed(1)}% — sem período anterior pra comparar ainda.`;
      const d = c.geral.convGeral - c.anterior.convGeral;
      if (d >= 0) return `Sua conversão não caiu: está em ${c.geral.convGeral.toFixed(1)}% (${d.toFixed(1)} p.p. acima do período anterior).`;
      let pior = "";
      let piorD = 0;
      c.geral.etapas.forEach((e, i) => {
        const ant = c.anterior?.etapas[i];
        if (e.convAnterior !== null && ant?.convAnterior != null) {
          const dd = e.convAnterior - ant.convAnterior;
          if (dd < piorD) {
            piorD = dd;
            pior = e.label;
          }
        }
      });
      return `Caiu ${Math.abs(d).toFixed(1)} p.p. (${c.anterior.convGeral.toFixed(1)}% → ${c.geral.convGeral.toFixed(1)}%).${pior ? ` A maior piora foi na passagem para “${pior}” (${Math.abs(piorD).toFixed(0)} p.p. a menos).` : ""}`;
    }
    case "fechar": {
      const quentes = c.riscos
        .filter((r) => (r.lead.status === "acompanhamento" || r.lead.status === "reuniao") && r.score >= 40)
        .sort((a, b) => b.score - a.score || b.lead.valorEstimado - a.lead.valorEstimado)
        .slice(0, 3);
      if (quentes.length === 0) return "As negociações em fase final estão todas em risco alto ou não há nenhuma — foque em reaquecer o funil.";
      return `Maior chance agora: ${quentes.map((r) => `${r.lead.nome} (score ${r.score}/100, ${BRL(r.lead.valorEstimado)})`).join("; ")}.`;
    }
    case "semana":
      return `Pelo ritmo dos últimos 7 dias (${BRL(c.vendas7dias)}), a projeção pra próxima semana fica em torno de ${BRL(c.vendas7dias)} — e pode passar disso se as negociações em acompanhamento fecharem.`;
    case "etapa": {
      let pior = "";
      let conv = 101;
      c.geral.etapas.forEach((e, i) => {
        if (e.convAnterior !== null && c.geral.etapas[i - 1].alcancaram >= 3 && e.convAnterior < conv) {
          conv = e.convAnterior;
          pior = `${c.geral.etapas[i - 1].label} → ${e.label}`;
        }
      });
      return pior ? `A maior perda está em “${pior}”: só ${conv.toFixed(0)}% avançam.` : "Ainda não há volume suficiente pra apontar a pior etapa.";
    }
    case "evoluiu": {
      const top = c.evolucao[0];
      return top
        ? `${top.nome}: ${top.dPct >= 0 ? "+" : ""}${top.dPct.toFixed(0)}% de faturamento, conversão ${top.dConversao >= 0 ? "+" : ""}${top.dConversao.toFixed(0)} p.p. vs o período anterior.`
        : "Sem base de comparação suficiente ainda.";
    }
    case "abaixo": {
      const media = c.scores.reduce((s, x) => s + x.nota, 0) / Math.max(1, c.scores.length);
      const abaixo = c.scores.filter((s) => s.nota < media - 5);
      return abaixo.length
        ? `Abaixo da média (${media.toFixed(0)}): ${abaixo.map((s) => `${s.nome} (${s.nota})`).join(", ")}.`
        : "Ninguém relevante abaixo da média — equipe equilibrada.";
    }
    case "faturar":
      return `Cenários até o fim do ciclo: pior ${BRL(c.cenarios.pior)} · esperado ${BRL(c.cenarios.esperado)} · melhor ${BRL(c.cenarios.melhor)}. Receita provável: ${BRL(c.cenarios.provavel)}${c.cenarios.probMeta !== null ? ` · probabilidade de bater a meta: ${c.cenarios.probMeta}%` : ""}.`;
    default:
      return "Pergunta não reconhecida.";
  }
}

/* ---------------------- Linha do tempo do lead (timeline) ---------------------- */

export type EventoTimeline = {
  quando: string; // ISO
  emoji: string;
  titulo: string;
  detalhe?: string;
};

export function timelineDoLead(lead: Lead, audits: AuditLog[], vendas: Venda[]): EventoTimeline[] {
  const eventos: EventoTimeline[] = [];
  eventos.push({ quando: lead.criadoEm, emoji: "✨", titulo: "Lead criado", detalhe: lead.origem ? `Origem: ${lead.origem}` : undefined });

  for (const a of audits) {
    if (a.entidade !== "lead" || a.entidadeId !== lead.id) continue;
    const det = (a.detalhes ?? "").trim();
    const m = /^status\s*(?:→|->)\s*(\S+)$/.exec(det);
    if (a.acao === "editar" && m) {
      const st = m[1] as LeadStatus;
      const label = LEAD_STATUS_INFO[st]?.label ?? m[1];
      eventos.push({
        quando: a.criadoEm,
        emoji: st === "fechamento" ? "🏆" : st === "perdido" ? "❌" : "➡️",
        titulo: `Movido para “${label}”`,
        detalhe: a.usuarioEmail ?? undefined,
      });
    } else if (a.acao === "editar") {
      eventos.push({ quando: a.criadoEm, emoji: "✏️", titulo: "Dados atualizados", detalhe: det || undefined });
    }
  }

  // Vendas do mesmo cliente (associação por nome — modelo atual do CRM)
  for (const v of vendas) {
    if (v.cliente.trim().toLowerCase() === lead.nome.trim().toLowerCase()) {
      eventos.push({ quando: v.data, emoji: "💰", titulo: `Venda registrada: ${BRL(v.valor)}`, detalhe: v.observacao ?? undefined });
    }
  }

  if (lead.observacao) {
    eventos.push({
      quando: lead.atualizadoEm ?? lead.criadoEm,
      emoji: "📝",
      titulo: "Observação",
      detalhe: lead.observacao,
    });
  }

  return eventos.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
}
