"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, MonitorPlay, Phone, TrendingDown, TrendingUp } from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import { RoleGuard } from "@/components/role-guard";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { BRL, GaugeConversao } from "@/components/analise/widgets";
import { useAudit, useLeads, useMetas, useVendas, useVendedores } from "@/lib/store";
import { useCicloProducao } from "@/lib/use-ciclo";
import { useRankingPeriodo } from "@/lib/use-ranking";
import { periodFromPreset } from "@/lib/period";
import { metaTotalDoPeriodo, totalFaturado, vendasNoPeriodo } from "@/lib/selectors";
import { analisarFunil, inteligenciaComercial, receitaPrevista, type AnaliseFunil } from "@/lib/analise-comercial";
import { analisarOportunidades, whatsappDoLead } from "@/lib/oportunidades";
import {
  NIVEL_SCORE_INFO,
  comparacoesPeriodos,
  dinheiroParado,
  previsaoInteligente,
  rankingEvolucao,
  resumoPeriodo,
  riscosDePerda,
  saudeComercial,
  scoresVendedores,
} from "@/lib/inteligencia";

const classificarSaude = (v: number) => ({
  cor: v >= 85 ? "#f5b301" : v >= 70 ? "#22c55e" : v >= 50 ? "#a3e635" : v >= 30 ? "#eab308" : "#ef4444",
  label: v >= 85 ? "Elite" : v >= 70 ? "Excelente" : v >= 50 ? "Bom" : v >= 30 ? "Regular" : "Crítico",
});

/** Dados estratégicos → somente ADMIN (mesma regra da Análise Comercial). */
export default function CentralIaPage() {
  return (
    <RoleGuard minimo="admin">
      <CentralIa />
    </RoleGuard>
  );
}

