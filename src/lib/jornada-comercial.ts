/**
 * JORNADA COMERCIAL — reconstrução do histórico real de cada negócio.
 *
 * Cálculo puro: entra o que o banco já tem (leads, auditoria, observações,
 * tentativas, eventos da Central, vendas), sai a jornada organizada. Não
 * grava nada, não altera nada, não deduz o que não foi registrado.
 *
 * DUAS REGRAS QUE MUDAM TODOS OS NÚMEROS
 *
 * 1) O CRM grava "status → X" toda vez que o card é SALVO, mesmo quando a
 *    etapa não mudou. No banco de hoje são 3.748 linhas dessas, mas boa parte
 *    é o mesmo card salvo de novo (561 "oportunidade → oportunidade", 432
 *    "reuniao → reuniao"...). Contar linha bruta como movimentação infla
 *    tudo. Aqui, MOVIMENTAÇÃO é só quando a etapa registrada MUDA; o resto
 *    vira `atualizacoes` — atividade real, mas não é andar no funil.
 *
 * 2) Não existe no banco: data/hora do agendamento, comparecimento e não
 *    comparecimento. Não há tabela nem campo. Então estes campos saem como
 *    "não registrado" e NUNCA são adivinhados a partir de outra coisa. O que
 *    dá para afirmar é: quando o card entrou em "Reunião agendada", quantas
 *    vezes entrou (reagendamento) e o que foi registrado depois.
 */

import type { LeadStatus } from "./types";
import { LEAD_STATUS_INFO } from "./types";

/** A frase que o CRM grava na auditoria quando a etapa é escrita. */
const RE_STATUS = /^status → (.+)$/;
/** Carimbo das observações: "[dd/mm/aaaa - hh:mm - Nome]". */
const RE_OBS = /\[(\d{2}\/\d{2}\/\d{4}) - (\d{2}:\d{2}) - ([^\]]+)\]/g;

export const NAO_REGISTRADO = "Não registrado";

/* ------------------------------------------------------------- entradas */

export type LeadBruto = {
  id: string;
  nome: string;
  status: LeadStatus;
  vendedor_id: string | null;
  origem: string | null;
  criado_em: string;
  perdido_em: string | null;
  motivo_perda: string | null;
  observacao: string | null;
  valor_estimado: number | null;
};

export type AuditBruto = {
  entidade: string;
  entidade_id: string | null;
  acao: string;
  detalhes: string | null;
  usuario_email: string | null;
  criado_em: string;
};

export type CentralBruta = {
  id: string;
  lead_id: string | null;
  nome: string;
  recebido_em: string | null;
  distribuido_em: string | null;
  ligacao_iniciada_em: string | null;
  atendido_em: string | null;
  convertido_em: string | null;
};

export type TentativaBruta = {
  lead_id: string;
  acao: string | null;
  resultado: string | null;
  criado_em: string;
};

export type VendaBruta = {
  id: string;
  lead_id: string | null;
  cliente: string;
  valor: number;
  data: string;
  vendedor_id: string | null;
};

/* --------------------------------------------------------------- saídas */

export type TipoEvento =
  | "criado"
  | "central"
  | "etapa"
  | "atualizacao"
  | "observacao"
  | "tentativa"
  | "venda";

export type Evento = {
  em: string;
  tipo: TipoEvento;
  /** Etapa registrada (só em "etapa"/"atualizacao"). */
  etapa?: LeadStatus;
  rotulo: string;
  texto?: string;
  quem?: string;
  /** Dias desde o evento anterior desta jornada. */
  diasDesdeAnterior: number | null;
};

export type Transicao = {
  de: LeadStatus | null;
  para: LeadStatus;
  em: string;
  quem?: string;
  /** Dias que o negócio ficou na etapa anterior. Null na primeira. */
  dias: number | null;
};

export type DesfechoAgendamento =
  | { tipo: "sem_movimento"; rotulo: string }
  | { tipo: "avancou" | "voltou" | "fechou" | "perdido"; etapa: LeadStatus; em: string; dias: number; rotulo: string };

