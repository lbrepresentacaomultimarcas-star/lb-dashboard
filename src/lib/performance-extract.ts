/**
 * Extração dos indicadores brutos de performance a partir dos dados que JÁ
 * existem (leads, vendas, audit_log), por vendedor e por CICLO de produção.
 * Função PURA (sem store, sem React) → testável isolada.
 *
 * Definições (v1, documentadas):
 * - fechados      = vendas do vendedor no ciclo (cicloDeData(venda.data)).
 * - agendamentos  = transições "→ reuniao_agendada" no ciclo (audit_log),
 *                   atribuídas ao DONO ATUAL do lead.
 * - propostas     = transições "→ reuniao" (= "fazer e passar proposta") no ciclo.
 * - oportunidades = leads do vendedor trabalhados no ciclo (criados no ciclo OU
 *                   com evento no ciclo); nunca menos que os fechados.
 * - leadsAtivos   = leads não fechados/perdidos do vendedor.
 * - leadsAtualizados = ativos mexidos nos últimos `diasFrescor` dias.
 */
import type { AuditLog, Lead, Venda } from "./types";
import { cicloDeData, type ConfigProducao } from "./ciclo";
import type { IndicadoresBrutos } from "./performance";

/** Extrai o status alvo de um detalhe de audit "status → reuniao_agendada". */
export function statusDoEvento(detalhes?: string): string | null {
  if (!detalhes) return null;
  const m = /→\s*([a-z_]+)/i.exec(detalhes);
  return m ? m[1].toLowerCase() : null;
}

export function indicadoresDoVendedor(
  vendedorId: string,
  leads: Lead[],
  vendas: Venda[],
  audit: AuditLog[],
  chave: string,
  configProd: ConfigProducao,
  feriados: Set<string>,
  diasFrescor: number,
): IndicadoresBrutos {
  const leadsV = leads.filter((l) => l.vendedorId === vendedorId);
  const donoDoLead = new Map(leads.map((l) => [l.id, l.vendedorId]));

  const fechados = vendas.filter(
    (s) => s.vendedorId === vendedorId && cicloDeData(s.data, configProd, feriados) === chave,
  ).length;

  let agendamentos = 0;
  let propostas = 0;
  const trabalhados = new Set<string>();
  for (const a of audit) {
    if (a.entidade !== "lead" || !a.entidadeId) continue;
    if (donoDoLead.get(a.entidadeId) !== vendedorId) continue;
    if (cicloDeData(a.criadoEm, configProd, feriados) !== chave) continue;
    trabalhados.add(a.entidadeId);
    const st = statusDoEvento(a.detalhes);
    if (st === "reuniao_agendada") agendamentos++;
    else if (st === "reuniao") propostas++;
  }
  // leads criados no ciclo também contam como "trabalhados"
  for (const l of leadsV) {
    if (cicloDeData(l.criadoEm, configProd, feriados) === chave) trabalhados.add(l.id);
  }
  const oportunidades = Math.max(trabalhados.size, fechados);

  const ativos = leadsV.filter((l) => l.status !== "fechamento" && l.status !== "perdido");
  const limiteMs = diasFrescor * 86_400_000;
  const agora = Date.now();
  const leadsAtualizados = ativos.filter(
    (l) => agora - new Date(l.atualizadoEm ?? l.criadoEm).getTime() <= limiteMs,
  ).length;

  return {
    fechados,
    oportunidades,
    agendamentos,
    propostas,
    leadsAtivos: ativos.length,
    leadsAtualizados,
  };
}
