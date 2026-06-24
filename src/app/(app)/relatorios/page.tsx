"use client";

import { useMemo } from "react";
import { BarChart3, Database, Download, FileSpreadsheet, FileText, Trophy, TrendingUp } from "lucide-react";
import {
  useClientes,
  useLeads,
  useMetas,
  useVendas,
  useVendedores,
} from "@/lib/store";
import { desempenhoPorVendedor, faturamentoMensal } from "@/lib/selectors";
import { useCicloProducao } from "@/lib/use-ciclo";
import { brl, monthLabel, pct } from "@/lib/utils";
import { exportBackupJson, exportCsv, exportPdf, exportXlsx } from "@/lib/export";
import { notify } from "@/lib/notify";
import { Avatar } from "@/components/avatar";
import { SalesChart } from "@/components/sales-chart-loader";
import { PremiumStage } from "@/components/premium-stage";

function posColor(i: number) {
  return i === 0 ? "#FACC15" : i === 1 ? "#93c5fd" : i === 2 ? "#fda4af" : "rgba(255,255,255,.5)";
}

export default function RelatoriosPage() {
  const vendedores = useVendedores();
  const vendas = useVendas();
  const clientes = useClientes();
  const leads = useLeads();
  const metas = useMetas();
  const { config, feriados, chaveAtual } = useCicloProducao();
  const serie12 = useMemo(() => faturamentoMensal(vendas, 12, config, feriados), [vendas, config, feriados]);
  const ranking = useMemo(
    () =>
      desempenhoPorVendedor(vendedores, vendas, metas, chaveAtual, config, feriados).sort(
        (a, b) => b.vendido - a.vendido,
      ),
    [vendedores, vendas, metas, chaveAtual, config, feriados],
  );

  const vendasRows = useMemo(
    () => [
      ["Data", "Cliente", "Vendedor", "Valor"],
      ...vendas.map((v) => [
        new Date(v.data).toLocaleDateString("pt-BR"),
        v.cliente,
        vendedores.find((vd) => vd.id === v.vendedorId)?.nome ?? "—",
        v.valor.toFixed(2),
      ]),
    ],
    [vendas, vendedores],
  );

  const rankingRows = useMemo(
    () => [
      ["Vendedor", "Vendas", "Faturado", "Meta", "% meta", "Comissão"],
      ...ranking.map((d) => [
        d.nome,
        d.vendas,
        d.vendido.toFixed(2),
        d.metaMensal.toFixed(2),
        d.pctMeta.toFixed(1),
        d.comissao.toFixed(2),
      ]),
    ],
    [ranking],
  );

  function exportarVendasCsv() {
    exportCsv(`vendas-${chaveAtual}.csv`, vendasRows);
    notify.success("CSV de vendas baixado");
  }
  function exportarRankingCsv() {
    exportCsv(`ranking-${chaveAtual}.csv`, rankingRows);
    notify.success("CSV de ranking baixado");
  }
  async function exportarXlsxCompleto() {
    await exportXlsx(`lb-dashboard-${chaveAtual}.xlsx`, {
      Ranking: rankingRows,
      Vendas: vendasRows,
      Vendedores: [
        ["Nome", "Email", "Meta", "Comissão %", "Ativo"],
        ...vendedores.map((v) => [v.nome, v.email, v.metaMensal, v.comissaoPct, v.ativo ? "Sim" : "Não"]),
      ],
      Clientes: [
        ["Nome", "Empresa", "Email", "Telefone"],
        ...clientes.map((c) => [c.nome, c.empresa, c.email, c.telefone]),
      ],
      Leads: [
        ["Nome", "Status", "Valor estimado", "Origem", "Vendedor"],
        ...leads.map((l) => [
          l.nome,
          l.status,
          l.valorEstimado,
          l.origem ?? "",
          vendedores.find((v) => v.id === l.vendedorId)?.nome ?? "",
        ]),
      ],
    });
    notify.success("Excel completo baixado");
  }
  async function exportarRankingPdf() {
    await exportPdf({
      filename: `ranking-${chaveAtual}.pdf`,
      titulo: "Ranking de vendedores",
      subtitulo: monthLabel(chaveAtual),
      head: rankingRows[0] as string[],
      body: rankingRows.slice(1),
    });
    notify.success("PDF do ranking baixado");
  }
  async function exportarVendasPdf() {
    await exportPdf({
      filename: `vendas-${chaveAtual}.pdf`,
      titulo: "Relatório de vendas",
      subtitulo: monthLabel(chaveAtual),
      head: vendasRows[0] as string[],
      body: vendasRows.slice(1),
    });
    notify.success("PDF de vendas baixado");
  }
  function fazerBackup() {
    const data = {
      exportadoEm: new Date().toISOString(),
      vendedores,
      vendas,
      clientes,
      leads,
    };
    exportBackupJson(`backup-${chaveAtual}.json`, data);
    notify.success("Backup completo baixado");
  }

  const exportacoes = [
    { label: "Ranking", sub: "CSV", icon: Download, color: "#22C55E", onClick: exportarRankingCsv },
    { label: "Vendas", sub: "CSV", icon: Download, color: "#3B82F6", onClick: exportarVendasCsv },
    { label: "Ranking", sub: "PDF", icon: FileText, color: "#f43f5e", onClick: exportarRankingPdf },
    { label: "Vendas", sub: "PDF", icon: FileText, color: "#f59e0b", onClick: exportarVendasPdf },
    { label: "Tudo", sub: "Excel", icon: FileSpreadsheet, color: "#22C55E", onClick: exportarXlsxCompleto },
    { label: "Backup completo", sub: "JSON", icon: Database, color: "#7C3AED", onClick: fazerBackup },
  ];

  return (
    <PremiumStage>
      <header className="lb-fade-up flex items-center gap-3">
        <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#3B82F6" }}>
          <BarChart3 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
            Relatórios
          </h1>
          <p className="text-sm text-white/55">Evolução, comparação e exportação de dados</p>
        </div>
      </header>

      {/* Exportações */}
      <div className="lb-card-premium lb-fade-up rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Download className="h-4 w-4 text-indigo-300" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Exportações</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {exportacoes.map((ex) => (
            <button
              key={`${ex.label}-${ex.sub}`}
              onClick={ex.onClick}
              className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]"
            >
              <span className="lb-orb h-9 w-9 shrink-0" style={{ ["--orb" as string]: ex.color }}>
                <ex.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{ex.label}</p>
                <p className="text-[11px] uppercase tracking-wider text-white/40">{ex.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Gráfico */}
      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-indigo-300" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Faturamento por mês (últimos 12)</h2>
        </div>
        <SalesChart data={serie12} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Comparação mês a mês */}
        <div className="lb-card-premium lb-fade-up rounded-2xl p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">Comparação mês a mês</h2>
          <div className="lb-scroll overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                  <th className="pb-3 pr-4">Mês</th>
                  <th className="pb-3 pr-4 text-right">Faturamento</th>
                  <th className="pb-3 text-right">vs anterior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {serie12.map((s, i) => {
                  const prev = i > 0 ? serie12[i - 1].total : 0;
                  const diff = prev > 0 ? ((s.total - prev) / prev) * 100 : 0;
                  const dc = diff > 0 ? "#22C55E" : diff < 0 ? "#f43f5e" : "rgba(255,255,255,.4)";
                  return (
                    <tr key={s.mes} className="transition-colors hover:bg-white/[0.04]">
                      <td className="py-2 pr-4 text-white/80">{monthLabel(s.mes)}</td>
                      <td className="py-2 pr-4 text-right text-white tabular-nums">{brl(s.total)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums" style={{ color: dc }}>
                        {i === 0 ? "—" : `${diff > 0 ? "+" : ""}${pct(diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ranking do mês */}
        <div className="lb-card-premium lb-fade-up rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-300" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Ranking do mês</h2>
          </div>
          <div className="space-y-2.5">
            {ranking.map((d, i) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/[0.05]">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums"
                    style={{
                      color: i < 3 ? "#06070d" : "rgba(255,255,255,.6)",
                      background: i < 3 ? posColor(i) : "transparent",
                      boxShadow: i < 3 ? `0 0 12px -2px ${posColor(i)}` : undefined,
                    }}
                  >
                    {i + 1}
                  </span>
                  <Avatar id={d.id} nome={d.nome} size={28} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{d.nome}</p>
                    <p className="text-xs text-white/45">{d.vendas} vendas</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-white tabular-nums">{brl(d.vendido)}</p>
                  <p className="text-xs text-white/45">{pct(d.pctMeta)} da meta</p>
                </div>
              </div>
            ))}
            {ranking.length === 0 && (
              <p className="py-8 text-center text-sm text-white/45">Sem dados ainda.</p>
            )}
          </div>
        </div>
      </div>
    </PremiumStage>
  );
}
