/**
 * Extração dos indicadores brutos de performance EXCLUSIVAMENTE do funil que já
 * existe: os leads e a MOVIMENTAÇÃO real dos cards entre etapas (audit_log).
 * Nenhum contador paralelo, nenhuma tabela de vendas, nenhum dado que o vendedor
 * precise alimentar. Função PURA (sem store, sem React) → testável isolada.
 *
 * Definições (tudo do funil):
 * - fechados      = chegadas do card em "Fechado" no ciclo (transição "→ fechamento").
 * - perdidos      = chegadas do card em "Perdido" no ciclo (transição "→ perdido").
 * - agendamentos  = transições "→ reuniao_agendada" no ciclo.
 * - propostas     = transições "→ reuniao" (= "fazer e passar proposta") no ciclo.
 * - oportunidades = cards do vendedor trabalhados no ciclo (criados OU movidos).
 * - conversão     = fechados ÷ oportunidades (cálculo do próprio funil, no motor).
 * - leadsAtivos   = cards não fechados/perdidos do vendedor.
 * - leadsAtualizados = ativos movidos/mexidos nos últimos `diasFrescor` dias.
 * Atribuição: cada evento é contado pro DONO ATUAL do lead.
 */
import type { AuditLog, Lead } from "./types";
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
  audit: AuditLog[],
  chave: string,
  configProd: ConfigProducao,
  feriados: Set<string>,
  diasFrescor: number,
): IndicadoresBrutos {
  const leadsV = leads.filter((l) => l.vendedorId === vendedorId);
  const donoDoLead = new Map(leads.map((l) => [l.id, l.vendedorId]));

  // TUDO vem da movimentação dos cards no funil (audit_log "status → etapa").
  let fechados = 0;
  let perdidos = 0;
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
    else if (st === "fechamento") fechados++;
    else if (st === "perdido") perdidos++;
  }
  // cards criados no ciclo também contam como "trabalhados"
  for (const l of leadsV) {
    if (cicloDeData(l.criadoEm, configProd, feriados) === chave) trabalhados.add(l.id);
  }
  const oportunidades = trabalhados.size;

  const ativos = leadsV.filter((l) => l.status !== "fechamento" && l.status !== "perdido");
  const limiteMs = diasFrescor * 86_400_000;
  const agora = Date.now();
  const leadsAtualizados = ativos.filter(
    (l) => agora - new Date(l.atualizadoEm ?? l.criadoEm).getTime() <= limiteMs,
  ).length;

  return {
    fechados,
    perdidos,
    oportunidades,
    agendamentos,
    propostas,
    leadsAtivos: ativos.length,
    leadsAtualizados,
  };
}
