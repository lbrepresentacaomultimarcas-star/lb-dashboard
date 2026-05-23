"use client";

import { useMemo, useState } from "react";
import { Crown, DollarSign, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { useMetas, useVendas, useVendedores } from "@/lib/store";
import {
  desempenhoPorVendedor,
  faturamentoMensal,
  totalFaturado,
  vendasNoMes,
} from "@/lib/selectors";
import { brl, monthKey, monthLabel, todayMonth } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { PremiumStage } from "@/components/premium-stage";
import { AnimatedBRL, Sparkline } from "@/components/ui/spark";

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
  const serieTotals = serie.map((s) => s.total);
  const mediaUltimos = serieTotals.reduce((acc, t) => acc + t, 0) / Math.max(serieTotals.length, 1);
  const previsao = mediaUltimos;

  const maxVendido = Math.max(...desempenho.map((d) => d.vendido), 1);
  const melhor = desempenho.length
    ? desempenho.reduce((a, b) => (b.vendido > a.vendido ? b : a))
    : null;

  const kpis = [
    { label: "Entrada (faturamento)", value: fatMes, hint: `${doMes.length} vendas no mês`, icon: DollarSign, color: "#22C55E" },
    { label: "Comissão a pagar", value: comissaoTotal, hint: "todos os vendedores", icon: Wallet, color: "#FACC15" },
    { label: "Lucro líquido estimado", value: lucroEstimado, hint: "entrada − comissão", icon: PiggyBank, color: "#3B82F6" },
    { label: "Previsão (média 6m)", value: previsao, hint: "projeção próximo mês", icon: TrendingUp, color: "#7C3AED" },
  ];

  return (
    <PremiumStage>
      {/* Header */}
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#22C55E" }}>
            <DollarSign className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Financeiro
            </h1>
            <p className="text-sm text-white/55">Resumo de {monthLabel(mes)}</p>
          </div>
        </div>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white backdrop-blur"
        >
          {mesesDisp.map((m) => (
            <option key={m} value={m} className="bg-[#0b0d16]">
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </header>

      {/* KPIs premium */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <div className="flex items-start justify-between">
              <span className="lb-orb h-10 w-10" style={{ ["--orb" as string]: k.color }}>
                <k.icon className="h-5 w-5" />
              </span>
              <span
                className="lb-pulse-glow mt-1 h-2 w-2 rounded-full"
                style={{ background: k.color, boxShadow: `0 0 10px ${k.color}` }}
              />
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-wider text-white/55">{k.label}</p>
            <AnimatedBRL value={k.value} className="block text-2xl font-extrabold tabular-nums text-white" />
            <p className="text-[11px] text-white/40">{k.hint}</p>
            <div className="mt-2">
              <Sparkline data={serieTotals} color={k.color} className="h-8 w-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Tabela comissão por vendedor */}
      <div className="lb-card-premium lb-fade-up rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Comissão por vendedor — {monthLabel(mes)}
          </h2>
        </div>
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                <th className="pb-3 pr-4">Vendedor</th>
                <th className="pb-3 pr-4 text-right">Vendido</th>
                <th className="hidden pb-3 pr-4 text-right sm:table-cell">% comissão</th>
                <th className="pb-3 text-right">Comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {desempenho.map((d) => {
                const best = d.id === melhor?.id && d.vendido > 0;
                return (
                  <tr
                    key={d.id}
                    className={
                      best
                        ? "bg-emerald-500/[0.07] transition-colors"
                        : "transition-colors hover:bg-white/[0.05]"
                    }
                    style={best ? { boxShadow: "inset 3px 0 0 #22C55E" } : undefined}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Avatar id={d.id} nome={d.nome} size={28} />
                        <span className="min-w-0 truncate font-medium text-white">{d.nome}</span>
                        {best && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                            <Crown className="h-2.5 w-2.5" /> Top
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/10 sm:block">
                          <div
                            className="h-full rounded-full transition-[width] duration-700"
                            style={{
                              width: `${(d.vendido / maxVendido) * 100}%`,
                              background: best
                                ? "linear-gradient(90deg,#22C55E,#4ade80)"
                                : "linear-gradient(90deg,#2563FF,#3B82F6)",
                              boxShadow: best ? "0 0 10px rgba(34,197,94,.6)" : undefined,
                            }}
                          />
                        </div>
                        <span className="tabular-nums text-white">{brl(d.vendido)}</span>
                      </div>
                    </td>
                    <td className="hidden py-3 pr-4 text-right text-white/45 tabular-nums sm:table-cell">
                      {d.comissaoPct}%
                    </td>
                    <td className="py-3 text-right font-semibold tabular-nums text-emerald-400">
                      {brl(d.comissao)}
                    </td>
                  </tr>
                );
              })}
              {desempenho.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-white/40">
                    Nenhuma venda registrada em {monthLabel(mes)}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total final — card destacado */}
      <div
        className="lb-fade-up relative overflow-hidden rounded-2xl border border-white/10 p-5"
        style={{
          background: "linear-gradient(120deg, rgba(124,58,237,0.35), rgba(37,99,255,0.30))",
          boxShadow: "0 22px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.1)",
        }}
      >
        <div
          className="lb-pulse-glow pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(34,197,94,.4), transparent 70%)" }}
        />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-white/65">
              Total faturado em {monthLabel(mes)}
            </p>
            <AnimatedBRL
              value={fatMes}
              className="block text-3xl font-extrabold tabular-nums text-emerald-400 [text-shadow:0_0_22px_rgba(34,197,94,.55)] md:text-4xl"
            />
            <p className="mt-1 text-xs text-white/60">
              Comissão a pagar <span className="font-semibold text-amber-300">{brl(comissaoTotal)}</span> · Lucro
              estimado <span className="font-semibold text-sky-300">{brl(lucroEstimado)}</span>
            </p>
          </div>
          <span className="lb-orb h-14 w-14 shrink-0" style={{ ["--orb" as string]: "#22C55E" }}>
            <DollarSign className="h-7 w-7" />
          </span>
        </div>
      </div>
    </PremiumStage>
  );
}
