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
  /** Valor estimado somado dos leads parados HOJE nesta etapa. */
  valorAtuais: number;
  /** Conversão a partir da etapa anterior (null na primeira). */
  convAnterior: number | null;
  /** Tempo médio (dias) que os leads ficaram nesta etapa (null sem dados). */
  tempoMedioDias: number | null;
};

/** Cor própria de cada etapa (identidade LB: azul → dourado → verde;
 *  vermelho reservado para perdidos/alertas). */
export const CORES_ETAPA: Record<LeadStatus, string> = {
  oportunidade: "#60a5fa",
  primeiro_contato: "#6366f1",
  reuniao: "#8b5cf6", // Fazer e passar proposta
  reuniao_agendada: "#06b6d4",
  acompanhamento: "#f5b301",
  fechamento: "#22c55e",
  perdido: "#ef4444",
};

export type AnaliseFunil = {
  etapas: EtapaFunil[];
  totalLeads: number;
  fechados: number;
  perdidos: number;
  /** Valor estimado somado dos leads perdidos (receita perdida). */
  valorPerdidos: number;
  /** % de leads que já foram "perdido" e depois voltaram pro funil. */
  taxaRecuperacao: number | null;
  /** Conversão geral: fechamento / entradas do funil. */
  convGeral: number;
  /** Financeiro: vendas reais no período (se houver) — ticket médio real. */
  qtdVendas: number;
  valorVendido: number;
  ticketMedio: number;
  /** Maior venda individual do período (0 se nenhuma). */
  maiorVenda: number;
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
  const valorAtuais = FUNIL_ORDEM.map(() => 0);
  let perdidos = 0;
  let valorPerdidos = 0;
  let jaPerderam = 0; // leads que passaram por "perdido" em algum momento
  let recuperados = 0; // ...e depois voltaram pra alguma etapa do funil

  for (const l of meus) {
    const ts = trans.get(l.id) ?? [];
    const max = etapaMaxima(l, ts);
    for (let i = 0; i <= max && i < FUNIL_ORDEM.length; i++) {
      alcancaram[i]++;
      valor[i] += l.valorEstimado || 0;
    }
    if (l.status === "perdido") {
      perdidos++;
      valorPerdidos += l.valorEstimado || 0;
    } else if (l.status in IDX) {
      atuais[IDX[l.status]]++;
      valorAtuais[IDX[l.status]] += l.valorEstimado || 0;
    }
    // Recuperação: teve evento "→ perdido" e depois outro pra etapa do funil.
    const iPerdido = ts.findIndex((t) => t.para === "perdido");
    if (iPerdido >= 0 || l.status === "perdido") jaPerderam++;
    if (iPerdido >= 0 && ts.slice(iPerdido + 1).some((t) => t.para !== "perdido")) recuperados++;
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
    valorAtuais: valorAtuais[i],
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
    valorPerdidos,
    taxaRecuperacao: jaPerderam > 0 ? (recuperados / jaPerderam) * 100 : null,
    convGeral: meus.length > 0 ? (fechados / meus.length) * 100 : 0,
    qtdVendas: minhasVendas.length,
    valorVendido,
    ticketMedio: minhasVendas.length > 0 ? valorVendido / minhasVendas.length : 0,
    maiorVenda: minhasVendas.reduce((m, v) => Math.max(m, v.valor), 0),
    tempoAteFecharDias: qtdFechar > 0 ? somaFechar / qtdFechar / 86400000 : null,
  };
}

/* ----------------------- Receita prevista (pipeline ponderado) ---------------- */

/** Receita prevista: valor parado em cada etapa × probabilidade histórica de
 *  chegar ao fechamento a partir dela (produto das conversões seguintes). */
export function receitaPrevista(a: AnaliseFunil): number {
  let total = 0;
  for (let i = 0; i < a.etapas.length - 1; i++) {
    let prob = 1;
    for (let j = i + 1; j < a.etapas.length; j++) {
      const c = a.etapas[j].convAnterior;
      prob *= c === null ? 0.5 : Math.max(0, Math.min(1, c / 100));
    }
    total += a.etapas[i].valorAtuais * prob;
  }
  return total;
}

