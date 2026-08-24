// Contador de pendências da Central de Leads.
//
// Módulo PURO (sem React, sem browser, sem Supabase) — dá para testar fora do
// navegador, que é onde regra de contagem erra em silêncio.
//
// A pergunta que este arquivo responde é uma só: "quantos leads estão parados
// esperando alguém?". Ela tem duas respostas conforme quem pergunta:
//
//   • CONSULTOR  → leads que são dele e que ninguém tocou ainda.
//   • ADMIN      → leads que ainda não têm dono, porque distribuir é tarefa dele.
//
// Não inventa estado novo: usa o `status` que a Central já mantém. Um lead vira
// "aguardando" quando é distribuído e sai desse status no primeiro atendimento
// (LIGAR, mensagem, ATENDEU). Ou seja, o contador cai quando alguém REALMENTE
// trabalha o lead — receber a notificação não faz o número mudar.

import type { CentralLead, CentralLeadStatus } from "./types";

/** Distribuído e ainda intocado. É o que o contador conta. */
export const STATUS_PENDENTE: CentralLeadStatus = "aguardando";

/** Tentou ligar e não atenderam — precisa de nova tentativa. */
export const STATUS_PERDA_LIGACAO: CentralLeadStatus = "nao_atendeu";

/** Houve contato de verdade. */
export const STATUS_ATENDIDOS: CentralLeadStatus[] = ["em_atendimento", "aguardando_resposta", "convertido"];

/** Lead que conta para qualquer número: fora os de teste e os excluídos. */
export const contavel = (l: CentralLead) => !l.teste && !l.excluidoEm;

/** Já saiu da mesa do admin — tem consultor. */
export const enviado = (l: CentralLead) => l.status !== "novo" && !!l.vendedorId;

/**
 * Quantos leads estão parados esperando ESTA pessoa.
 *
 * `vendedorRef` vazio (admin) devolve os que ainda não foram distribuídos —
 * a pendência de quem distribui é diferente da de quem atende.
 */
export function pendentesDe(leads: CentralLead[], vendedorRef?: string): CentralLead[] {
  return leads.filter((l) => {
    if (!contavel(l)) return false;
    if (!vendedorRef) return l.status === "novo";
    return l.vendedorId === vendedorRef && l.status === STATUS_PENDENTE;
  });
}

export type ResumoConsultor = {
  vendedorId: string;
  /** Tudo que já foi para ele, em qualquer situação. */
  enviados: number;
  /** Parados, sem nenhum toque. É o número da cobrança. */
  pendentes: number;
  emAtendimento: number;
  perdaLigacao: number;
  concluidos: number;
};

/** O detalhamento por consultor que o gestor precisa para bater o olho. */
export function resumoPorConsultor(leads: CentralLead[]): Map<string, ResumoConsultor> {
  const m = new Map<string, ResumoConsultor>();
  for (const l of leads) {
    if (!contavel(l) || !enviado(l)) continue;
    const id = l.vendedorId as string;
    const r =
      m.get(id) ??
      { vendedorId: id, enviados: 0, pendentes: 0, emAtendimento: 0, perdaLigacao: 0, concluidos: 0 };
    r.enviados++;
    if (l.status === STATUS_PENDENTE) r.pendentes++;
    else if (l.status === STATUS_PERDA_LIGACAO) r.perdaLigacao++;
    else if (l.status === "convertido") r.concluidos++;
    else if (l.status === "em_atendimento" || l.status === "aguardando_resposta") r.emAtendimento++;
    m.set(id, r);
  }
  return m;
}

/** As faixas da fila. Cada uma é um filtro de verdade, não etiqueta. */
export type FaixaCentral = "novos" | "enviados" | "pendentes" | "perda_ligacao" | "atendidos";

export function naFaixa(l: CentralLead, faixa: FaixaCentral): boolean {
  switch (faixa) {
    case "novos":
      return l.status === "novo";
    case "enviados":
      return enviado(l);
    case "pendentes":
      return enviado(l) && l.status === STATUS_PENDENTE;
    case "perda_ligacao":
      return enviado(l) && l.status === STATUS_PERDA_LIGACAO;
    case "atendidos":
      return enviado(l) && STATUS_ATENDIDOS.includes(l.status);
  }
}

/** Quantos há em cada faixa — para os números das abas. */
export function contarFaixas(leads: CentralLead[]): Record<FaixaCentral, number> {
  const c: Record<FaixaCentral, number> = {
    novos: 0,
    enviados: 0,
    pendentes: 0,
    perda_ligacao: 0,
    atendidos: 0,
  };
  for (const l of leads) {
    if (!contavel(l)) continue;
    for (const f of ["novos", "enviados", "pendentes", "perda_ligacao", "atendidos"] as FaixaCentral[]) {
      if (naFaixa(l, f)) c[f]++;
    }
  }
  return c;
}
