"use client";

import { useMemo } from "react";
import { useAudit, useLeads, usePerformanceConfig } from "./store";
import { useCicloProducao } from "./use-ciclo";
import { indicadoresDoVendedor } from "./performance-extract";
import type { IndicadoresBrutos } from "./performance";
import {
  conquistas as calcConquistas,
  destaques as calcDestaques,
  focoDeHoje as calcFoco,
  gargalo as calcGargalo,
  momento as calcMomento,
  temDados,
  type Comparacao,
} from "./evolucao";

/**
 * O mapa de evolução de UMA pessoa.
 *
 * Não mede nada novo: chama `indicadoresDoVendedor`, o mesmo extrator que o
 * módulo Performance usa, uma vez por ciclo. Se um dia a definição de
 * "proposta" mudar lá, muda aqui junto — não existem duas contas.
 *
 * Os dados chegam já escopados: `useLeads` e `useAudit` só trazem o que a
 * pessoa logada pode ver, e a RLS já filtrou antes disso. Um consultor
 * abrindo o próprio perfil não teria como montar o mapa de outro nem
 * passando o id errado — o funil dele simplesmente não estaria ali.
 */
export function useEvolucao(vendedorRef: string | undefined | null, quantosCiclos = 6) {
  const leads = useLeads();
  const audit = useAudit();
  const cfgPerf = usePerformanceConfig();
  const { chaveAtual, config, feriados } = useCicloProducao();

  return useMemo(() => {
    const vazio = {
      temDados: false,
      atual: null as IndicadoresBrutos | null,
      anterior: null as IndicadoresBrutos | null,
      historico: [] as { chave: string; ind: IndicadoresBrutos }[],
      destaques: [] as ReturnType<typeof calcDestaques>,
      gargalo: null as ReturnType<typeof calcGargalo>,
      momento: "",
      foco: "",
      conquistas: [] as ReturnType<typeof calcConquistas>,
    };
    if (!vendedorRef) return vazio;

    // Os últimos N ciclos, do mais antigo para o mais novo.
    const [ano, mes] = chaveAtual.split("-").map(Number);
    const chaves: string[] = [];
    for (let i = quantosCiclos - 1; i >= 0; i--) {
      const d = new Date(ano, mes - 1 - i, 1);
      chaves.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const historico = chaves.map((chave) => ({
      chave,
      ind: indicadoresDoVendedor(
        vendedorRef,
        leads,
        audit,
        chave,
        config,
        feriados,
        cfgPerf.metas.diasFrescor,
      ),
    }));

    const atual = historico[historico.length - 1].ind;
    const anterior = historico.length > 1 ? historico[historico.length - 2].ind : null;
    const comp: Comparacao = { atual, anterior };

    return {
      temDados: temDados(comp),
      atual,
      anterior,
      historico,
      destaques: calcDestaques(comp),
      gargalo: calcGargalo(comp),
      momento: calcMomento(comp),
      foco: calcFoco(comp),
      conquistas: calcConquistas(comp, historico.map((h) => h.ind)),
    };
  }, [vendedorRef, leads, audit, chaveAtual, config, feriados, cfgPerf.metas.diasFrescor, quantosCiclos]);
}