export type Jornada = {
  leadId: string;
  nome: string;
  vendedorId: string | null;
  etapaAtual: LeadStatus;
  criadoEm: string;
  origem: string | null;
  valorEstimado: number | null;
  eventos: Evento[];
  transicoes: Transicao[];
  /** Entradas REAIS na etapa "Reunião agendada". */
  agendamentos: number;
  /** Segunda entrada em diante — é isto que o CRM permite chamar de reagendamento. */
  reagendamentos: number;
  /** O que foi registrado depois do último agendamento. Null se nunca agendou. */
  desfechoAgendamento: DesfechoAgendamento | null;
  primeiroContatoEm: string | null;
  fechamentoEm: string | null;
  vendaEm: string | null;
  vendaValor: number | null;
  perdidoEm: string | null;
  motivoPerda: string | null;
  /** Salvamentos do card sem mudar de etapa. */
  atualizacoes: number;
  observacoes: number;
  ultimoEventoEm: string;
  /** Dias desde o último registro de qualquer tipo. */
  diasParado: number;
  /** Pontos que precisam de conferência humana. Nunca "corrigidos" sozinhos. */
  inconsistencias: string[];
};

const ms = (a: string, b: string) => new Date(b).getTime() - new Date(a).getTime();
const dias = (a: string, b: string) => Math.round((ms(a, b) / 86400000) * 10) / 10;
const rotuloEtapa = (s: string) => LEAD_STATUS_INFO[s as LeadStatus]?.label ?? s;

/** Etapas em que o negócio ainda está vivo (para "parado" fazer sentido). */
const ABERTAS: LeadStatus[] = [
  "oportunidade",
  "primeiro_contato",
  "nao_responde",
  "reuniao",
  "reuniao_agendada",
  "acompanhamento",
];

/** Ordem comercial, para saber se a etapa avançou ou voltou. */
const ORDEM: LeadStatus[] = [
  "oportunidade",
  "primeiro_contato",
  "nao_responde",
  "reuniao",
  "reuniao_agendada",
  "acompanhamento",
  "fechamento",
];
const pos = (s: LeadStatus) => ORDEM.indexOf(s);

/** Observações carimbadas dentro do texto: "[dd/mm/aaaa - hh:mm - Nome] ...". */
export function observacoesDatadas(texto: string | null): { em: string; quem: string; corpo: string }[] {
  const t = (texto ?? "").trim();
  if (!t) return [];
  const achados = [...t.matchAll(RE_OBS)];
  const saida: { em: string; quem: string; corpo: string }[] = [];
  for (let i = 0; i < achados.length; i++) {
    const m = achados[i];
    const ini = (m.index ?? 0) + m[0].length;
    const fim = i + 1 < achados.length ? (achados[i + 1].index ?? t.length) : t.length;
    const [d, mes, ano] = m[1].split("/");
    // Horário local: o carimbo foi escrito na hora do navegador de quem digitou.
    const iso = `${ano}-${mes}-${d}T${m[2]}:00`;
    const quando = new Date(iso);
    if (Number.isNaN(quando.getTime())) continue;
    saida.push({ em: quando.toISOString(), quem: m[3].trim(), corpo: t.slice(ini, fim).trim() });
  }
  return saida;
}

/**
 * Monta a jornada de UM negócio a partir de tudo que existe gravado sobre ele.
 */
