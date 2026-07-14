// Análise Comercial — motor 100% DERIVADO dos dados que o CRM já tem:
// leads (etapa atual, valor, vendedor), audit_log (transições "status → X",
// com data — a jornada real de cada lead) e vendas (financeiro fechado).
// Não grava nada e não altera nenhum dado: apenas lê e explica.

import type { AuditLog, Lead, LeadStatus, Venda } from "./types";
import { LEAD_STATUS_INFO } from "./types";

/** Ordem comercial do funil (a mesma do pipeline; "perdido" fica fora). */
export const FUNIL_ORDEM: LeadStatus[] = [
  "oportunidade",
  "primeiro_contato",
  "reuniao", // "Fazer e passar proposta"
  "reuniao_agendada",
  "acompanhamento",
  "fechamento",
];

const IDX: Record<string, number> = Object.fromEntries(FUNIL_ORDEM.map((s, i) => [s, i]));

export type FiltroAnalise = {
  vendedorId?: string;
  /** Considera leads CRIADOS dentro do intervalo (quando informado). */
  de?: Date;
  ate?: Date;
};

export type EtapaFunil = {
  status: LeadStatus;
  label: string;
  /** Leads que ALCANÇARAM a etapa (jornada real via histórico + etapa atual). */
  alcancaram: number;
  /** Leads parados HOJE nesta etapa. */
  atuais: number;
  /** Valor estimado somado dos que alcançaram a etapa. */
  valor: number;
  /** Conversão a partir da etapa anterior (null na primeira). */
  convAnterior: number | null;
  /** Tempo médio (dias) que os leads ficaram nesta etapa (null sem dados). */
  tempoMedioDias: number | null;
};

export type AnaliseFunil = {
  etapas: EtapaFunil[];
  totalLeads: number;
  fechados: number;
  perdidos: number;
  /** Conversão geral: fechamento / entradas do funil. */
  convGeral: number;
  /** Financeiro: vendas reais no período (se houver) — ticket médio real. */
  qtdVendas: number;
  valorVendido: number;
  ticketMedio: number;
  /** Tempo médio (dias) da criação até o fechamento (leads fechados). */
  tempoAteFecharDias: number | null;
};

type Transicao = { leadId: string; para: LeadStatus; em: number };

/** Extrai as mudanças de etapa do histórico ("status → X"). */
export function extrairTransicoes(audits: AuditLog[]): Map<string, Transicao[]> {
  const porLead = new Map<string, Transicao[]>();
  for (const a of audits) {
    if (a.entidade !== "lead" || a.acao !== "editar" || !a.entidadeId) continue;
    const m = /^status\s*(?:→|->)\s*(\S+)$/.exec((a.detalhes ?? "").trim());
    if (!m) continue;
    const para = m[1] as LeadStatus;
    if (!(para in LEAD_STATUS_INFO)) continue;
    const em = new Date(a.criadoEm).getTime();
    if (!Number.isFinite(em)) continue;
    const arr = porLead.get(a.entidadeId) ?? [];
    arr.push({ leadId: a.entidadeId, para, em });
    porLead.set(a.entidadeId, arr);
  }
  for (const arr of porLead.values()) arr.sort((x, y) => x.em - y.em);
  return porLead;
}

/** Etapa mais avançada que o lead alcançou (histórico + etapa atual). */
function etapaMaxima(lead: Lead, trans: Transicao[] | undefined): number {
  let max = lead.status in IDX ? IDX[lead.status] : -1;
  for (const t of trans ?? []) {
    const i = IDX[t.para];
    if (i !== undefined && i > max) max = i;
  }
  // Lead perdido sem histórico: conta como tendo entrado no funil (etapa 0).
  return max >= 0 ? max : 0;
}

