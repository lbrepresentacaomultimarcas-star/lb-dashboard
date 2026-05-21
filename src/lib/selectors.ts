import type { Meta, Venda, Vendedor, VendedorComDesempenho } from "./types";
import { monthKey, todayMonth } from "./utils";

export function vendasNoMes(vendas: Venda[], mes = todayMonth()) {
  return vendas.filter((v) => monthKey(v.data) === mes);
}

export function totalFaturado(vendas: Venda[]) {
  return vendas.reduce((acc, v) => acc + v.valor, 0);
}

/** Retorna a meta específica do vendedor no mês, ou cai pro meta_mensal do cadastro. */
export function metaDoVendedor(
  vendedor: Vendedor,
  metas: Meta[],
  mes = todayMonth(),
) {
  const especifica = metas.find(
    (m) => m.vendedorId === vendedor.id && m.anoMes === mes,
  );
  return especifica?.valor ?? vendedor.metaMensal;
}

export function desempenhoPorVendedor(
  vendedores: Vendedor[],
  vendas: Venda[],
  metas: Meta[] = [],
  mes = todayMonth(),
): VendedorComDesempenho[] {
  const doMes = vendasNoMes(vendas, mes);
  return vendedores.map((v) => {
    const minhas = doMes.filter((s) => s.vendedorId === v.id);
    const vendido = totalFaturado(minhas);
    const metaMes = metaDoVendedor(v, metas, mes);
    return {
      ...v,
      metaMensal: metaMes, // sobrescreve com meta efetiva do mês
      vendido,
      vendas: minhas.length,
      comissao: vendido * (v.comissaoPct / 100),
      pctMeta: metaMes > 0 ? (vendido / metaMes) * 100 : 0,
    };
  });
}

export function faturamentoMensal(vendas: Venda[], meses = 12) {
  const agora = new Date();
  const buckets: { mes: string; total: number }[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    buckets.push({ mes: monthKey(d), total: 0 });
  }
  for (const v of vendas) {
    const k = monthKey(v.data);
    const b = buckets.find((b) => b.mes === k);
    if (b) b.total += v.valor;
  }
  return buckets;
}

export function metaTotalDoMes(
  vendedores: Vendedor[],
  metas: Meta[] = [],
  mes = todayMonth(),
) {
  return vendedores
    .filter((v) => v.ativo)
    .reduce((acc, v) => acc + metaDoVendedor(v, metas, mes), 0);
}
