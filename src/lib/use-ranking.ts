"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser, supabaseEnabled } from "./supabase/client";
import { desempenhoPorVendedor } from "./selectors";
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
