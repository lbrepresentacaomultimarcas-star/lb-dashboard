"use client";

import { useMemo, useState } from "react";
import { Trophy, Sparkles, Users } from "lucide-react";
import { useSession, usePerformanceConfig, usePerformanceHistorico } from "@/lib/store";
import { usePerformanceEquipe } from "@/lib/use-performance";
import { detalharIndicadores, FAIXA_INFO, versusMeta, type FaixaPerf } from "@/lib/performance";
import { temPermissao } from "@/lib/permissions";
import { monthLabel } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { PremiumStage } from "@/components/premium-stage";
import { EvolucaoTag, FaixaBadge, MetaBadge } from "@/components/perf-badge";

function fmtVal(v: number, unidade: "%" | "qtd") {
  return unidade === "%" ? `${Math.round(v)}%` : `${Math.round(v)}`;
}

/** Mini-gráfico de evolução (até 12 ciclos). */
function Spark({ data, cor }: { data: number[]; cor: string }) {
  if (data.length < 2) return <div className="h-12" />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 34 - ((v - min) / range) * 30 - 2;
    return `${x},${y}`;
  });
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-12 w-full">
      <polyline points={pts.join(" ")} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function PerformancePage() {
  const session = useSession();
  const perfConfig = usePerformanceConfig();
  const historico = usePerformanceHistorico();
  const { linhas, media, chave, chaveAnterior } = usePerformanceEquipe();
  const gestor = temPermissao(session, "supervisor");

  const [selId, setSel] = useState<string | null>(null);
  const alvoId = selId ?? session?.vendedorId ?? linhas[0]?.vendedor.id ?? null;
  const perfil = linhas.find((l) => l.vendedor.id === alvoId) ?? linhas[0] ?? null;

  // Série histórica do vendedor do perfil (últimos 12 ciclos) + melhor/pior.
  const serie = useMemo(() => {
    if (!perfil) return { valores: [] as number[], melhor: 0, pior: 0 };
    const snaps = historico
      .filter((h) => h.vendedorId === perfil.vendedor.id)
      .sort((a, b) => a.ciclo.localeCompare(b.ciclo));
    const mapa = new Map(snaps.map((s) => [s.ciclo, s.nota]));
    mapa.set(chave, perfil.resultado.nota); // garante o ciclo atual com a nota viva
    const ordenado = [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    const valores = ordenado.map((e) => e[1]);
    return {
      valores,
      melhor: valores.length ? Math.max(...valores) : 0,
      pior: valores.length ? Math.min(...valores) : 0,
    };
  }, [perfil, historico, chave]);

  const detalhes = perfil ? detalharIndicadores(perfil.brutos, perfConfig) : [];
  const corFaixa = perfil ? FAIXA_INFO[perfil.resultado.faixa as FaixaPerf].cor : "#888";

  return (
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#C9A227" }}>
            <Trophy className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Índice LB de Performance
            </h1>
            <p className="text-sm text-white/55">Ciclo de {monthLabel(chave)} · desempenho comercial (não é o ranking de vendas)</p>
          </div>
        </div>
        {gestor && linhas.length > 1 && (
          <select
            value={alvoId ?? ""}
            onChange={(e) => setSel(e.target.value)}
            className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white"
          >
            {linhas.map((l) => (
              <option key={l.vendedor.id} value={l.vendedor.id} className="bg-[#0b0d16]">
                {l.vendedor.nome}
              </option>
            ))}
          </select>
        )}
      </header>

      {!perfil ? (
        <div className="lb-card-premium lb-fade-up rounded-2xl p-12 text-center text-white/50">
          Sem vendedores ativos para medir ainda.
        </div>
      ) : (
        <>
          {/* PERFIL */}
          <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar id={perfil.vendedor.id} nome={perfil.vendedor.nome} size={52} />
                <div>
                  <p className="text-lg font-bold text-white">{perfil.vendedor.nome}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <FaixaBadge faixa={perfil.resultado.faixa} />
                    <EvolucaoTag tendencia={perfil.tendencia} delta={perfil.delta} />
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-white/45">Nota de performance</p>
                <p className="text-4xl font-extrabold tabular-nums" style={{ color: corFaixa }}>
                  {perfil.resultado.nota.toFixed(1)}<span className="text-xl text-white/40">%</span>
                </p>
                <p className="text-[11px] text-white/55">
                  {perfil.comparacao >= 0 ? "▲" : "▼"} {Math.abs(perfil.comparacao).toFixed(0)}%{" "}
                  {perfil.comparacao >= 0 ? "acima" : "abaixo"} da média da equipe
                </p>
              </div>
            </div>

            <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/75">
              {FAIXA_INFO[perfil.resultado.faixa as FaixaPerf].mensagem}
            </p>

            {/* Performance vs meta da empresa */}
            {(() => {
              const vm = versusMeta(perfil.resultado.nota, perfConfig.metas.metaEmpresa);
              const cor = vm.atingiu ? "#22C55E" : "#fb923c";
              return (
                <div
                  className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border px-4 py-2.5 text-sm"
                  style={{ borderColor: `${cor}55`, background: `${cor}14` }}
                >
                  <span className="text-white/65">Performance <strong className="tabular-nums text-white">{perfil.resultado.nota.toFixed(0)}%</strong></span>
                  <span className="text-white/65">Meta <strong className="tabular-nums text-white">{Math.round(perfConfig.metas.metaEmpresa)}%</strong></span>
                  <span className="font-bold tabular-nums" style={{ color: cor }}>
                    {vm.atingiu ? `Acima da meta em ${vm.diferenca.toFixed(0)}%` : `Faltam ${vm.diferenca.toFixed(0)}%`}
                  </span>
                </div>
              );
            })()}

            {/* sub-notas com meta atual + meta batida */}
            <div className="mt-4 space-y-2">
              {detalhes.map((d) => (
                <div key={d.chave} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-xs text-white/70">{d.label}</span>
                  <span className="w-28 shrink-0 text-[11px] tabular-nums text-white/45">
                    {fmtVal(d.realizado, d.unidade)} / meta {fmtVal(d.meta, d.unidade)}
                  </span>
                  <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-white/10 sm:block">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(d.subNota, 100)}%`, background: d.batida ? "#22C55E" : "#3B82F6" }} />
                  </div>
                  <MetaBadge batida={d.batida} />
                </div>
              ))}
            </div>

            {/* evolução histórica */}
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wider text-white/45">Evolução (até 12 ciclos)</p>
                <Spark data={serie.valores} cor={corFaixa} />
              </div>
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">Melhor</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-400">{serie.melhor.toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">Pior</p>
                  <p className="text-lg font-bold tabular-nums text-rose-400">{serie.pior.toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">Ciclo ant.</p>
                  <p className="text-lg font-bold tabular-nums text-white/70">
                    {perfil.notaAnterior != null ? `${perfil.notaAnterior.toFixed(0)}%` : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RANKING DE PERFORMANCE */}
          <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
            <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
              <Sparkles className="h-4 w-4 text-amber-300" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Ranking de Performance</h2>
              <span className="ml-auto flex items-center gap-1 text-[11px] text-white/45">
                <Users className="h-3.5 w-3.5" /> média {media.toFixed(0)}%
              </span>
            </div>
            <div className="lb-scroll overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                    <th className="px-5 py-3">#</th>
                    <th className="px-5 py-3">Vendedor</th>
                    <th className="px-5 py-3 text-right">Nota</th>
                    <th className="hidden px-5 py-3 sm:table-cell">Classificação</th>
                    <th className="hidden px-5 py-3 text-right md:table-cell">Conversão</th>
                    <th className="px-5 py-3 text-right">Evolução</th>
                    <th className="hidden px-5 py-3 text-right md:table-cell">vs equipe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {linhas.map((l, i) => (
                    <tr
                      key={l.vendedor.id}
                      onClick={() => setSel(l.vendedor.id)}
                      className={`cursor-pointer transition-colors hover:bg-white/[0.05] ${l.vendedor.id === alvoId ? "bg-white/[0.04]" : ""}`}
                    >
                      <td className="px-5 py-3 font-bold tabular-nums text-white/60">{i + 1}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar id={l.vendedor.id} nome={l.vendedor.nome} size={28} />
                          <span className="min-w-0 truncate font-medium text-white">{l.vendedor.nome}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums" style={{ color: FAIXA_INFO[l.resultado.faixa as FaixaPerf].cor }}>
                        {l.resultado.nota.toFixed(1)}%
                      </td>
                      <td className="hidden px-5 py-3 sm:table-cell"><FaixaBadge faixa={l.resultado.faixa} /></td>
                      <td className="hidden px-5 py-3 text-right text-white/70 tabular-nums md:table-cell">
                        {Math.round(l.resultado.conversaoPct)}%
                      </td>
                      <td className="px-5 py-3 text-right"><EvolucaoTag tendencia={l.tendencia} delta={l.delta} /></td>
                      <td className="hidden px-5 py-3 text-right tabular-nums md:table-cell" style={{ color: l.comparacao >= 0 ? "#22C55E" : "#f43f5e" }}>
                        {l.comparacao >= 0 ? "+" : ""}{l.comparacao.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-white/10 px-5 py-2 text-[11px] text-white/35">
              Comparado ao ciclo anterior ({monthLabel(chaveAnterior)}). Clique num vendedor para ver o perfil.
            </p>
          </div>
        </>
      )}
    </PremiumStage>
  );
}
