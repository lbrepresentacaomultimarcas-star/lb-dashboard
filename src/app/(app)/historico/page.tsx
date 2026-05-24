"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { useAudit } from "@/lib/store";
import { PremiumStage } from "@/components/premium-stage";

const ENTIDADES = ["todas", "vendedor", "venda", "cliente", "lead", "sessao"] as const;
const ACOES = ["todas", "criar", "editar", "remover", "login", "logout"] as const;

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR");
}

function acaoColor(acao: string) {
  if (acao === "criar") return "#22C55E";
  if (acao === "editar") return "#FACC15";
  if (acao === "remover") return "#f43f5e";
  if (acao === "login" || acao === "logout") return "#3B82F6";
  return "rgba(255,255,255,.5)";
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

  const selCls =
    "h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white backdrop-blur outline-none focus:border-[#3B82F6]";

  return (
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#7C3AED" }}>
            <History className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Histórico
            </h1>
            <p className="text-sm text-white/55">{audit.length} eventos registrados</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select
            value={filtroEntidade}
            onChange={(e) => setFiltroEntidade(e.target.value as (typeof ENTIDADES)[number])}
            className={selCls}
          >
            {ENTIDADES.map((e) => (
              <option key={e} value={e} className="bg-[#0b0d16]">
                {e === "todas" ? "Todas entidades" : e}
              </option>
            ))}
          </select>
          <select
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value as (typeof ACOES)[number])}
            className={selCls}
          >
            {ACOES.map((a) => (
              <option key={a} value={a} className="bg-[#0b0d16]">
                {a === "todas" ? "Todas ações" : a}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Quando</th>
                <th className="px-5 py-3">Ação</th>
                <th className="px-5 py-3">Entidade</th>
                <th className="px-5 py-3">Detalhes</th>
                <th className="px-5 py-3">Usuário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtrado.map((a) => {
                const c = acaoColor(a.acao);
                return (
                  <tr key={a.id} className="transition-colors hover:bg-white/[0.05]">
                    <td className="px-5 py-3 text-xs text-white/45">{fmt(a.criadoEm)}</td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: c, borderColor: `${c}66`, background: `${c}1a`, boxShadow: `0 0 12px -4px ${c}` }}
                      >
                        {a.acao}
                      </span>
                    </td>
                    <td className="px-5 py-3 capitalize text-white/80">{a.entidade}</td>
                    <td className="px-5 py-3 text-white/55">{a.detalhes ?? "—"}</td>
                    <td className="px-5 py-3 text-xs text-white/45">{a.usuarioEmail ?? "—"}</td>
                  </tr>
                );
              })}
              {filtrado.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14">
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="lb-orb mb-3 h-12 w-12" style={{ ["--orb" as string]: "#7C3AED" }}>
                        <History className="h-6 w-6" />
                      </span>
                      <p className="text-base font-bold text-white">Sem eventos para esses filtros</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PremiumStage>
  );
}