/* ------------------- Inteligência Comercial (textos variados) ----------------- */

export type Insight = {
  emoji: string;
  titulo: string;
  texto: string;
  tone: "success" | "warn" | "danger" | "brand";
};

/** Escolhe uma formulação variando por dia e pelos próprios dados — a análise
 *  nunca sai com as mesmas frases duas vezes seguidas. */
function variar(opcoes: string[], seed: number): string {
  return opcoes[Math.abs(seed) % opcoes.length];
}

export type EntradaInteligencia = {
  geral: AnaliseFunil;
  anterior: AnaliseFunil | null;
  porVendedor: { vendedorId: string; nome: string; analise: AnaliseFunil }[];
  /** Contexto financeiro do ciclo atual (meta do mês). */
  metaCiclo: number;
  vendidoCiclo: number;
  previsaoCiclo: number;
};

export function inteligenciaComercial(e: EntradaInteligencia, agora: Date = new Date()): Insight[] {
  const out: Insight[] = [];
  const g = e.geral;
  const seedBase = agora.getDate() + g.totalLeads * 7 + g.fechados * 13 + Math.round(g.valorVendido);
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  if (g.totalLeads === 0) {
    return [
      {
        emoji: "🤖",
        titulo: "Sem dados no recorte",
        texto: "Não há leads no período selecionado. Amplie o período para a inteligência trabalhar.",
        tone: "brand",
      },
    ];
  }

  // 1) Onde a empresa mais perde
  let piorIdx = -1;
  let piorConv = 101;
  g.etapas.forEach((et, i) => {
    if (et.convAnterior !== null && g.etapas[i - 1].alcancaram >= 3 && et.convAnterior < piorConv) {
      piorConv = et.convAnterior;
      piorIdx = i;
    }
  });
  if (piorIdx > 0) {
    const de = g.etapas[piorIdx - 1];
    const perda = (100 - piorConv).toFixed(0);
    const valorTravado = brl(de.valorAtuais);
    out.push({
      emoji: "📉",
      titulo: "Onde o dinheiro está escapando",
      texto: variar(
        [
          `${perda}% dos clientes se perdem entre “${de.label}” e “${g.etapas[piorIdx].label}”. Hoje há ${valorTravado} parados em “${de.label}” — cada ponto de conversão recuperado ali vira receita direta. ${SUGESTAO_POR_ETAPA[de.status] ?? ""}`,
          `O maior vazamento do funil está na passagem de “${de.label}” para “${g.etapas[piorIdx].label}”: só ${piorConv.toFixed(0)}% avançam. Com ${valorTravado} aguardando nessa etapa, é o ponto mais lucrativo pra agir. ${SUGESTAO_POR_ETAPA[de.status] ?? ""}`,
          `Se existe um ralo na operação, ele fica em “${de.label}”: ${perda}% não chegam à etapa seguinte. São ${valorTravado} em jogo agora. ${SUGESTAO_POR_ETAPA[de.status] ?? ""}`,
        ],
        seedBase,
      ),
      tone: "danger",
    });
  }

  // 2) Etapa que mais trava (tempo)
  let lentoIdx = -1;
  let lentoDias = 0;
  g.etapas.forEach((et, i) => {
    if (i < g.etapas.length - 1 && et.tempoMedioDias !== null && et.tempoMedioDias > lentoDias) {
      lentoDias = et.tempoMedioDias;
      lentoIdx = i;
    }
  });
  if (lentoIdx >= 0 && lentoDias >= 1) {
    out.push({
      emoji: "⏱️",
      titulo: "A etapa que trava as vendas",
      texto: variar(
        [
          `Os leads passam em média ${lentoDias.toFixed(0)} dia(s) em “${g.etapas[lentoIdx].label}”. Encurtar essa espera é o caminho mais rápido pra acelerar o caixa.`,
          `“${g.etapas[lentoIdx].label}” segura cada negociação por ${lentoDias.toFixed(0)} dia(s) em média — mais do que qualquer outra etapa. Vale criar um prazo-padrão pra essa fase.`,
        ],
        seedBase + 3,
      ),
      tone: "warn",
    });
  }

  // 3) Vendedores: quem precisa de ajuda × quem está voando
  const comBase = e.porVendedor.filter((p) => p.analise.totalLeads >= 3);
  if (comBase.length >= 2) {
    const media = g.convGeral;
    const pior = comBase.reduce((a, b) => (a.analise.convGeral <= b.analise.convGeral ? a : b));
    const melhor = comBase.reduce((a, b) => (a.analise.convGeral >= b.analise.convGeral ? a : b));
    if (melhor.analise.convGeral - media >= 3) {
      out.push({
        emoji: "🌟",
        titulo: "Acima da média",
        texto: variar(
          [
            `${melhor.nome} converte ${melhor.analise.convGeral.toFixed(0)}% — ${(melhor.analise.convGeral - media).toFixed(0)} p.p. acima da empresa. Vale transformar o método em treinamento pros colegas.`,
            `Reconhecimento do período: ${melhor.nome}, com ${melhor.analise.convGeral.toFixed(0)}% de conversão (empresa: ${media.toFixed(0)}%). O que funciona aí merece virar padrão da equipe.`,
          ],
          seedBase + 5,
        ),
        tone: "success",
      });
    }
    if (media - pior.analise.convGeral >= 3 && pior.vendedorId !== melhor.vendedorId) {
      out.push({
        emoji: "🤝",
        titulo: "Precisa de apoio",
        texto: variar(
          [
            `${pior.nome} está convertendo ${pior.analise.convGeral.toFixed(0)}% (${(media - pior.analise.convGeral).toFixed(0)} p.p. abaixo da média). Um acompanhamento próximo nas próximas negociações tende a destravar rápido.`,
            `O número de ${pior.nome} (${pior.analise.convGeral.toFixed(0)}%) pede atenção — está abaixo da média da empresa. Sugestão: revisar juntos as negociações paradas dele no funil.`,
          ],
          seedBase + 7,
        ),
        tone: "warn",
      });
    }
  }

  // 4) Previsão e potencial
  const prevista = receitaPrevista(g);
  const emAberto = g.etapas.slice(0, -1).reduce((s, et) => s + et.valorAtuais, 0);
  out.push({
    emoji: "🔮",
    titulo: "Previsão de faturamento",
    texto: variar(
      [
        `Pelo ritmo atual, o ciclo fecha em torno de ${brl(e.previsaoCiclo)} (meta: ${brl(e.metaCiclo)}; vendido até agora: ${brl(e.vendidoCiclo)}). O funil carrega ${brl(emAberto)} em negociações abertas, com ${brl(prevista)} de receita provável pela conversão histórica.`,
        `Projeção do mês: ~${brl(e.previsaoCiclo)} no ritmo atual — ${e.metaCiclo > 0 ? `${((e.previsaoCiclo / e.metaCiclo) * 100).toFixed(0)}% da meta` : "sem meta definida"}. Há ${brl(emAberto)} em aberto no funil; a inteligência estima ${brl(prevista)} disso como receita provável.`,
      ],
      seedBase + 11,
    ),
    tone: e.metaCiclo > 0 && e.previsaoCiclo >= e.metaCiclo ? "success" : "brand",
  });

  // 5) Ação de hoje
  if (piorIdx > 0) {
    const de = g.etapas[piorIdx - 1];
    out.push({
      emoji: "🎯",
      titulo: "Ação recomendada pra hoje",
      texto: variar(
        [
          `Reúna a equipe por 15 minutos e revise os ${de.atuais} lead(s) parados em “${de.label}” (${brl(de.valorAtuais)}). É a alavanca mais rápida de receita disponível agora.`,
          `Prioridade do dia: os ${de.atuais} negócio(s) em “${de.label}”. Definir a próxima ação de cada um hoje protege ${brl(de.valorAtuais)} de virarem perdidos.`,
        ],
        seedBase + 13,
      ),
      tone: "brand",
    });
  }

  // 6) Evolução vs período anterior
  if (e.anterior && e.anterior.totalLeads > 0) {
    const d = g.convGeral - e.anterior.convGeral;
    if (Math.abs(d) >= 0.5) {
      out.push({
        emoji: d > 0 ? "📈" : "📉",
        titulo: "Evolução",
        texto:
          d > 0
            ? `Conversão geral subiu ${d.toFixed(1)} p.p. em relação ao período anterior (${e.anterior.convGeral.toFixed(1)}% → ${g.convGeral.toFixed(1)}%).`
            : `Conversão geral caiu ${Math.abs(d).toFixed(1)} p.p. vs período anterior (${e.anterior.convGeral.toFixed(1)}% → ${g.convGeral.toFixed(1)}%). Vale investigar o que mudou na rotina.`,
        tone: d > 0 ? "success" : "danger",
      });
    }
  }

  return out;
}

