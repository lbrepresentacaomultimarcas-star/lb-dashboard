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
