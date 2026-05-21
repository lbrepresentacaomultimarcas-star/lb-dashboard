"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { useAudit } from "@/lib/store";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ENTIDADES = ["todas", "vendedor", "venda", "cliente", "lead", "sessao"] as const;
const ACOES = ["todas", "criar", "editar", "remover", "login", "logout"] as const;

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR");
}

function toneFor(acao: string): "neutral" | "brand" | "warn" | "danger" | "success" {
  if (acao === "criar") return "success";
  if (acao === "editar") return "warn";
  if (acao === "remover") return "danger";
  if (acao === "login" || acao === "logout") return "brand";
  return "neutral";
}

export default function HistoricoPage() {
  const audit = useAudit();
  const [filtroEntidade, setFiltroEntidade] = useState<(typeof ENTIDADES)[number]>("todas");
  const [filtroAcao, setFiltroAcao] = useState<(typeof ACOES)[number]>("todas");

  const filtrado = useMemo(() => {
    return audit.filter((a) => {
      if (filtroEntidade !== "todas" && a.entidade !== filtroEntidade) return false;
      if (filtroAcao !== "todas" && a.acao !== filtroAcao) return false;
      return true;
    });
  }, [audit, filtroEntidade, filtroAcao]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Histórico</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            {audit.length} eventos registrados
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={filtroEntidade}
            onChange={(e) => setFiltroEntidade(e.target.value as (typeof ENTIDADES)[number])}
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
          >
            {ENTIDADES.map((e) => (
              <option key={e} value={e}>
                {e === "todas" ? "Todas entidades" : e}
              </option>
            ))}
          </select>
          <select
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value as (typeof ACOES)[number])}
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
          >
            {ACOES.map((a) => (
              <option key={a} value={a}>
                {a === "todas" ? "Todas ações" : a}
              </option>
            ))}
          </select>
        </div>
      </header>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                <th className="px-5 py-3">Quando</th>
                <th className="px-5 py-3">Ação</th>
                <th className="px-5 py-3">Entidade</th>
                <th className="px-5 py-3">Detalhes</th>
                <th className="px-5 py-3">Usuário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtrado.map((a) => (
                <tr key={a.id} className="hover:bg-[var(--color-surface-2)]/40">
                  <td className="px-5 py-3 text-xs text-[var(--color-text-dim)]">{fmt(a.criadoEm)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={toneFor(a.acao)}>{a.acao}</Badge>
                  </td>
                  <td className="px-5 py-3 capitalize">{a.entidade}</td>
                  <td className="px-5 py-3 text-[var(--color-text-dim)]">{a.detalhes ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-[var(--color-text-dim)]">{a.usuarioEmail ?? "—"}</td>
                </tr>
              ))}
              {filtrado.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <History className="mb-2 h-8 w-8 text-[var(--color-text-dim)]" />
                      <CardTitle>Sem eventos para esses filtros</CardTitle>
                    </div>
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