export function montarJornada(entrada: {
  lead: LeadBruto;
  audit: AuditBruto[];
  central?: CentralBruta | null;
  tentativas?: TentativaBruta[];
  venda?: VendaBruta | null;
  hoje?: Date;
}): Jornada {
  const { lead } = entrada;
  const hoje = entrada.hoje ?? new Date();
  const eventos: Evento[] = [];
  const inconsistencias: string[] = [];

  // 1) nascimento do negócio
  eventos.push({
    em: lead.criado_em,
    tipo: "criado",
    rotulo: "Entrou no Pipeline",
    texto: lead.origem ? `origem: ${lead.origem}` : undefined,
    diasDesdeAnterior: null,
  });

  // 2) passagem pela Central de Leads, quando veio de lá
  const c = entrada.central;
  if (c) {
    const marcos: [string | null, string][] = [
      [c.recebido_em, "Chegou na Central de Leads"],
      [c.distribuido_em, "Distribuído ao consultor"],
      [c.ligacao_iniciada_em, "Consultor iniciou a ligação"],
      [c.atendido_em, "Cliente atendeu"],
      [c.convertido_em, "Enviado ao Pipeline"],
    ];
    for (const [em, rotulo] of marcos) {
      if (em) eventos.push({ em, tipo: "central", rotulo, diasDesdeAnterior: null });
    }
  }

  // 3) etapas: só é MOVIMENTAÇÃO quando a etapa registrada muda
  const linhas = entrada.audit
    .filter((a) => a.entidade === "lead" && a.entidade_id === lead.id)
    .filter((a) => typeof a.detalhes === "string" && RE_STATUS.test(a.detalhes))
    .map((a) => ({ etapa: (a.detalhes as string).match(RE_STATUS)![1] as LeadStatus, em: a.criado_em, quem: a.usuario_email ?? undefined }))
    .sort((x, y) => x.em.localeCompare(y.em));

  const transicoes: Transicao[] = [];
  let anterior: LeadStatus | null = null;
  let entrouEm: string | null = null;
  let atualizacoes = 0;
  for (const l of linhas) {
    if (l.etapa === anterior) {
      atualizacoes++;
      eventos.push({
        em: l.em,
        tipo: "atualizacao",
        etapa: l.etapa,
        rotulo: `Card salvo (continuou em ${rotuloEtapa(l.etapa)})`,
        quem: l.quem,
        diasDesdeAnterior: null,
      });
      continue;
    }
    transicoes.push({
      de: anterior,
      para: l.etapa,
      em: l.em,
      quem: l.quem,
      dias: entrouEm ? dias(entrouEm, l.em) : dias(lead.criado_em, l.em),
    });
    eventos.push({
      em: l.em,
      tipo: "etapa",
      etapa: l.etapa,
      rotulo: rotuloEtapa(l.etapa),
      quem: l.quem,
      diasDesdeAnterior: null,
    });
    anterior = l.etapa;
    entrouEm = l.em;
  }

  // 4) observações carimbadas (data + autor vêm do próprio texto)
  const obs = observacoesDatadas(lead.observacao);
  for (const o of obs) {
    eventos.push({ em: o.em, tipo: "observacao", rotulo: "Observação", texto: o.corpo, quem: o.quem, diasDesdeAnterior: null });
  }

  // 5) tentativas de contato da etapa "Não responde"
  for (const t of entrada.tentativas ?? []) {
    eventos.push({
      em: t.criado_em,
      tipo: "tentativa",
      rotulo: `Tentativa de contato${t.acao ? ` (${t.acao})` : ""}`,
      texto: t.resultado ?? undefined,
      diasDesdeAnterior: null,
    });
  }

  // 6) venda fechada
  const v = entrada.venda ?? null;
  if (v) {
    eventos.push({ em: v.data, tipo: "venda", rotulo: "Venda registrada", texto: v.cliente, diasDesdeAnterior: null });
  }

  eventos.sort((a, b) => a.em.localeCompare(b.em));
  for (let i = 1; i < eventos.length; i++) {
    eventos[i].diasDesdeAnterior = dias(eventos[i - 1].em, eventos[i].em);
  }

  // ---- agendamentos: entradas REAIS na etapa "Reunião agendada"
  const entradasAg = transicoes.filter((t) => t.para === "reuniao_agendada");
  const agendamentos = entradasAg.length;
  const reagendamentos = Math.max(0, agendamentos - 1);

  let desfecho: DesfechoAgendamento | null = null;
  if (agendamentos > 0) {
    const ultimo = entradasAg[entradasAg.length - 1];
    const depois = transicoes.find((t) => t.em > ultimo.em);
    if (!depois) {
      desfecho = { tipo: "sem_movimento", rotulo: "Sem movimentação registrada depois do agendamento" };
    } else {
      const d = dias(ultimo.em, depois.em);
      const tipo =
        depois.para === "fechamento" ? "fechou"
          : depois.para === "perdido" ? "perdido"
            : pos(depois.para) > pos("reuniao_agendada") ? "avancou"
              : "voltou";
      const rotulo =
        tipo === "fechou" ? "Fechou depois do agendamento"
          : tipo === "perdido" ? "Perdido depois do agendamento"
            : tipo === "avancou" ? `Avançou para ${rotuloEtapa(depois.para)}`
              : `Voltou para ${rotuloEtapa(depois.para)}`;
      desfecho = { tipo, etapa: depois.para, em: depois.em, dias: d, rotulo };
    }
  }

  const primeiroContato = transicoes.find((t) => t.para === "primeiro_contato");
  const fechamento = transicoes.find((t) => t.para === "fechamento");
  const ultimoEvento = eventos[eventos.length - 1];

  // ---- inconsistências: mostrar, nunca consertar sozinho
  if (transicoes.length === 0 && lead.status !== "oportunidade") {
    inconsistencias.push(`Está em "${rotuloEtapa(lead.status)}" mas não tem nenhuma movimentação gravada.`);
  }
  const ultimaEtapa = transicoes.length ? transicoes[transicoes.length - 1].para : null;
  if (ultimaEtapa && ultimaEtapa !== lead.status) {
    inconsistencias.push(
      `A última movimentação gravada foi para "${rotuloEtapa(ultimaEtapa)}", mas o card está em "${rotuloEtapa(lead.status)}".`,
    );
  }
  if (lead.status === "fechamento" && !v) {
    inconsistencias.push("Está na etapa Fechamento, mas não existe venda registrada para este negócio.");
  }
  if (lead.status === "perdido" && !lead.motivo_perda) {
    inconsistencias.push("Marcado como perdido sem motivo registrado.");
  }
  if (desfecho?.tipo === "sem_movimento") {
    inconsistencias.push("Tem agendamento registrado, mas nenhum resultado depois dele.");
  }

  return {
    leadId: lead.id,
    nome: lead.nome,
    vendedorId: lead.vendedor_id,
    etapaAtual: lead.status,
    criadoEm: lead.criado_em,
    origem: lead.origem,
    valorEstimado: lead.valor_estimado,
    eventos,
    transicoes,
    agendamentos,
    reagendamentos,
    desfechoAgendamento: desfecho,
    primeiroContatoEm: primeiroContato?.em ?? null,
    fechamentoEm: fechamento?.em ?? null,
    vendaEm: v?.data ?? null,
    vendaValor: v?.valor ?? null,
    perdidoEm: lead.perdido_em,
    motivoPerda: lead.motivo_perda,
    atualizacoes,
    observacoes: obs.length,
    ultimoEventoEm: ultimoEvento.em,
    diasParado: ABERTAS.includes(lead.status) ? dias(ultimoEvento.em, hoje.toISOString()) : 0,
    inconsistencias,
  };
}

