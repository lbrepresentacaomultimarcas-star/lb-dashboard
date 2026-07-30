"use client";

import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { metasApi, useMetasEscopo, useVendasEscopo, useVendedoresEscopo } from "@/lib/store";
import { desempenhoPorVendedor } from "@/lib/selectors";
import { useCicloProducao } from "@/lib/use-ciclo";
import { brl, formatNumBR, monthKey, monthLabel, parseNumBR, todayMonth } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Avatar } from "@/components/avatar";
import { PremiumStage } from "@/components/premium-stage";

function monthsRange(centerMes = todayMonth(), before = 1, after = 4) {
  const [y, m] = centerMes.split("-").map(Number);
  const out: string[] = [];
  for (let i = -before; i <= after; i++) {
    const d = new Date(y, m - 1 + i, 1);
    out.push(monthKey(d));
  }
  return out;
}

/** Cor do anel do avatar conforme % da meta atingida no mês atual. */
function ringColor(pct: number) {
  if (pct >= 100) return "#22C55E";
  if (pct >= 60) return "#3B82F6";
  if (pct >= 30) return "#FACC15";
  return "#f43f5e";
}

export default function MetasPage() {
  const vendedores = useVendedoresEscopo();
  const metas = useMetasEscopo();
  const vendas = useVendasEscopo();
  const { config, feriados, chaveAtual } = useCicloProducao();
  const meses = useMemo(() => monthsRange(chaveAtual), [chaveAtual]);
  const [salvando, setSalvando] = useState<string | null>(null);

  const pctById = useMemo(() => {
    const d = desempenhoPorVendedor(vendedores, vendas, metas, chaveAtual, config, feriados);
    return Object.fromEntries(d.map((x) => [x.id, x.pctMeta])) as Record<string, number>;
  }, [vendedores, vendas, metas, chaveAtual, config, feriados]);

  function valorAtual(vendedorId: string, anoMes: string, fallback: number) {
    const especifica = metas.find(
      (m) => m.vendedorId === vendedorId && m.anoMes === anoMes,
    );
    return especifica ? especifica.valor : fallback;
  }

  async function salvar(
    vendedorId: string,
    anoMes: string,
    raw: string,
    fallback: number,
  ) {
    const valor = parseNumBR(raw);
    if (valor < 0) {
      notify.error("Valor inválido");
      return;
    }
    if (valor === fallback) return; // não mudou
    const key = `${vendedorId}-${anoMes}`;
    setSalvando(key);
    try {
      await metasApi.upsert(vendedorId, anoMes, valor);
      notify.success(`Meta de ${anoMes} salva`);
    } catch (e) {
      notify.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(null);
    }
  }

  const totalPorMes = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of meses) {
      out[m] = vendedores
        .filter((v) => v.ativo)
        .reduce((acc, v) => acc + valorAtual(v.id, m, v.metaMensal), 0);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedores, metas, meses]);

  return (
    <PremiumStage>
      <header className="lb-fade-up flex items-center gap-3">
        <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#7C3AED" }}>
          <Target className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
            Metas mensais
          </h1>
          <p className="text-sm text-white/55">
            Defina metas por mês. Vazio usa a meta padrão do vendedor.
          </p>
        </div>
      </header>

      {vendedores.length === 0 ? (
        <div className="lb-card-premium lb-fade-up rounded-2xl">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="lb-orb mb-3 h-12 w-12" style={{ ["--orb" as string]: "#7C3AED" }}>
              <Target className="h-6 w-6" />
            </span>
            <p className="text-base font-bold text-white">Cadastre vendedores primeiro</p>
            <p className="mt-2 text-sm text-white/55">Vá em Vendedores → Novo vendedor.</p>
          </div>
        </div>
      ) : (
        <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
          <div className="lb-scroll overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-[10px] uppercase tracking-wider text-white/40"
                  style={{ borderBottom: "1px solid rgba(59,130,246,.4)", boxShadow: "0 5px 14px -6px rgba(59,130,246,.7)" }}
                >
                  <th className="px-5 py-3">Vendedor</th>
                  <th className="px-5 py-3 text-right">Padrão</th>
                  {meses.map((m) => (
                    <th
                      key={m}
                      className="whitespace-nowrap px-3 py-3 text-right text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: "#7aa2ff", textShadow: "0 0 10px rgba(59,130,246,.5)" }}
                    >
                      {monthLabel(m).slice(0, 3)}/{m.slice(2, 4)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {vendedores.map((v) => {
                  const rc = ringColor(pctById[v.id] ?? 0);
                  return (
                    <tr key={v.id} className="transition-colors hover:bg-white/[0.04]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="inline-grid shrink-0 place-items-center rounded-full p-0.5"
                            style={{ boxShadow: `0 0 0 2px ${rc}, 0 0 12px -2px ${rc}` }}
                          >
                            <Avatar id={v.id} nome={v.nome} size={30} />
                          </span>
                          <span className="min-w-0 truncate font-medium text-white">{v.nome}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-white/45 tabular-nums">{brl(v.metaMensal)}</td>
                      {meses.map((m) => {
                        const atual = valorAtual(v.id, m, v.metaMensal);
                        const personalizada = metas.some(
                          (x) => x.vendedorId === v.id && x.anoMes === m,
                        );
                        const key = `${v.id}-${m}`;
                        return (
                          <td key={m} className="px-2 py-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              defaultValue={formatNumBR(atual)}
                              onBlur={(e) => salvar(v.id, m, e.target.value, atual)}
                              disabled={salvando === key}
                              className={[
                                "h-9 w-full rounded-lg border px-2 text-right text-xs text-white outline-none transition-all duration-200",
                                "shadow-[inset_0_1px_4px_rgba(0,0,0,.45)] hover:border-white/30",
                                "focus:border-[#3B82F6] focus:bg-[#3B82F6]/10 focus:shadow-[inset_0_0_10px_rgba(59,130,246,.35),0_0_0_1px_rgba(59,130,246,.55)]",
                                personalizada
                                  ? "border-[#2563FF]/60 bg-[#2563FF]/10"
                                  : "border-white/12 bg-white/[0.04]",
                                salvando === key ? "opacity-50" : "",
                              ].join(" ")}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Total — barra premium */}
                <tr style={{ background: "linear-gradient(90deg, rgba(124,58,237,.42), rgba(37,99,255,.34))" }}>
                  <td className="px-5 py-3 font-bold text-white">Total</td>
                  <td className="px-5 py-3" />
                  {meses.map((m) => (
                    <td
                      key={m}
                      className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold tabular-nums text-white [text-shadow:0_0_10px_rgba(255,255,255,.25)]"
                    >
                      {brl(totalPorMes[m])}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-white/45">
        Dica: campos com borda azul têm meta personalizada salva. O anel do avatar mostra o desempenho do mês atual.
      </p>
    </PremiumStage>
  );
}