/** Análise completa do funil para um filtro (geral ou por vendedor/período). */
export function analisarFunil(
  leads: Lead[],
  audits: AuditLog[],
  vendas: Venda[],
  f: FiltroAnalise = {},
): AnaliseFunil {
  const de = f.de?.getTime() ?? -Infinity;
  const ate = f.ate?.getTime() ?? Infinity;

  const meus = leads.filter((l) => {
    if (f.vendedorId && l.vendedorId !== f.vendedorId) return false;
    const t = new Date(l.criadoEm).getTime();
    return t >= de && t <= ate;
  });
  const ids = new Set(meus.map((l) => l.id));
  const trans = extrairTransicoes(audits);

  // Quantos ALCANÇARAM cada etapa + valor associado
  const alcancaram = FUNIL_ORDEM.map(() => 0);
  const valor = FUNIL_ORDEM.map(() => 0);
  const atuais = FUNIL_ORDEM.map(() => 0);
  let perdidos = 0;

  for (const l of meus) {
    const max = etapaMaxima(l, trans.get(l.id));
    for (let i = 0; i <= max && i < FUNIL_ORDEM.length; i++) {
      alcancaram[i]++;
      valor[i] += l.valorEstimado || 0;
    }
    if (l.status === "perdido") perdidos++;
    else if (l.status in IDX) atuais[IDX[l.status]]++;
  }

  // Tempo médio em cada etapa: entrada = evento "status → etapa" (ou criação,
  // pra etapa inicial); saída = próximo evento (ou agora, se ainda está nela).
  const somaTempo = FUNIL_ORDEM.map(() => 0);
  const qtdTempo = FUNIL_ORDEM.map(() => 0);
  const agora = Date.now();
  for (const l of meus) {
    const ts = trans.get(l.id) ?? [];
    const criado = new Date(l.criadoEm).getTime();
    // etapa inicial (antes da 1ª transição): inferimos como a atual se não
    // houver histórico; senão, medimos criação → 1ª transição na etapa 0.
    if (ts.length === 0) {
      if (l.status in IDX) {
        somaTempo[IDX[l.status]] += agora - criado;
        qtdTempo[IDX[l.status]]++;
      }
      continue;
    }
    // criação até a primeira mudança conta pra etapa inicial do funil
    somaTempo[0] += Math.max(0, ts[0].em - criado);
    qtdTempo[0]++;
    for (let k = 0; k < ts.length; k++) {
      const i = IDX[ts[k].para];
      if (i === undefined) continue;
      const fim = k + 1 < ts.length ? ts[k + 1].em : l.status === ts[k].para ? agora : null;
      if (fim !== null) {
        somaTempo[i] += Math.max(0, fim - ts[k].em);
        qtdTempo[i]++;
      }
    }
  }

  // Financeiro real: vendas do período/vendedor
  const minhasVendas = vendas.filter((v) => {
    if (f.vendedorId && v.vendedorId !== f.vendedorId) return false;
    const t = new Date(v.data).getTime();
    return t >= de && t <= ate;
  });
  const valorVendido = minhasVendas.reduce((s, v) => s + v.valor, 0);

  // Tempo criação → fechamento (leads que chegaram em "fechamento")
  let somaFechar = 0;
  let qtdFechar = 0;
  for (const l of meus) {
    const ts = trans.get(l.id) ?? [];
    const ev = ts.find((t) => t.para === "fechamento");
    if (ev) {
      somaFechar += Math.max(0, ev.em - new Date(l.criadoEm).getTime());
      qtdFechar++;
    }
  }

  const etapas: EtapaFunil[] = FUNIL_ORDEM.map((s, i) => ({
    status: s,
    label: LEAD_STATUS_INFO[s].label,
    alcancaram: alcancaram[i],
    atuais: atuais[i],
    valor: valor[i],
    convAnterior: i === 0 ? null : alcancaram[i - 1] > 0 ? (alcancaram[i] / alcancaram[i - 1]) * 100 : null,
    tempoMedioDias: qtdTempo[i] > 0 ? somaTempo[i] / qtdTempo[i] / 86400000 : null,
  }));

  const fechados = alcancaram[IDX.fechamento] ?? 0;
  void ids;

  return {
    etapas,
    totalLeads: meus.length,
    fechados,
    perdidos,
    convGeral: meus.length > 0 ? (fechados / meus.length) * 100 : 0,
    qtdVendas: minhasVendas.length,
    valorVendido,
    ticketMedio: minhasVendas.length > 0 ? valorVendido / minhasVendas.length : 0,
    tempoAteFecharDias: qtdFechar > 0 ? somaFechar / qtdFechar / 86400000 : null,
  };
}

/* ----------------------------- Diagnóstico (texto) ---------------------------- */

export type Diagnostico = {
  titulo: string;
  texto: string;
  tone: "success" | "warn" | "danger" | "brand";
};