/* --------------------------------------------------------------- período */

export type Periodo = { de: Date; ate: Date; rotulo: string };

/** Semana (segunda a domingo), quinzena, mês ou intervalo escolhido. */
export function periodoDe(tipo: "semana" | "quinzena" | "mes" | "personalizado", ref: Date, de?: Date, ate?: Date): Periodo {
  const zerar = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const fim = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  if (tipo === "personalizado" && de && ate) {
    return { de: zerar(de), ate: fim(ate), rotulo: "Período escolhido" };
  }
  if (tipo === "mes") {
    const i = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const f = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { de: zerar(i), ate: fim(f), rotulo: "Mês" };
  }
  if (tipo === "quinzena") {
    const i = new Date(ref);
    i.setDate(i.getDate() - 14);
    return { de: zerar(i), ate: fim(ref), rotulo: "Últimos 15 dias" };
  }
  // semana comercial: segunda a domingo da semana da data de referência
  const d = new Date(ref);
  const diaSemana = (d.getDay() + 6) % 7; // 0 = segunda
  const i = new Date(d);
  i.setDate(d.getDate() - diaSemana);
  const f = new Date(i);
  f.setDate(i.getDate() + 6);
  return { de: zerar(i), ate: fim(f), rotulo: "Semana (segunda a domingo)" };
}

const dentro = (iso: string, p: Periodo) => {
  const t = new Date(iso).getTime();
  return t >= p.de.getTime() && t <= p.ate.getTime();
};

/* ----------------------------------------------------- resumo por consultor */

export type ResumoConsultor = {
  vendedorId: string | null;
  nome: string;
  /** Negócios que tiveram QUALQUER registro dentro do período. */
  negociosComMovimento: number;
  movimentacoes: number;
  atualizacoes: number;
  observacoes: number;
  /** Entradas reais em "Reunião agendada" dentro do período. */
  agendamentos: number;
  reagendamentos: number;
  primeirosContatos: number;
  acompanhamentos: number;
  fechamentos: number;
  perdidos: number;
  vendas: number;
  valorVendido: number;
  /** Negócios abertos parados há mais de 7 dias (qualquer data). */
  parados7: number;
  /** Negócios abertos parados há mais de 15 dias. */
  parados15: number;
  /** Média de dias entre entrar no Pipeline e o primeiro contato registrado. */
  diasAtePrimeiroContato: number | null;
  /** Agendamentos sem nenhum registro depois. */
  agendamentosSemResultado: number;
  inconsistencias: number;
};

