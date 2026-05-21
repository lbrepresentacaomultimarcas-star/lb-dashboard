"use client";

import { DollarSign, Sparkles, Target, TrendingUp, UserCircle, Users } from "lucide-react";
import { useClientes, useLeads, useMetas, useVendas, useVendedores } from "@/lib/store";
import {
  desempenhoPorVendedor,
  faturamentoMensal,
  metaTotalDoMes,
  totalFaturado,
  vendasNoMes,
} from "@/lib/selectors";
import { brl, monthLabel, pct, todayMonth } from "@/lib/utils";
import { StatCard } from "@/components/stat-card";
import { Card, CardTitle } from "@/components/ui/card";
import { SalesChart } from "@/components/sales-chart-loader";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const vendedores = useVendedores();
  const vendas = useVendas();
  const clientes = useClientes();
  const leads = useLeads();
  const metas = useMetas();
  const mes = todayMonth();
  const leadsAtivos = leads.filter((l) => l.status !== "fechamento" && l.status !== "perdido");
  const valorPipeline = leadsAtivos.reduce((acc, l) => acc + l.valorEstimado, 0);

  const doMes = vendasNoMes(vendas, mes);
  const fatMes = totalFaturado(doMes);
  const ativos = vendedores.filter((v) => v.ativo).length;
  const metaTotal = metaTotalDoMes(vendedores, metas, mes);
  const pctMeta = metaTotal > 0 ? (fatMes / metaTotal) * 100 : 0;
  const desempenho = desempenhoPorVendedor(vendedores, vendas, metas, mes)
    .sort((a, b) => b.vendido - a.vendido);
  const serie = faturamentoMensal(vendas, 12);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Visão geral de {monthLabel(mes)}
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Faturamento do mês"
          value={brl(fatMes)}
          hint={`${doMes.length} vendas registradas`}
          icon={DollarSign}
          tone="success"
        />
        <StatCard
          title="Vendedores ativos"
          value={String(ativos)}
          hint={`de ${vendedores.length} cadastrados`}
          icon={Users}
          tone="brand"
        />
        <StatCard
          title="Meta total"
          value={brl(metaTotal)}
          hint="soma das metas ativas"
          icon={Target}
          tone="neutral"
        />
        <StatCard
          title="% da meta batida"
          value={pct(pctMeta)}
          hint={pctMeta >= 100 ? "meta superada" : `faltam ${brl(Math.max(metaTotal - fatMes, 0))}`}
          icon={TrendingUp}
          tone={pctMeta >= 100 ? "success" : pctMeta >= 70 ? "warn" : "danger"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Clientes cadastrados"
          value={String(clientes.length)}
          hint="base atual"
          icon={UserCircle}
          tone="neutral"
        />
        <StatCard
          title="Leads ativos"
          value={String(leadsAtivos.length)}
          hint={`${leads.length} total no funil`}
          icon={Sparkles}
          tone="brand"
        />
        <StatCard
          title="Pipeline potencial"
          value={brl(valorPipeline)}
          hint="soma de leads em aberto"
          icon={TrendingUp}
          tone="warn"
        />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <CardTitle>Faturamento mensal (12 meses)</CardTitle>
        </div>
        <SalesChart data={serie} />
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <CardTitle>Ranking de vendedores — {monthLabel(mes)}</CardTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                <th className="pb-3 pr-4">#</th>
                <th className="pb-3 pr-4">Vendedor</th>
                <th className="pb-3 pr-4 text-right">Vendas</th>
                <th className="pb-3 pr-4 text-right">Faturado</th>
                <th className="pb-3 pr-4 text-right">Meta</th>
                <th className="pb-3 pr-4 text-right">% meta</th>
                <th className="pb-3 text-right">Comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {desempenho.map((d, i) => (
                <tr key={d.id}>
                  <td className="py-3 pr-4 text-[var(--color-text-dim)]">{i + 1}</td>
                  <td className="py-3 pr-4 font-medium">{d.nome}</td>
                  <td className="py-3 pr-4 text-right">{d.vendas}</td>
                  <td className="py-3 pr-4 text-right">{brl(d.vendido)}</td>
                  <td className="py-3 pr-4 text-right text-[var(--color-text-dim)]">
                    {brl(d.metaMensal)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <Badge
                      tone={
                        d.pctMeta >= 100 ? "success" : d.pctMeta >= 70 ? "warn" : "danger"
                      }
                    >
                      {pct(d.pctMeta)}
                    </Badge>
                  </td>
                  <td className="py-3 text-right text-[var(--color-success)]">
                    {brl(d.comissao)}
                  </td>
                </tr>
              ))}
              {desempenho.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--color-text-dim)]">
                    Nenhum vendedor cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