const SUGESTAO_POR_ETAPA: Record<string, string> = {
  oportunidade: "Acelere o primeiro contato: oportunidades esfriam rápido — responda no mesmo dia.",
  primeiro_contato: "Padronize o roteiro do primeiro contato e já saia com a próxima ação agendada.",
  reuniao: "Reduza o tempo entre o contato e a proposta: envie a proposta em até 24h.",
  reuniao_agendada: "Confirme reuniões na véspera e tenha plano B para remarcar na hora (não deixar morrer).",
  acompanhamento: "Reforce técnicas de negociação e follow-up com prazo definido (ex.: retorno em 48h).",
  fechamento: "Revise as condições finais: agilize contrato e documentação para não perder no detalhe.",
};

/** Gera o diagnóstico automático comparando o recorte com a equipe e com o
 *  período anterior. Linguagem comercial, direta e acionável. */
export function gerarDiagnostico(
  atual: AnaliseFunil,
  equipe: AnaliseFunil | null,
  anterior: AnaliseFunil | null,
): Diagnostico[] {
  const out: Diagnostico[] = [];
  if (atual.totalLeads === 0) {
    return [
      {
        titulo: "Sem dados no recorte",
        texto: "Nenhum lead no período/vendedor selecionado. Amplie o período para ver o diagnóstico.",
        tone: "brand",
      },
    ];
  }

  // 1) Maior perda entre etapas
  let piorIdx = -1;
  let piorConv = 101;
  atual.etapas.forEach((e, i) => {
    if (e.convAnterior !== null && atual.etapas[i - 1].alcancaram >= 3 && e.convAnterior < piorConv) {
      piorConv = e.convAnterior;
      piorIdx = i;
    }
  });
  if (piorIdx > 0) {
    const de = atual.etapas[piorIdx - 1].label;
    const para = atual.etapas[piorIdx].label;
    out.push({
      titulo: "Onde o funil mais perde",
      texto: `A maior perda ocorre entre “${de}” e “${para}”: só ${piorConv.toFixed(0)}% avançam. ${SUGESTAO_POR_ETAPA[atual.etapas[piorIdx - 1].status] ?? ""}`,
      tone: "danger",
    });
  }

  // 2) Gargalo de tempo
  let lentoIdx = -1;
  let lentoDias = 0;
  atual.etapas.forEach((e, i) => {
    if (i < atual.etapas.length - 1 && e.tempoMedioDias !== null && e.tempoMedioDias > lentoDias) {
      lentoDias = e.tempoMedioDias;
      lentoIdx = i;
    }
  });
  if (lentoIdx >= 0 && lentoDias >= 1) {
    out.push({
      titulo: "Maior gargalo de tempo",
      texto: `Os leads passam em média ${lentoDias.toFixed(0)} dia(s) em “${atual.etapas[lentoIdx].label}”. Encurtar essa espera tende a elevar a conversão geral.`,
      tone: "warn",
    });
  }

  // 3) Ponto forte (vs equipe)
  if (equipe) {
    let melhorIdx = -1;
    let melhorDelta = 0;
    atual.etapas.forEach((e, i) => {
      const eq = equipe.etapas[i];
      if (e.convAnterior !== null && eq.convAnterior !== null && atual.etapas[i - 1].alcancaram >= 3) {
        const delta = e.convAnterior - eq.convAnterior;
        if (delta > melhorDelta) {
          melhorDelta = delta;
          melhorIdx = i;
        }
      }
    });
    if (melhorIdx > 0 && melhorDelta >= 5) {
      out.push({
        titulo: "Ponto forte",
        texto: `Conversão para “${atual.etapas[melhorIdx].label}” está ${melhorDelta.toFixed(0)} p.p. ACIMA da média da equipe — é uma referência a ser mantida (e ensinada aos colegas).`,
        tone: "success",
      });
    }
    const deltaGeral = atual.convGeral - equipe.convGeral;
    out.push({
      titulo: "Comparação com a equipe",
      texto:
        deltaGeral >= 0
          ? `Conversão geral de ${atual.convGeral.toFixed(1)}% — ${deltaGeral.toFixed(1)} p.p. acima da média da empresa (${equipe.convGeral.toFixed(1)}%).`
          : `Conversão geral de ${atual.convGeral.toFixed(1)}% — ${Math.abs(deltaGeral).toFixed(1)} p.p. abaixo da média da empresa (${equipe.convGeral.toFixed(1)}%). Foque na etapa de maior perda acima.`,
      tone: deltaGeral >= 0 ? "success" : "warn",
    });
  }

  // 4) Evolução vs período anterior
  if (anterior && anterior.totalLeads > 0) {
    const d = atual.convGeral - anterior.convGeral;
    out.push({
      titulo: "Evolução",
      texto:
        Math.abs(d) < 0.5
          ? `Conversão estável em relação ao período anterior (${anterior.convGeral.toFixed(1)}% → ${atual.convGeral.toFixed(1)}%).`
          : d > 0
            ? `Melhora de ${d.toFixed(1)} p.p. na conversão geral vs período anterior (${anterior.convGeral.toFixed(1)}% → ${atual.convGeral.toFixed(1)}%). Continue no mesmo ritmo.`
            : `Queda de ${Math.abs(d).toFixed(1)} p.p. na conversão geral vs período anterior (${anterior.convGeral.toFixed(1)}% → ${atual.convGeral.toFixed(1)}%). Vale revisar o que mudou na rotina.`,
      tone: Math.abs(d) < 0.5 ? "brand" : d > 0 ? "success" : "danger",
    });
  }

  return out;
}