export function resumirPorConsultor(
  jornadas: Jornada[],
  periodo: Periodo,
  nomePorId: Record<string, string>,
): ResumoConsultor[] {
  const mapa = new Map<string, ResumoConsultor>();
  const base = (id: string | null): ResumoConsultor => ({
    vendedorId: id,
    nome: (id && nomePorId[id]) || "Sem consultor",
    negociosComMovimento: 0,
    movimentacoes: 0,
    atualizacoes: 0,
    observacoes: 0,
    agendamentos: 0,
    reagendamentos: 0,
    primeirosContatos: 0,
    acompanhamentos: 0,
    fechamentos: 0,
    perdidos: 0,
    vendas: 0,
    valorVendido: 0,
    parados7: 0,
    parados15: 0,
    diasAtePrimeiroContato: null,
    agendamentosSemResultado: 0,
    inconsistencias: 0,
  });

  const tempos: Record<string, number[]> = {};

  for (const j of jornadas) {
    const chave = j.vendedorId ?? "__sem__";
    if (!mapa.has(chave)) mapa.set(chave, base(j.vendedorId));
    const r = mapa.get(chave)!;

    const eventosNoPeriodo = j.eventos.filter((e) => dentro(e.em, periodo));
    if (eventosNoPeriodo.length > 0) r.negociosComMovimento++;

    for (const e of eventosNoPeriodo) {
      if (e.tipo === "etapa") {
        r.movimentacoes++;
        if (e.etapa === "reuniao_agendada") r.agendamentos++;
        if (e.etapa === "primeiro_contato") r.primeirosContatos++;
        if (e.etapa === "acompanhamento") r.acompanhamentos++;
        if (e.etapa === "fechamento") r.fechamentos++;
        if (e.etapa === "perdido") r.perdidos++;
      } else if (e.tipo === "atualizacao") r.atualizacoes++;
      else if (e.tipo === "observacao") r.observacoes++;
      else if (e.tipo === "venda") {
        r.vendas++;
        r.valorVendido += j.vendaValor ?? 0;
      }
    }

    // reagendamento no período: 2ª entrada em diante que caiu no intervalo
    const agNoPeriodo = j.transicoes.filter((t) => t.para === "reuniao_agendada" && dentro(t.em, periodo));
    const agAntes = j.transicoes.filter((t) => t.para === "reuniao_agendada" && new Date(t.em) < periodo.de).length;
    for (let i = 0; i < agNoPeriodo.length; i++) if (agAntes + i > 0) r.reagendamentos++;

    if (j.desfechoAgendamento?.tipo === "sem_movimento") r.agendamentosSemResultado++;
    if (j.diasParado > 15) r.parados15++;
    else if (j.diasParado > 7) r.parados7++;
    r.inconsistencias += j.inconsistencias.length;

    if (j.primeiroContatoEm) {
      (tempos[chave] ||= []).push(dias(j.criadoEm, j.primeiroContatoEm));
    }
  }

  for (const [chave, lista] of Object.entries(tempos)) {
    const r = mapa.get(chave);
    if (r && lista.length) {
      r.diasAtePrimeiroContato = Math.round((lista.reduce((a, b) => a + b, 0) / lista.length) * 10) / 10;
    }
  }

  return [...mapa.values()].sort((a, b) => b.movimentacoes - a.movimentacoes);
}

/* ------------------------------------------------------------- cobertura */

export type Cobertura = {
  leads: number;
  comHistorico: number;
  semHistorico: number;
  movimentacoes: number;
  atualizacoes: number;
  observacoesDatadas: number;
  agendamentos: number;
  reagendamentos: number;
  agendamentosSemResultado: number;
  inconsistencias: number;
  /** Negócios sem informação suficiente para qualquer conclusão de jornada. */
  semInformacaoSuficiente: number;
};

/** O quanto dá para afirmar com o que está gravado. Vai na tela, de propósito. */
export function cobertura(jornadas: Jornada[]): Cobertura {
  const c: Cobertura = {
    leads: jornadas.length,
    comHistorico: 0,
    semHistorico: 0,
    movimentacoes: 0,
    atualizacoes: 0,
    observacoesDatadas: 0,
    agendamentos: 0,
    reagendamentos: 0,
    agendamentosSemResultado: 0,
    inconsistencias: 0,
    semInformacaoSuficiente: 0,
  };
  for (const j of jornadas) {
    if (j.transicoes.length > 0) c.comHistorico++;
    else c.semHistorico++;
    c.movimentacoes += j.transicoes.length;
    c.atualizacoes += j.atualizacoes;
    c.observacoesDatadas += j.observacoes;
    c.agendamentos += j.agendamentos;
    c.reagendamentos += j.reagendamentos;
    if (j.desfechoAgendamento?.tipo === "sem_movimento") c.agendamentosSemResultado++;
    c.inconsistencias += j.inconsistencias.length;
    if (j.transicoes.length === 0 && j.observacoes === 0) c.semInformacaoSuficiente++;
  }
  return c;
}