function CentralIa() {
  const leads = useLeads();
  const audits = useAudit();
  const vendas = useVendas();
  const vendedores = useVendedores();
  const metas = useMetas();
  const { config, feriados } = useCicloProducao();
  const [agoraMs] = useState(() => Date.now());

  /* --------------------------- bases (90 dias + ciclo) ----------------------- */
  const range = useMemo(() => {
    const fim = new Date(agoraMs);
    fim.setHours(23, 59, 59, 999);
    const ini = new Date(agoraMs - 90 * 86400000);
    ini.setHours(0, 0, 0, 0);
    return { de: ini, ate: fim };
  }, [agoraMs]);
  const rangeAnterior = useMemo(
    () => ({ de: new Date(range.de.getTime() - 90 * 86400000), ate: new Date(range.de.getTime() - 1) }),
    [range],
  );

  const geral = useMemo(() => analisarFunil(leads, audits, vendas, range), [leads, audits, vendas, range]);
  const anterior = useMemo(() => analisarFunil(leads, audits, vendas, rangeAnterior), [leads, audits, vendas, rangeAnterior]);

  const ativos = useMemo(() => vendedores.filter((v) => v.ativo), [vendedores]);
  const porVendedor = useMemo(
    () => ativos.map((v) => ({ vendedorId: v.id, nome: v.nome, analise: analisarFunil(leads, audits, vendas, { ...range, vendedorId: v.id }) })),
    [ativos, leads, audits, vendas, range],
  );
  const anteriorPorVendedor = useMemo(() => {
    const m = new Map<string, AnaliseFunil>();
    for (const v of ativos) m.set(v.id, analisarFunil(leads, audits, vendas, { ...rangeAnterior, vendedorId: v.id }));
    return m;
  }, [ativos, leads, audits, vendas, rangeAnterior]);

  /* ------------------------------ ciclo (meta/mês) --------------------------- */
  const periodoCiclo = useMemo(() => periodFromPreset("mes-atual", new Date(agoraMs), config, feriados), [agoraMs, config, feriados]);
  const periodoCicloAnt = useMemo(() => periodFromPreset("mes-anterior", new Date(agoraMs), config, feriados), [agoraMs, config, feriados]);
  const metaCiclo = useMemo(() => metaTotalDoPeriodo(ativos, metas, periodoCiclo), [ativos, metas, periodoCiclo]);
  const vendasCiclo = useMemo(() => vendasNoPeriodo(vendas, periodoCiclo, config, feriados), [vendas, periodoCiclo, config, feriados]);
  const vendidoCiclo = useMemo(() => totalFaturado(vendasCiclo), [vendasCiclo]);
  const vendidoCicloAnt = useMemo(
    () => totalFaturado(vendasNoPeriodo(vendas, periodoCicloAnt, config, feriados)),
    [vendas, periodoCicloAnt, config, feriados],
  );
  const fracaoCiclo = useMemo(() => {
    const ini = periodoCiclo.from.getTime();
    const fim = periodoCiclo.to.getTime();
    return Math.max(0.02, Math.min(1, (agoraMs - ini) / Math.max(1, fim - ini)));
  }, [periodoCiclo, agoraMs]);
  const previsaoRunRate = vendidoCiclo / fracaoCiclo;

  /* ------------------------------- inteligências ----------------------------- */
  const alertas = useMemo(() => analisarOportunidades(leads), [leads]);
  const riscos = useMemo(() => riscosDePerda(leads, audits, geral), [leads, audits, geral]);
  const previsao = useMemo(
    () =>
      previsaoInteligente({
        vendidoCiclo,
        previsaoRunRate,
        pipelineProvavel: receitaPrevista(geral),
        vendidoCicloAnterior: vendidoCicloAnt,
        fracaoCicloDecorrida: fracaoCiclo,
        qtdVendasCiclo: vendasCiclo.length,
      }),
    [vendidoCiclo, previsaoRunRate, geral, vendidoCicloAnt, fracaoCiclo, vendasCiclo.length],
  );
  const leadsAtivos = useMemo(() => leads.filter((l) => l.status !== "fechamento" && l.status !== "perdido").length, [leads]);
  const saude = useMemo(
    () =>
      saudeComercial({
        geral,
        pctMetaCiclo: metaCiclo > 0 ? (vendidoCiclo / metaCiclo) * 100 : 0,
        alertasUrgentes: alertas.filter((a) => a.prioridade === 3).length,
        alertasTotais: alertas.length,
        leadsAtivos,
      }),
    [geral, metaCiclo, vendidoCiclo, alertas, leadsAtivos],
  );

  const ranking = useRankingPeriodo(periodoCiclo, vendedores, vendas, metas, config, feriados);
  const pctMetaPorVendedor = useMemo(() => new Map(ranking.map((r) => [r.id, r.pctMeta])), [ranking]);
  const alertasPorVendedor = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of alertas) {
      const vid = a.lead.vendedorId;
      if (vid) m.set(vid, (m.get(vid) ?? 0) + 1);
    }
    return m;
  }, [alertas]);
  const scores = useMemo(
    () => scoresVendedores({ porVendedor, anteriorPorVendedor, geral, pctMetaPorVendedor, alertasPorVendedor }),
    [porVendedor, anteriorPorVendedor, geral, pctMetaPorVendedor, alertasPorVendedor],
  );
  const evolucao = useMemo(() => rankingEvolucao(porVendedor, anteriorPorVendedor), [porVendedor, anteriorPorVendedor]);
  const comparacoes = useMemo(() => comparacoesPeriodos(vendas, new Date(agoraMs)), [vendas, agoraMs]);
  const dinheiro = useMemo(() => dinheiroParado(geral, riscos), [geral, riscos]);
  const insights = useMemo(
    () => inteligenciaComercial({ geral, anterior, porVendedor, metaCiclo, vendidoCiclo, previsaoCiclo: previsaoRunRate }),
    [geral, anterior, porVendedor, metaCiclo, vendidoCiclo, previsaoRunRate],
  );
  const resumoSemana = useMemo(() => resumoPeriodo("semana", comparacoes[1], geral, new Date(agoraMs)), [comparacoes, geral, agoraMs]);
  const resumoMes = useMemo(() => resumoPeriodo("mês", comparacoes[2], geral, new Date(agoraMs)), [comparacoes, geral, agoraMs]);

  const segDinheiro = [
    { label: "Alta chance", valor: dinheiro.altaChance, cor: "#22c55e" },
    { label: "Parado", valor: dinheiro.parado, cor: "#eab308" },
    { label: "Em risco", valor: dinheiro.emRisco, cor: "#ef4444" },
    { label: "Recuperável", valor: dinheiro.recuperavel, cor: "#06b6d4" },
  ];
  const somaSeg = Math.max(1, segDinheiro.reduce((s, x) => s + x.valor, 0));

  return (
    <PremiumStage>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text)]">
            <Bot className="h-6 w-6 text-[var(--color-brand)]" /> Central de Inteligência Artificial
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            O assistente estratégico do LB CRM: previsão, saúde, riscos e a próxima melhor ação — sempre com seus dados reais (últimos 90 dias + ciclo atual).
          </p>
        </div>
        <Link
          href="/tv"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-hover)]"
        >
          <MonitorPlay className="h-4 w-4" /> Modo TV
        </Link>
      </div>

      {/* ---------------- Saúde + Previsão + Dinheiro Parado (herói) ---------------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
          <h2 className="mb-1 text-sm font-bold text-[var(--color-text)]">❤️ Saúde Comercial</h2>
          <GaugeConversao valor={saude.nota} rotulo="saúde da operação" sufixo="" classificar={classificarSaude} />
          {saude.fatores.length > 0 ? (
            <div className="mt-3 space-y-1 text-left">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-muted)]">O que está derrubando a nota</p>
              {saude.fatores.slice(0, 3).map((f) => (
                <p key={f.nome} className="text-xs leading-relaxed text-[var(--color-text-dim)]">
                  • {f.texto}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-[var(--color-text-dim)]">Nenhum fator crítico derrubando a nota. 👏</p>
          )}
        </div>

        <div
          className="rounded-2xl border p-5"
          style={{ borderColor: "color-mix(in oklab, #f5b301 40%, transparent)", background: "linear-gradient(160deg, color-mix(in oklab, #f5b301 9%, var(--color-surface)), var(--color-surface) 70%)" }}
        >
          <h2 className="mb-2 text-sm font-bold text-[var(--color-text)]">📈 Previsão Inteligente do Mês</h2>
          <p className="text-2xl font-extrabold tabular-nums text-[var(--color-text)]">
            {BRL(previsao.min)} <span className="text-[var(--color-muted)]">até</span> {BRL(previsao.max)}
          </p>
          <div className="mt-3 space-y-2">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-[var(--color-text-dim)]">Confiança da previsão</span>
                <span className="font-bold tabular-nums text-[var(--color-text)]">{previsao.confianca}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                <div className="h-full rounded-full bg-[#f5b301] transition-[width] duration-700" style={{ width: `${previsao.confianca}%` }} />
              </div>
            </div>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              Tendência: <span style={{ color: previsao.tendencia === "alta" ? "var(--color-success)" : previsao.tendencia === "baixa" ? "var(--color-danger)" : "var(--color-text-dim)" }}>{previsao.tendenciaTexto}</span>
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              Base: ritmo do ciclo ({BRL(vendidoCiclo)} até agora), pipeline provável, ticket médio e ciclo anterior ({BRL(vendidoCicloAnt)}).
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-2 text-sm font-bold text-[var(--color-text)]">💰 Dinheiro Parado</h2>
          <p className="text-2xl font-extrabold tabular-nums text-[var(--color-text)]">{BRL(dinheiro.totalAberto)}</p>
          <p className="mb-3 text-xs text-[var(--color-muted)]">em oportunidades abertas no funil</p>
          <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            {segDinheiro.map((s) => (
              <div key={s.label} className="h-full transition-[width] duration-700" style={{ width: `${(s.valor / somaSeg) * 100}%`, background: s.cor }} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {segDinheiro.map((s) => (
              <div key={s.label} className="rounded-lg bg-[var(--color-surface-2)]/60 px-2.5 py-1.5">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.cor }} /> {s.label}
                </p>
                <p className="text-sm font-bold tabular-nums text-[var(--color-text)]">{BRL(s.valor)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --------------------- Riscos de perda + Próxima melhor ação ---------------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">⚠️ Negócios em risco de perda</h2>
          {riscos.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">Nenhum negócio em risco relevante. 👏</p>
          ) : (
            <div className="space-y-2.5">
              {riscos.slice(0, 5).map((r) => {
                const ni = NIVEL_SCORE_INFO[r.nivel];
                return (
                  <div key={r.lead.id} className="rounded-xl border p-3" style={{ borderColor: `color-mix(in oklab, ${ni.cor} 40%, transparent)`, background: `color-mix(in oklab, ${ni.cor} 6%, transparent)` }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-[var(--color-text)]">{r.lead.nome}</p>
                      <span className="shrink-0 text-sm font-extrabold tabular-nums" style={{ color: ni.cor }}>
                        {ni.emoji} {r.risco}% de risco
                      </span>
                    </div>
                    <p className="text-[11px] tabular-nums text-[var(--color-muted)]">
                      {r.lead.valorEstimado > 0 ? `${BRL(r.lead.valorEstimado)} · ` : ""}Score da oportunidade: {r.score}/100
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {r.motivos.slice(0, 3).map((m, i) => (
                        <li key={i} className="text-xs leading-relaxed text-[var(--color-text-dim)]">• {m}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">🎯 Próxima Melhor Ação</h2>
          {riscos.length === 0 && alertas.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">Tudo em dia — sem ações urgentes agora.</p>
          ) : (
            <div className="space-y-2">
              {riscos.slice(0, 6).map((r) => {
                const wa = whatsappDoLead(r.lead);
                return (
                  <div key={r.lead.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-2)]/60 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-text)]">{r.lead.nome}</p>
                      <p className="truncate text-xs text-[var(--color-brand)]">👉 {r.acao}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {wa ? (
                        <a href={wa} target="_blank" rel="noopener" className="rounded-lg bg-[var(--color-success)]/15 p-2 text-[var(--color-success)] transition-colors hover:bg-[var(--color-success)]/25" title="WhatsApp">
                          <Phone className="h-4 w-4" />
                        </a>
                      ) : null}
                      <Link href="/leads" className="rounded-lg bg-[var(--color-brand)]/15 px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand)]/25">
                        Abrir funil
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* --------------------------- Insights + resumos ----------------------------- */}
      <div className="mt-4 rounded-2xl border border-[var(--color-brand)]/40 bg-[var(--color-surface)] p-5" style={{ background: "linear-gradient(160deg, color-mix(in oklab, var(--color-brand) 8%, var(--color-surface)), var(--color-surface) 70%)" }}>
        <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold text-[var(--color-text)]">
          🤖 Diagnóstico da empresa <Badge tone="brand">automático</Badge>
        </h2>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {insights.map((d, i) => (
            <div key={i} className="lb-fade-up rounded-xl border p-3.5" style={{ animationDelay: `${i * 50}ms`, borderColor: `color-mix(in oklab, var(--color-${d.tone}) 35%, transparent)`, background: `color-mix(in oklab, var(--color-${d.tone}) 7%, transparent)` }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: `var(--color-${d.tone})` }}>
                {d.emoji} {d.titulo}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-text)]">{d.texto}</p>
            </div>
          ))}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3.5">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">🗓️ Resumo da semana</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-text)]">{resumoSemana}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3.5">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">📅 Resumo do mês</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-text)]">{resumoMes}</p>
          </div>
        </div>
      </div>

      {/* --------------------- Scores dos vendedores + Evolução --------------------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">🧑‍💼 Score dos vendedores</h2>
          {scores.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">Sem vendedores ativos.</p>
          ) : (
            <div className="space-y-2">
              {scores.map((s, i) => {
                const delta = s.notaAnterior !== null ? s.nota - s.notaAnterior : null;
                const cor = s.nota >= 80 ? "#22c55e" : s.nota >= 55 ? "#eab308" : "#ef4444";
                return (
                  <div key={s.vendedorId} className="lb-fade-up rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="flex items-center gap-3">
                      <Avatar id={s.vendedorId} nome={s.nome} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[var(--color-text)]">{s.nome}</p>
                        <p className="text-[11px] text-[var(--color-muted)]">
                          {s.criterios.map((c) => `${c.nome} ${c.pontos}/${c.max}`).join(" · ")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xl font-extrabold tabular-nums" style={{ color: cor }}>
                          {s.nota}<span className="text-xs text-[var(--color-muted)]">/100</span>
                        </p>
                        {delta !== null ? (
                          <p className="flex items-center justify-end gap-0.5 text-[11px] font-semibold tabular-nums" style={{ color: delta >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {delta >= 0 ? "+" : ""}{delta} vs anterior
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">🚀 Quem mais evoluiu (vs 90 dias anteriores)</h2>
          {evolucao.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">Sem base de comparação ainda.</p>
          ) : (
            <div className="space-y-2">
              {evolucao.slice(0, 5).map((e, i) => (
                <div key={e.vendedorId} className="lb-fade-up flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3" style={{ animationDelay: `${i * 50}ms` }}>
                  <span className="w-6 text-center text-lg">{i === 0 ? "🚀" : i === 1 ? "⭐" : "▲"}</span>
                  <Avatar id={e.vendedorId} nome={e.nome} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--color-text)]">{e.nome}</p>
                    <p className="text-[11px] tabular-nums text-[var(--color-muted)]">
                      conversão {e.dConversao >= 0 ? "+" : ""}{e.dConversao.toFixed(0)} p.p. · faturamento {e.dFaturamento >= 0 ? "+" : ""}{BRL(e.dFaturamento)} · leads {e.dLeads >= 0 ? "+" : ""}{e.dLeads}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-extrabold tabular-nums" style={{ color: e.dPct >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                    {e.dPct >= 0 ? "+" : ""}{e.dPct.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------- Comparações entre períodos ----------------------- */}
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {comparacoes.map((c, i) => (
          <div key={c.label} className="lb-fade-up rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4" style={{ animationDelay: `${i * 50}ms` }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{c.label}</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-[var(--color-text)]">{BRL(c.atualValor)}</p>
            <p className="text-[11px] tabular-nums text-[var(--color-text-dim)]">
              {c.atualQtd} venda(s) · antes: {BRL(c.anteriorValor)}
            </p>
            {c.deltaPct !== null ? (
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold tabular-nums" style={{ color: c.deltaPct >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                {c.deltaPct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {c.deltaPct >= 0 ? "+" : ""}{c.deltaPct.toFixed(0)}%
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--color-muted)]">sem base</p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
        Central de IA · análises geradas automaticamente dos dados existentes (leads, movimentações, vendas e metas) — nada é alterado.
      </p>
    </PremiumStage>
  );
}