/* ------------------------------ Ranking analítico ----------------------------- */

export type DestaqueRanking = {
  titulo: string;
  vendedorId: string | null;
  valorTexto: string;
};

export function rankingAnalitico(
  porVendedor: { vendedorId: string; analise: AnaliseFunil }[],
): DestaqueRanking[] {
  const comDados = porVendedor.filter((p) => p.analise.totalLeads > 0);
  const melhor = <T>(arr: T[], score: (t: T) => number, min = -Infinity): T | null => {
    let best: T | null = null;
    let bs = min;
    for (const x of arr) {
      const s = score(x);
      if (s > bs) {
        bs = s;
        best = x;
      }
    }
    return best;
  };

  const out: DestaqueRanking[] = [];

  const convGeral = melhor(comDados, (p) => p.analise.convGeral, 0);
  if (convGeral)
    out.push({ titulo: "Melhor conversão geral", vendedorId: convGeral.vendedorId, valorTexto: `${convGeral.analise.convGeral.toFixed(1)}%` });

  // Melhor conversão em uma etapa específica (a maior taxa individual)
  let etapaBest: { vendedorId: string; label: string; conv: number } | null = null;
  for (const p of comDados) {
    p.analise.etapas.forEach((e, i) => {
      if (e.convAnterior !== null && p.analise.etapas[i - 1].alcancaram >= 3) {
        if (!etapaBest || e.convAnterior > etapaBest.conv)
          etapaBest = { vendedorId: p.vendedorId, label: e.label, conv: e.convAnterior };
      }
    });
  }
  if (etapaBest) {
    const eb = etapaBest as { vendedorId: string; label: string; conv: number };
    out.push({ titulo: "Melhor conversão por etapa", vendedorId: eb.vendedorId, valorTexto: `${eb.conv.toFixed(0)}% → ${eb.label}` });
  }

  const ticket = melhor(comDados.filter((p) => p.analise.qtdVendas > 0), (p) => p.analise.ticketMedio, 0);
  if (ticket)
    out.push({
      titulo: "Maior ticket médio",
      vendedorId: ticket.vendedorId,
      valorTexto: ticket.analise.ticketMedio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    });

  const propostas = melhor(comDados, (p) => p.analise.etapas[IDX.reuniao]?.alcancaram ?? 0, 0);
  if (propostas)
    out.push({
      titulo: "Maior volume de propostas",
      vendedorId: propostas.vendedorId,
      valorTexto: `${propostas.analise.etapas[IDX.reuniao]?.alcancaram ?? 0} propostas`,
    });

  const rapido = melhor(
    comDados.filter((p) => p.analise.tempoAteFecharDias !== null),
    (p) => -(p.analise.tempoAteFecharDias as number),
  );
  if (rapido)
    out.push({
      titulo: "Fechamento mais rápido",
      vendedorId: rapido.vendedorId,
      valorTexto: `${(rapido.analise.tempoAteFecharDias as number).toFixed(0)} dia(s) em média`,
    });

  return out;
}
