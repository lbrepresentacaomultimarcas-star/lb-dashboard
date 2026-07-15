"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser, supabaseEnabled } from "./supabase/client";
import { desempenhoPorPeriodo, desempenhoPorVendedor } from "./selectors";
import type { Period } from "./period";
import { useRefreshTick } from "./refresh";
import { CONFIG_PRODUCAO_PADRAO, type ConfigProducao } from "./ciclo";
import type { Meta, Venda, Vendedor, VendedorComDesempenho } from "./types";

type RpcRow = {
  vendedor_id: string;
  nome: string;
  meta: number | string;
  vendido: number | string;
  vendas_count: number | string;
  comissao: number | string;
  pct_meta: number | string;
};

/**
 * Ranking mensal org-wide.
 * Usa a RPC `ranking_mensal` (security definer) que devolve só agregados —
 * assim o vendedor enxerga a posição de todos SEM ver vendas individuais.
 * Se a RPC não existir (ou modo demo), cai no cálculo local do store.
 */
export function useRankingMensal(
  anoMes: string,
  vendedores: Vendedor[],
  vendas: Venda[],
  metas: Meta[],
): VendedorComDesempenho[] {
  const local = desempenhoPorVendedor(vendedores, vendas, metas, anoMes).sort(
    (a, b) => b.vendido - a.vendido,
  );
  const [rpcRows, setRpcRows] = useState<VendedorComDesempenho[] | null>(null);

  useEffect(() => {
    if (!supabaseEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRpcRows(null);
      return;
    }
    let alive = true;
    supabaseBrowser()
      .rpc("ranking_mensal", { p_ano_mes: anoMes })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !Array.isArray(data)) {
          setRpcRows(null);
          return;
        }
        const mapped: VendedorComDesempenho[] = (data as RpcRow[]).map((r) => ({
          id: r.vendedor_id,
          nome: r.nome,
          email: "",
          ativo: true,
          criadoEm: "",
          comissaoPct: 0,
          metaMensal: Number(r.meta),
          vendido: Number(r.vendido),
          vendas: Number(r.vendas_count),
          comissao: Number(r.comissao),
          pctMeta: Number(r.pct_meta),
        }));
        setRpcRows(mapped);
      });
    return () => {
      alive = false;
    };
  }, [anoMes]);

  return rpcRows ?? local;
}

/* --------------------------------------------------------------------------
 * Fonte única org-wide: RPC `ranking_dados` (security definer).
 *
 * O RLS faz o vendedor logado enxergar só os PRÓPRIOS dados — por isso o
 * ranking no celular aparecia só com ele mesmo, com números diferentes do
 * desktop (admin vê tudo). A RPC devolve o MESMO pacote de dados (vendedores,
 * metas, vendas anônimas, feriados e config de ciclo) para qualquer papel, e
 * a pontuação é calculada aqui com a MESMA função do desktop
 * (`desempenhoPorPeriodo`) → mesma consulta, mesma ordenação, mesmos filtros,
 * mesmo cálculo. (migration-ranking.sql)
 * ------------------------------------------------------------------------ */

type DadosRpc = {
  vendedores?: {
    id: string;
    nome: string;
    ativo: boolean;
    comissaoPct: number | string;
    metaMensal: number | string;
  }[];
  metas?: { vendedorId: string; anoMes: string; valor: number | string }[];
  vendas?: { vendedorId: string; data: string; valor: number | string }[];
  feriados?: string[];
  config?: {
    diaBase: number;
    prorrogarDiaUtil: boolean;
    considerarSabDom: boolean;
    considerarFeriados: boolean;
    inicioProximoCiclo: ConfigProducao["inicioProximoCiclo"];
    dataInicioRegra: string;
  } | null;
};

/** Folga nas datas pedidas à RPC: a bucketização por CICLO de produção
 *  (fechamento dia 20) pode puxar vendas de fora do intervalo exibido. */
const FOLGA_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * Ranking por período arbitrário (Hoje / Semana / Mês / Ciclo / etc.).
 *
 * Busca o pacote org-wide na RPC `ranking_dados` (igual pra todos os papéis,
 * desktop e mobile) e calcula com a MESMA lógica local do desktop. Atualiza
 * sozinho: ao montar, ao trocar o período, no refresh global (tick do
 * refreshNow/auto-refresh) e sempre que o app volta a ficar visível (PWA
 * reaberto do background). Sem a RPC (ou em demo), cai no cálculo local —
 * comportamento antigo preservado.
 */
export function useRankingPeriodo(
  period: Period,
  vendedores: Vendedor[],
  vendas: Venda[],
  metas: Meta[],
  config: ConfigProducao = CONFIG_PRODUCAO_PADRAO,
  feriados: Set<string> = new Set(),
): VendedorComDesempenho[] {
  const local = desempenhoPorPeriodo(vendedores, vendas, metas, period, config, feriados).sort(
    (a, b) => b.vendido - a.vendido,
  );
  const [dados, setDados] = useState<DadosRpc | null>(null);
  const tick = useRefreshTick();
  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();

  useEffect(() => {
    if (!supabaseEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDados(null);
      return;
    }
    let alive = true;
    const buscar = () => {
      supabaseBrowser()
        .rpc("ranking_dados", {
          p_from: new Date(fromMs - FOLGA_MS).toISOString(),
          p_to: new Date(toMs + FOLGA_MS).toISOString(),
        })
        .then(({ data, error }) => {
          if (!alive) return;
          setDados(error || !data ? null : (data as DadosRpc));
        });
    };
    buscar();
    // App/aba volta a ficar visível (celular reaberto) → dados novos na hora.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [fromMs, toMs, tick]);

  const viaRpc = useMemo(() => {
    if (!dados?.vendedores?.length) return null;
    const vs: Vendedor[] = dados.vendedores.map((v) => ({
      id: v.id,
      nome: v.nome,
      email: "",
      metaMensal: Number(v.metaMensal) || 0,
      comissaoPct: Number(v.comissaoPct) || 0,
      ativo: Boolean(v.ativo),
      criadoEm: "",
    }));
    const ms: Meta[] = (dados.metas ?? []).map((m, i) => ({
      id: `rpc-m${i}`,
      vendedorId: m.vendedorId,
      anoMes: m.anoMes,
      valor: Number(m.valor) || 0,
      criadoEm: "",
    }));
    const ss: Venda[] = (dados.vendas ?? []).map((s, i) => ({
      id: `rpc-v${i}`,
      vendedorId: s.vendedorId,
      cliente: "",
      valor: Number(s.valor) || 0,
      data: s.data,
    }));
    const fs = new Set<string>(dados.feriados ?? []);
    const cfg: ConfigProducao = dados.config
      ? {
          diaBase: Number(dados.config.diaBase),
          prorrogarDiaUtil: Boolean(dados.config.prorrogarDiaUtil),
          considerarSabDom: Boolean(dados.config.considerarSabDom),
          considerarFeriados: Boolean(dados.config.considerarFeriados),
          inicioProximoCiclo: dados.config.inicioProximoCiclo,
          dataInicioRegra: dados.config.dataInicioRegra,
        }
      : config;
    // MESMO cálculo do desktop, sobre os dados org-wide.
    return desempenhoPorPeriodo(vs, ss, ms, period, cfg, fs).sort((a, b) => b.vendido - a.vendido);
    // period é recriado a cada render pela página; as dependências primitivas
    // (fromMs/toMs/cicloKey) capturam qualquer mudança real dele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, fromMs, toMs, period.cicloKey]);

  return viaRpc ?? local;
}
