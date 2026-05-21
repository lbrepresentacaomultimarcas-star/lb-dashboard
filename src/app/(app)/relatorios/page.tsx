"use client";

import { useMemo } from "react";
import { Database, Download, FileSpreadsheet, FileText } from "lucide-react";
import {
  useClientes,
  useLeads,
  useMetas,
  useVendas,
  useVendedores,
} from "@/lib/store";
import { desempenhoPorVendedor, faturamentoMensal } from "@/lib/selectors";
import { brl, monthLabel, pct, todayMonth } from "@/lib/utils";
import { exportBackupJson, exportCsv, exportPdf, exportXlsx } from "@/lib/export";
import { notify } from "@/lib/notify";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SalesChart } from "@/components/sales-chart-loader";

export default function RelatoriosPage() {
  const vendedores = useVendedores();
  const vendas = useVendas();
  const clientes = useClientes();
  const leads = useLeads();
  const metas = useMetas();
  const serie12 = useMemo(() => faturamentoMensal(vendas, 12), [vendas]);
  const ranking = useMemo(
    () => desempenhoPorVendedor(vendedores, vendas, metas).sort((a, b) => b.vendido - a.vendido),
    [vendedores, vendas, metas],
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
    exportCsv(`vendas-${todayMonth()}.csv`, vendasRows);
    notify.success("CSV de vendas baixado");
  }
  function exportarRankingCsv() {
    exportCsv(`ranking-${todayMonth()}.csv`, rankingRows);
    notify.success("CSV de ranking baixado");
  }
  async function exportarXlsxCompleto() {
    await exportXlsx(`lb-dashboard-${todayMonth()}.xlsx`, {
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
      filename: `ranking-${todayMonth()}.pdf`,
      titulo: "Ranking de vendedores",
      subtitulo: monthLabel(todayMonth()),
      head: rankingRows[0] as string[],
      body: rankingRows.slice(1),
    });
    notify.success("PDF do ranking baixado");
  }
  async function exportarVendasPdf() {
    await exportPdf({
      filename: `vendas-${todayMonth()}.pdf`,
      titulo: "Relatório de vendas",
      subtitulo: monthLabel(todayMonth()),
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
    exportBackupJson(`backup-${todayMonth()}.json`, data);
    notify.success("Backup completo baixado");
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Evolução, comparação e exportação de dados
          </p>
        </div>
      </header>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <CardTitle>Exportações</CardTitle>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Button variant="secondary" onClick={exportarRankingCsv}>
            <Download className="h-4 w-4" />
            Ranking (CSV)
          </Button>
          <Button variant="secondary" onClick={exportarVendasCsv}>
            <Download className="h-4 w-4" />
            Vendas (CSV)
          </Button>
          <Button variant="secondary" onClick={exportarRankingPdf}>
            <FileText className="h-4 w-4" />
            Ranking (PDF)
          </Button>
          <Button variant="secondary" onClick={exportarVendasPdf}>
            <FileText className="h-4 w-4" />
            Vendas (PDF)
          </Button>
          <Button variant="secondary" onClick={exportarXlsxCompleto}>
            <FileSpreadsheet className="h-4 w-4" />
            Tudo (Excel)
          </Button>
          <Button onClick={fazerBackup}>
            <Database className="h-4 w-4" />
            Backup completo (JSON)
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Faturamento por mês (últimos 12)</CardTitle>
        <div className="mt-2">
          <SalesChart data={serie12} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Comparação mês a mês</CardTitle>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                  <th className="pb-3 pr-4">Mês</th>
                  <th className="pb-3 pr-4 text-right">Faturamento</th>
                  <th className="pb-3 text-right">vs anterior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {serie12.map((s, i) => {
                  const prev = i > 0 ? serie12[i - 1].total : 0;
                  const diff = prev > 0 ? ((s.total - prev) / prev) * 100 : 0;
                  return (
                    <tr key={s.mes}>
                      <td className="py-2 pr-4">{monthLabel(s.mes)}</td>
                      <td className="py-2 pr-4 text-right">{brl(s.total)}</td>
                      <td
                        className={`py-2 text-right ${
                          diff > 0
                            ? "text-[var(--color-success)]"
                            : diff < 0
                              ? "text-[var(--color-danger)]"
                              : "text-[var(--color-text-dim)]"
                        }`}
                      >
                        {i === 0 ? "—" : `${diff > 0 ? "+" : ""}${pct(diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardTitle>Ranking do mês</CardTitle>
          <div className="mt-4 space-y-3">
            {ranking.map((d, i) => (
              <div key={d.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-surface-2)] text-xs font-semibold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{d.nome}</p>
                    <p className="text-xs text-[var(--color-text-dim)]">{d.vendas} vendas</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{brl(d.vendido)}</p>
                  <p className="text-xs text-[var(--color-text-dim)]">{pct(d.pctMeta)} da meta</p>
                </div>
              </div>
            ))}
            {ranking.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">
                Sem dados ainda.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
