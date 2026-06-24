"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  performanceHistoricoApi,
  useAudit,
  useLeads,
  usePerformanceConfig,
  usePerformanceHistorico,
  useVendas,
  useVendedores,
} from "./store";
import { supabaseEnabled } from "./supabase/client";
import { useCicloProducao } from "./use-ciclo";
import { indicadoresDoVendedor } from "./performance-extract";
import {
  calcularPerformance,
  comparacaoEquipe,
  evolucao,
  type IndicadoresBrutos,
  type ResultadoPerformance,
  type Tendencia,
} from "./performance";
import type { Vendedor } from "./types";

export type LinhaPerformance = {
  vendedor: Vendedor;
  brutos: IndicadoresBrutos;
  resultado: ResultadoPerformance;
  tendencia: Tendencia;
  delta: number;
  comparacao: number;
  notaAnterior: number | null;
};

function chaveAnteriorDe(chave: string): string {
  const [y, m] = chave.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Performance de toda a equipe no ciclo atual: nota, faixa, evolução vs ciclo
 * anterior e comparação com a média. Também grava/atualiza o snapshot do ciclo
 * atual no histórico (idempotente — só escreve quando a nota muda).
 *
 * Obs.: a extração lê leads/vendas/audit do store; para um admin (vê tudo) o
 * ranking é completo; para um vendedor, a RLS limita aos próprios dados.
 */
export function usePerformanceEquipe(): {
  linhas: LinhaPerformance[];
  media: number;
  chave: string;
  chaveAnterior: string;
} {
  const vendedores = useVendedores();
  const vendas = useVendas();
  const leads = useLeads();
  const audit = useAudit();
  const perfConfig = usePerformanceConfig();
  const historico = usePerformanceHistorico();
  const { config: configProd, feriados, chaveAtual } = useCicloProducao();

  const chaveAnterior = useMemo(() => chaveAnteriorDe(chaveAtual), [chaveAtual]);

  const { linhas, media } = useMemo(() => {
    const ativos = vendedores.filter((v) => v.ativo);
    const base = ativos.map((v) => {
      const brutos = indicadoresDoVendedor(
        v.id,
        leads,
        vendas,
        audit,
        chaveAtual,
        configProd,
        feriados,
        perfConfig.metas.diasFrescor,
      );
      return { vendedor: v, brutos, resultado: calcularPerformance(brutos, perfConfig) };
    });
    const media = base.length ? base.reduce((a, b) => a + b.resultado.nota, 0) / base.length : 0;
    const linhas: LinhaPerformance[] = base
      .map((b) => {
        const snapAnt = historico.find(
          (h) => h.vendedorId === b.vendedor.id && h.ciclo === chaveAnterior,
        );
        const notaAnterior = snapAnt ? snapAnt.nota : null;
        const ev = evolucao(b.resultado.nota, notaAnterior, perfConfig.metas.limiarEvolucao);
        return {
          ...b,
          tendencia: ev.tendencia,
          delta: ev.delta,
          comparacao: comparacaoEquipe(b.resultado.nota, media),
          notaAnterior,
        };
      })
      .sort((a, b) => b.resultado.nota - a.resultado.nota);
    return { linhas, media };
  }, [vendedores, leads, vendas, audit, perfConfig, historico, configProd, feriados, chaveAtual, chaveAnterior]);

  // Grava o snapshot do ciclo atual (só quando a nota muda — evita escrita à toa).
  const gravado = useRef("");
  useEffect(() => {
    if (!supabaseEnabled || linhas.length === 0) return;
    const assinatura =
      chaveAtual + "|" + linhas.map((l) => `${l.vendedor.id}:${l.resultado.nota.toFixed(1)}`).join(",");
    if (gravado.current === assinatura) return;
    gravado.current = assinatura;
    for (const l of linhas) {
      const existente = historico.find((h) => h.vendedorId === l.vendedor.id && h.ciclo === chaveAtual);
      const nota = Number(l.resultado.nota.toFixed(2));
      if (existente && Math.abs(existente.nota - nota) < 0.01) continue;
      void performanceHistoricoApi.upsert({
        vendedorId: l.vendedor.id,
        ciclo: chaveAtual,
        nota,
        subConversao: Number(l.resultado.subNotas.conversao.toFixed(2)),
        subFechamentos: Number(l.resultado.subNotas.fechamentos.toFixed(2)),
        subAgendamentos: Number(l.resultado.subNotas.agendamentos.toFixed(2)),
        subPropostas: Number(l.resultado.subNotas.propostas.toFixed(2)),
        subAtualizacao: Number(l.resultado.subNotas.atualizacao.toFixed(2)),
        classificacao: l.resultado.faixa,
      });
    }
  }, [linhas, chaveAtual, historico]);

  return { linhas, media, chave: chaveAtual, chaveAnterior };
}
