"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  carregarAuditDeLeads,
  performanceHistoricoApi,
  useAudit,
  useImpersonacao,
  useLeads,
  usePerformanceConfig,
  usePerformanceHistorico,
  useReady,
  useSession,
  useVendedores,
} from "./store";
import { supabaseEnabled } from "./supabase/client";
import { useCicloProducao } from "./use-ciclo";
import { cicloPorChave } from "./ciclo";
import { indicadoresDoVendedor } from "./performance-extract";
import {
  calcularPerformance,
  comparacaoEquipe,
  evolucao,
  type IndicadoresBrutos,
  faixaDeNota,
  type ResultadoPerformance,
  type Tendencia,
} from "./performance";
import type { AuditLog, Vendedor } from "./types";

export type LinhaPerformance = {
  vendedor: Vendedor;
  brutos: IndicadoresBrutos;
  resultado: ResultadoPerformance;
  tendencia: Tendencia;
  delta: number;
  comparacao: number;
  notaAnterior: number | null;
};

/** Uma busca por pessoa e ciclo, mesmo com várias telas usando o índice. */
const auditDoCiclo = new Map<string, Promise<AuditLog[]>>();

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
  const leads = useLeads();
  const auditRecente = useAudit();
  const session = useSession();
  const impersonando = useImpersonacao();
  const ready = useReady();
  const perfConfig = usePerformanceConfig();
  const historico = usePerformanceHistorico();
  const { config: configProd, feriados, chaveAtual } = useCicloProducao();

  const chaveAnterior = useMemo(() => chaveAnteriorDe(chaveAtual), [chaveAtual]);

  /*
   * SÓ QUEM ENXERGA TUDO PODE CALCULAR E GRAVAR A NOTA DA EQUIPE.
   *
   * O consultor só recebe os próprios leads. Calculando os colegas com isso, a
   * nota deles dava quase zero, e esse valor era SALVO no histórico da empresa.
   * Agora ele lê a nota oficial dos colegas e nunca grava.
   */
  const visaoCompleta = session?.papel === "admin" && !impersonando;
  const idSessao = session?.id;
  const [auditCiclo, setAuditCiclo] = useState<{ chave: string; itens: AuditLog[] } | null>(null);
  const chaveAudit = `${idSessao}|${chaveAtual}`;

  useEffect(() => {
    if (!supabaseEnabled || !ready || !visaoCompleta) return;
    let vivo = true;
    let busca = auditDoCiclo.get(chaveAudit);
    if (!busca) {
      // um dia de folga: o evento pode cair na virada do fuso
      const inicio = new Date(cicloPorChave(chaveAtual, configProd, feriados).inicio.getTime() - 86_400_000);
      busca = carregarAuditDeLeads(inicio);
      auditDoCiclo.set(chaveAudit, busca);
      busca.catch(() => auditDoCiclo.delete(chaveAudit)); // tenta de novo na próxima abertura
    }
    busca
      .then((itens) => {
        if (vivo) setAuditCiclo({ chave: chaveAudit, itens });
      })
      .catch(() => {
        /* sem o histórico completo, a nota só não é gravada */
      });
    return () => {
      vivo = false;
    };
  }, [ready, visaoCompleta, chaveAudit, chaveAtual, configProd, feriados]);

  const auditCompleto = auditCiclo?.chave === chaveAudit;
  const audit = useMemo(() => {
    if (!auditCompleto || !auditCiclo) return auditRecente;
    const porId = new Map(auditCiclo.itens.map((a) => [a.id, a]));
    for (const a of auditRecente) porId.set(a.id, a);
    return [...porId.values()];
  }, [auditCompleto, auditCiclo, auditRecente]);

  const { linhas, media } = useMemo(() => {
    const vendedorProprio = session?.vendedorId;
    const ativos = vendedores.filter((v) => v.ativo);
    const base = ativos.map((v) => {
      const brutos = indicadoresDoVendedor(
        v.id,
        leads,
        audit,
        chaveAtual,
        configProd,
        feriados,
        perfConfig.metas.diasFrescor,
      );
      const calculado = calcularPerformance(brutos, perfConfig);
      const oficial =
        supabaseEnabled && !visaoCompleta && v.id !== vendedorProprio
          ? historico.find((h) => h.vendedorId === v.id && h.ciclo === chaveAtual)
          : undefined;
      const resultado: ResultadoPerformance = oficial
        ? {
            ...calculado,
            nota: oficial.nota,
            faixa: faixaDeNota(oficial.nota),
            subNotas: {
              conversao: oficial.subConversao,
              fechamentos: oficial.subFechamentos,
              agendamentos: oficial.subAgendamentos,
              propostas: oficial.subPropostas,
              atualizacao: oficial.subAtualizacao,
            },
          }
        : calculado;
      return { vendedor: v, brutos, resultado };
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
  }, [vendedores, leads, audit, perfConfig, historico, configProd, feriados, chaveAtual, chaveAnterior, visaoCompleta, session?.vendedorId]);

  // Grava o snapshot do ciclo atual (só quando a nota muda — evita escrita à toa).
  const gravado = useRef("");
  useEffect(() => {
    // Grava só com todos os dados na mão: admin real, carga pronta e ciclo completo.
    if (!supabaseEnabled || !ready || !visaoCompleta || !auditCompleto || linhas.length === 0) return;
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
      }).catch(() => {
        gravado.current = ""; // falhou: tenta de novo na próxima mudança
      });
    }
  }, [linhas, chaveAtual, historico, ready, visaoCompleta, auditCompleto]);

  return { linhas, media, chave: chaveAtual, chaveAnterior };
}
