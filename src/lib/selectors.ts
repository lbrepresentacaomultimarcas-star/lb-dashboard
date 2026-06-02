import type { Meta, Venda, Vendedor, VendedorComDesempenho } from "./types";
import type { Period } from "./period";
import { monthCoverage } from "./period";
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

// ============================================================
// PERÍODO ARBITRÁRIO — Hoje / Semana / Últimos 3 meses / etc.
// As funções por mês acima continuam pra retrocompatibilidade.
// ============================================================

/** Filtra vendas cuja `data` cai dentro do intervalo [period.from, period.to]. */
export function vendasNoPeriodo(vendas: Venda[], period: Period): Venda[] {
  const from = period.from.getTime();
  const to = period.to.getTime();
  return vendas.filter((v) => {
    const d = new Date(v.data).getTime();
    return d >= from && d <= to;
  });
}

/**
 * Meta efetiva de um vendedor ao longo do período, com rateio proporcional
 * por dia. Para cada mês tocado pelo período, pega a meta daquele mês
 * (específica em `metas` ou fallback pra `vendedor.metaMensal`) e multiplica
 * pela fração de dias cobertos.
 *
 * Ex: período = "últimos 3 meses" (set 18 a dez 18) com meta de R$30k/mês
 *     → meta efetiva ≈ R$30k × (13/30 + 1.0 + 18/31) ≈ R$30k × 1,99 ≈ R$59.7k.
 */
export function metaProporcionalDoVendedor(
  vendedor: Vendedor,
  metas: Meta[],
  period: Period,
): number {
  const cobertura = monthCoverage(period);
  return cobertura.reduce((acc, mc) => {
    const especifica = metas.find(
      (m) => m.vendedorId === vendedor.id && m.anoMes === mc.key,
    );
    const metaMes = especifica?.valor ?? vendedor.metaMensal;
    return acc + metaMes * mc.fraction;
  }, 0);
}

/** Soma das metas proporcionais dos vendedores ATIVOS dentro do período. */
export function metaTotalDoPeriodo(
  vendedores: Vendedor[],
  metas: Meta[],
  period: Period,
): number {
  return vendedores
    .filter((v) => v.ativo)
    .reduce((acc, v) => acc + metaProporcionalDoVendedor(v, metas, period), 0);
}

/**
 * Desempenho por vendedor dentro do período arbitrário.
 *
 * Análogo a `desempenhoPorVendedor`, mas usa meta proporcional.
 * O campo `metaMensal` aqui passa a representar a META EFETIVA do período
 * (não a do mês) — assim o consumidor não precisa saber a diferença.
 */
export function desempenhoPorPeriodo(
  vendedores: Vendedor[],
  vendas: Venda[],
  metas: Meta[],
  period: Period,
): VendedorComDesempenho[] {
  const doPeriodo = vendasNoPeriodo(vendas, period);
  return vendedores.map((v) => {
    const minhas = doPeriodo.filter((s) => s.vendedorId === v.id);
    const vendido = totalFaturado(minhas);
    const metaEf = metaProporcionalDoVendedor(v, metas, period);
    return {
      ...v,
      metaMensal: metaEf,
      vendido,
      vendas: minhas.length,
      comissao: vendido * (v.comissaoPct / 100),
      pctMeta: metaEf > 0 ? (vendido / metaEf) * 100 : 0,
    };
  });
}