/* ------------------------------ Destaques da empresa -------------------------- */

export type Destaque = { emoji: string; titulo: string; vendedorId: string | null; valorTexto: string };

export function calcularDestaques(
  porVendedor: { vendedorId: string; nome: string; analise: AnaliseFunil }[],
  anteriorPorVendedor: Map<string, AnaliseFunil> | null,
): Destaque[] {
  const out: Destaque[] = [];
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const comDados = porVendedor.filter((p) => p.analise.totalLeads > 0 || p.analise.qtdVendas > 0);
  const best = <T,>(arr: T[], score: (t: T) => number): T | null =>
    arr.reduce<T | null>((acc, x) => (acc === null || score(x) > score(acc) ? x : acc), null);

  const maiorVenda = best(comDados.filter((p) => p.analise.maiorVenda > 0), (p) => p.analise.maiorVenda);
  if (maiorVenda) out.push({ emoji: "💰", titulo: "Maior venda", vendedorId: maiorVenda.vendedorId, valorTexto: brl(maiorVenda.analise.maiorVenda) });

  const conv = best(comDados.filter((p) => p.analise.totalLeads >= 3), (p) => p.analise.convGeral);
  if (conv) out.push({ emoji: "🎯", titulo: "Maior conversão", vendedorId: conv.vendedorId, valorTexto: `${conv.analise.convGeral.toFixed(0)}%` });

  const ticket = best(comDados.filter((p) => p.analise.qtdVendas > 0), (p) => p.analise.ticketMedio);
  if (ticket) out.push({ emoji: "🏷️", titulo: "Maior ticket médio", vendedorId: ticket.vendedorId, valorTexto: brl(ticket.analise.ticketMedio) });

  if (anteriorPorVendedor) {
    const evolucao = best(
      comDados.filter((p) => (anteriorPorVendedor.get(p.vendedorId)?.totalLeads ?? 0) >= 3 && p.analise.totalLeads >= 3),
      (p) => p.analise.convGeral - (anteriorPorVendedor.get(p.vendedorId)?.convGeral ?? 0),
    );
    if (evolucao) {
      const delta = evolucao.analise.convGeral - (anteriorPorVendedor.get(evolucao.vendedorId)?.convGeral ?? 0);
      if (delta > 0) out.push({ emoji: "🚀", titulo: "Maior evolução", vendedorId: evolucao.vendedorId, valorTexto: `+${delta.toFixed(0)} p.p.` });
    }
  }

  const idxProposta = FUNIL_ORDEM.indexOf("reuniao");
  const propostas = best(comDados, (p) => p.analise.etapas[idxProposta]?.alcancaram ?? 0);
  if (propostas && (propostas.analise.etapas[idxProposta]?.alcancaram ?? 0) > 0)
    out.push({ emoji: "📄", titulo: "Mais propostas", vendedorId: propostas.vendedorId, valorTexto: `${propostas.analise.etapas[idxProposta].alcancaram}` });

  const rapido = best(
    comDados.filter((p) => p.analise.tempoAteFecharDias !== null),
    (p) => -(p.analise.tempoAteFecharDias as number),
  );
  if (rapido) out.push({ emoji: "⚡", titulo: "Fechamento mais rápido", vendedorId: rapido.vendedorId, valorTexto: `${(rapido.analise.tempoAteFecharDias as number).toFixed(0)} dia(s)` });

  return out;
}

/* ----------------------------- Diagnóstico (texto) ---------------------------- */

export type Diagnostico = {
  titulo: string;
  texto: string;
  tone: "success" | "warn" | "danger" | "brand";
};

export const SUGESTAO_POR_ETAPA: Record<string, string> = {
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
