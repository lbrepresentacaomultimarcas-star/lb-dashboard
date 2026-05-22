"use client";

import { DollarSign, Sparkles, Target, TrendingUp, UserCircle, Users } from "lucide-react";
import {
  useClientes,
  useLeads,
  useMetas,
  useSession,
  useVendas,
  useVendedores,
} from "@/lib/store";
import { faturamentoMensal, metaTotalDoMes, totalFaturado, vendasNoMes } from "@/lib/selectors";
import { useRankingMensal } from "@/lib/use-ranking";
import { temPermissao } from "@/lib/permissions";
import { brl, monthLabel, pct, todayMonth } from "@/lib/utils";
import { StatCard } from "@/components/stat-card";
import { Card, CardTitle } from "@/components/ui/card";
import { SalesChart } from "@/components/sales-chart-loader";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/avatar";

export default function DashboardPage() {
  const session = useSession();
  const vendedores = useVendedores();
  const vendas = useVendas();
  const clientes = useClientes();
  const leads = useLeads();
  const metas = useMetas();
  const mes = todayMonth();

  // Gestor (admin/coordenador/supervisor) vê a operação inteira;
  // vendedor vê só os próprios números (já filtrados por RLS).
  const gestor = temPermissao(session, "supervisor");

  const leadsAtivos = leads.filter((l) => l.status !== "fechamento" && l.status !== "perdido");
  const valorPipeline = leadsAtivos.reduce((acc, l) => acc + l.valorEstimado, 0);

  const doMes = vendasNoMes(vendas, mes);
  const fatMes = totalFaturado(doMes);
  const ativos = vendedores.filter((v) => v.ativo).length;
  const metaTotal = metaTotalDoMes(vendedores, metas, mes);
  const pctMeta = metaTotal > 0 ? (fatMes / metaTotal) * 100 : 0;

  const ranking = useRankingMensal(mes, vendedores, vendas, metas);
  const serie = faturamentoMensal(vendas, 12);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {gestor ? "Visão Geral da Operação" : "Meu Desempenho"}
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            {gestor ? "Toda a equipe" : `Olá, ${session?.nome ?? ""}`} · {monthLabel(mes)}
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={gestor ? "Faturamento do mês" : "Minhas vendas"}
          value={brl(fatMes)}
          hint={`${doMes.length} vendas no mês`}
          icon={DollarSign}
          tone="success"
        />
        {gestor ? (
          <StatCard
            title="Vendedores ativos"
            value={String(ativos)}
            hint={`de ${vendedores.length} cadastrados`}
            icon={Users}
            tone="brand"
          />
        ) : (
          <StatCard
            title="Meus leads ativos"
            value={String(leadsAtivos.length)}
            hint={`${leads.length} no total`}
            icon={Sparkles}
            tone="brand"
          />
        )}
        <StatCard
          title={gestor ? "Meta total" : "Meu pipeline"}
          value={brl(gestor ? metaTotal : valorPipeline)}
          hint={gestor ? "soma das metas ativas" : "valor em aberto"}
          icon={Target}
          tone="neutral"
        />
        <StatCard
          title="% da meta"
          value={pct(pctMeta)}
          hint={pctMeta >= 100 ? "meta superada" : `faltam ${brl(Math.max(metaTotal - fatMes, 0))}`}
          icon={TrendingUp}
          tone={pctMeta >= 100 ? "success" : pctMeta >= 70 ? "warn" : "danger"}
        />
      </div>

      {gestor && (
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
      )}

      {gestor && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>Faturamento mensal (12 meses)</CardTitle>
          </div>
          <SalesChart data={serie} />
        </Card>
      )}

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
                <th className="pb-3 text-right">% meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {ranking.map((d, i) => (
                <tr key={d.id}>
                  <td className="py-3 pr-4 text-[var(--color-text-dim)]">{i + 1}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <Avatar id={d.id} nome={d.nome} size={28} />
                      <span className="font-medium">{d.nome}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right">{d.vendas}</td>
                  <td className="py-3 pr-4 text-right">{brl(d.vendido)}</td>
                  <td className="py-3 pr-4 text-right text-[var(--color-text-dim)]">
                    {brl(d.metaMensal)}
                  </td>
                  <td className="py-3 text-right">
                    <Badge tone={d.pctMeta >= 100 ? "success" : d.pctMeta >= 70 ? "warn" : "danger"}>
                      {pct(d.pctMeta)}
                    </Badge>
                  </td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--color-text-dim)]">
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
