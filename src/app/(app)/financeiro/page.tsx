"use client";

import { useMemo, useState } from "react";
import { DollarSign, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { useMetas, useVendas, useVendedores } from "@/lib/store";
import {
  desempenhoPorVendedor,
  faturamentoMensal,
  totalFaturado,
  vendasNoMes,
} from "@/lib/selectors";
import { brl, monthKey, monthLabel, todayMonth } from "@/lib/utils";
import { StatCard } from "@/components/stat-card";
import { Card, CardTitle } from "@/components/ui/card";

export default function FinanceiroPage() {
  const vendedores = useVendedores();
  const vendas = useVendas();
  const metas = useMetas();

  const mesAtual = todayMonth();
  const mesesDisp = useMemo(() => {
    const set = new Set(vendas.map((v) => monthKey(v.data)));
    set.add(mesAtual);
    return Array.from(set).sort().reverse();
  }, [vendas, mesAtual]);

  const [mes, setMes] = useState(mesAtual);
  const doMes = vendasNoMes(vendas, mes);
  const fatMes = totalFaturado(doMes);
  const desempenho = desempenhoPorVendedor(vendedores, vendas, metas, mes);
  const comissaoTotal = desempenho.reduce((acc, d) => acc + d.comissao, 0);
  const lucroEstimado = fatMes - comissaoTotal;

  const serie = faturamentoMensal(vendas, 6);
  const mediaUltimos = serie.reduce((acc, s) => acc + s.total, 0) / Math.max(serie.length, 1);
  const previsao = mediaUltimos;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Resumo financeiro de {monthLabel(mes)}
          </p>
        </div>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
        >
          {mesesDisp.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Entrada (faturamento)"
          value={brl(fatMes)}
          hint={`${doMes.length} vendas`}
          icon={DollarSign}
          tone="success"
        />
        <StatCard
          title="Comissão a pagar"
          value={brl(comissaoTotal)}
          hint="soma de todos os vendedores"
          icon={Wallet}
          tone="warn"
        />
        <StatCard
          title="Lucro líquido estimado"
          value={brl(lucroEstimado)}
          hint="entrada − comissão"
          icon={PiggyBank}
          tone="brand"
        />
        <StatCard
          title="Previsão (média 6 meses)"
          value={brl(previsao)}
          hint="projeção para o próximo mês"
          icon={TrendingUp}
          tone="neutral"
        />
      </div>

      <Card>
        <CardTitle>Comissão por vendedor — {monthLabel(mes)}</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                <th className="pb-3 pr-4">Vendedor</th>
                <th className="pb-3 pr-4 text-right">Vendido</th>
                <th className="pb-3 pr-4 text-right">% comissão</th>
                <th className="pb-3 text-right">Comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {desempenho.map((d) => (
                <tr key={d.id}>
                  <td className="py-3 pr-4 font-medium">{d.nome}</td>
                  <td className="py-3 pr-4 text-right">{brl(d.vendido)}</td>
                  <td className="py-3 pr-4 text-right text-[var(--color-text-dim)]">
                    {d.comissaoPct}%
                  </td>
                  <td className="py-3 text-right text-[var(--color-success)]">
                    {brl(d.comissao)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-3 pr-4 font-semibold">Total</td>
                <td className="py-3 pr-4 text-right font-semibold">{brl(fatMes)}</td>
                <td className="py-3 pr-4" />
                <td className="py-3 text-right font-semibold text-[var(--color-success)]">
                  {brl(comissaoTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
