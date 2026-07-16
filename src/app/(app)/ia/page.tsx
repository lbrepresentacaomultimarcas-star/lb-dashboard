"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, MessageCircleQuestion, MonitorPlay, Phone, TrendingDown, TrendingUp } from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import { RoleGuard } from "@/components/role-guard";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { BRL, GaugeConversao } from "@/components/analise/widgets";
import { useAudit, useLeads, useMetas, useSession, useVendas, useVendedores } from "@/lib/store";
import { useCicloProducao } from "@/lib/use-ciclo";
import { useRankingPeriodo } from "@/lib/use-ranking";
import { periodFromPreset } from "@/lib/period";
import { metaTotalDoPeriodo, totalFaturado, vendasNoPeriodo } from "@/lib/selectors";
import { analisarFunil, inteligenciaComercial, receitaPrevista, type AnaliseFunil } from "@/lib/analise-comercial";
import { analisarOportunidades, whatsappDoLead } from "@/lib/oportunidades";
import {
  NIVEL_SCORE_INFO,
  PERGUNTAS_CHAT,
  cenariosFinanceiros,
  comparacoesPeriodos,
  dinheiroParado,
  explicarIndice,
  indiceComercialLB,
  melhorAcaoAgora,
  metaInteligente,
  oportunidadesRecuperacao,
  previsaoInteligente,
  prioridadeDoDia,
  radarTendencia,
  rankingEvolucao,
  responderPergunta,
  resumoExecutivo,
  resumoPeriodo,
  riscosDePerda,
  scoresVendedores,
} from "@/lib/inteligencia";

const classificarIndice = (v: number) => ({
  cor: v >= 95 ? "#f5b301" : v >= 85 ? "#22c55e" : v >= 70 ? "#a3e635" : v >= 55 ? "#eab308" : "#ef4444",
  label: v >= 95 ? "Excelente" : v >= 85 ? "Muito Bom" : v >= 70 ? "Bom" : v >= 55 ? "Atenção" : "Crítico",
});

/** Dados estratégicos → somente ADMIN. */
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
  const session = useSession();
  const { config, feriados } = useCicloProducao();
  const [agoraMs] = useState(() => Date.now());
  const [perguntaAtiva, setPerguntaAtiva] = useState<string | null>(null);

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
  const diasDecorridos = Math.max(1, Math.round((agoraMs - periodoCiclo.from.getTime()) / 86400000));
  const diasRestantes = Math.max(0, Math.round((periodoCiclo.to.getTime() - agoraMs) / 86400000));

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
  const cenarios = useMemo(
    () => cenariosFinanceiros({ previsao, runRate: previsaoRunRate, pipelineProvavel: receitaPrevista(geral), meta: metaCiclo }),
    [previsao, previsaoRunRate, geral, metaCiclo],
  );
  const leadsAtivos = useMemo(() => leads.filter((l) => l.status !== "fechamento" && l.status !== "perdido").length, [leads]);
  const dinheiro = useMemo(() => dinheiroParado(geral, riscos), [geral, riscos]);

  const entradaIndice = useMemo(
    () => ({
      geral,
      pctMetaCiclo: metaCiclo > 0 ? (vendidoCiclo / metaCiclo) * 100 : 0,
      alertasTotais: alertas.length,
      alertasUrgentes: alertas.filter((a) => a.prioridade === 3).length,
      leadsAtivos,
      valorEmRisco: dinheiro.emRisco,
      valorAberto: dinheiro.totalAberto,
    }),
    [geral, metaCiclo, vendidoCiclo, alertas, leadsAtivos, dinheiro],
  );
  const indice = useMemo(() => indiceComercialLB(entradaIndice), [entradaIndice]);
  const indiceAnterior = useMemo(
    () =>
      anterior.totalLeads > 0
        ? indiceComercialLB({ ...entradaIndice, geral: anterior, pctMetaCiclo: entradaIndice.pctMetaCiclo })
        : null,
    [anterior, entradaIndice],
  );
  const explicacaoIndice = useMemo(() => explicarIndice(indice, indiceAnterior), [indice, indiceAnterior]);

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
  const insights = useMemo(
    () => inteligenciaComercial({ geral, anterior, porVendedor, metaCiclo, vendidoCiclo, previsaoCiclo: previsaoRunRate }),
    [geral, anterior, porVendedor, metaCiclo, vendidoCiclo, previsaoRunRate],
  );
  const resumoSemana = useMemo(() => resumoPeriodo("semana", comparacoes[1], geral, new Date(agoraMs)), [comparacoes, geral, agoraMs]);
  const resumoMes = useMemo(() => resumoPeriodo("mês", comparacoes[2], geral, new Date(agoraMs)), [comparacoes, geral, agoraMs]);

  const prioridade = useMemo(() => prioridadeDoDia(riscos, new Date(agoraMs)), [riscos, agoraMs]);
  const melhorAcao = useMemo(() => melhorAcaoAgora(riscos, new Date(agoraMs)), [riscos, agoraMs]);
  const tendencia = useMemo(() => radarTendencia(vendas, new Date(agoraMs)), [vendas, agoraMs]);
  const textoMeta = useMemo(
    () => metaInteligente({ meta: metaCiclo, vendido: vendidoCiclo, diasDecorridos, diasRestantes }),
    [metaCiclo, vendidoCiclo, diasDecorridos, diasRestantes],
  );
  const recuperacao = useMemo(() => oportunidadesRecuperacao(leads, new Date(agoraMs)), [leads, agoraMs]);
  const resumo = useMemo(
    () =>
      resumoExecutivo({
        nomeGestor: session?.nome ?? "gestor",
        nota: indice.nota,
        riscos,
        piorVendedor: scores.length > 0 ? { nome: scores[scores.length - 1].nome, nota: scores[scores.length - 1].nota } : null,
        recuperaveis: recuperacao.potencial,
        agora: new Date(agoraMs),
      }),
    [session, indice.nota, riscos, scores, recuperacao.potencial, agoraMs],
  );
  const vendas7dias = useMemo(() => {
    const ini = agoraMs - 7 * 86400000;
    return vendas.reduce((s, v) => (new Date(v.data).getTime() >= ini ? s + v.valor : s), 0);
  }, [vendas, agoraMs]);
  const contextoChat = useMemo(
    () => ({ riscos, scores, geral, anterior, cenarios, evolucao, vendas7dias }),
    [riscos, scores, geral, anterior, cenarios, evolucao, vendas7dias],
  );

  const segDinheiro = [
    { label: "Alta chance", valor: dinheiro.altaChance, cor: "#22c55e" },
    { label: "Parado", valor: dinheiro.parado, cor: "#eab308" },
    { label: "Em risco", valor: dinheiro.emRisco, cor: "#ef4444" },
    { label: "Recuperável", valor: dinheiro.recuperavel, cor: "#06b6d4" },
  ];
  const somaSeg = Math.max(1, segDinheiro.reduce((s, x) => s + x.valor, 0));
  const esquecidos = riscos.filter((r) => r.motivos.some((m) => m.includes("sem resposta"))).length;

  return (
    <PremiumStage>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text)]">
            <Bot className="h-6 w-6 text-[var(--color-brand)]" /> Central de Inteligência Artificial
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Seu Diretor Comercial Digital — analisando a operação 24h com os dados reais do CRM.
          </p>
        </div>
        <Link
          href="/tv"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-hover)]"
        >
          <MonitorPlay className="h-4 w-4" /> Modo TV
        </Link>
      </div>

      {/* --------------------------- Resumo executivo ---------------------------- */}
      <div
        className="rounded-2xl border border-[var(--color-brand)]/40 p-5"
        style={{ background: "linear-gradient(160deg, color-mix(in oklab, var(--color-brand) 10%, var(--color-surface)), var(--color-surface) 75%)" }}
      >
        <p className="text-lg font-extrabold text-[var(--color-text)]">👔 {resumo.saudacao}</p>
        <p className="mb-2 text-xs text-[var(--color-text-dim)]">Hoje o seu Diretor Comercial Digital recomenda:</p>
        <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
          {resumo.recomendacoes.map((r, i) => (
            <p key={i} className="lb-fade-up rounded-lg bg-[var(--color-surface-2)]/60 px-3 py-2 text-sm text-[var(--color-text)]" style={{ animationDelay: `${i * 50}ms` }}>
              • {r}
            </p>
          ))}
        </div>
      </div>

      {/* ------------- Índice LB + Prioridade/Melhor ação + Tendência ------------ */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
          <h2 className="mb-1 text-sm font-bold text-[var(--color-text)]">🏛️ ÍNDICE COMERCIAL LB</h2>
          <GaugeConversao valor={indice.nota} rotulo="índice comercial" sufixo="" classificar={classificarIndice} />
          <p className="mt-3 text-left text-xs leading-relaxed text-[var(--color-text-dim)]">🤖 {explicacaoIndice}</p>
          {indice.componentes.filter((c) => c.pontos / c.max < 0.6).slice(0, 3).map((c) => (
            <p key={c.nome} className="mt-1 text-left text-[11px] text-[var(--color-muted)]">
              • {c.nome}: {c.pontos}/{c.max} pts
            </p>
          ))}
        </div>

        <div className="space-y-4">
          {prioridade ? (
            <div className="rounded-2xl border p-5" style={{ borderColor: "color-mix(in oklab, #ef4444 45%, transparent)", background: "linear-gradient(160deg, color-mix(in oklab, #ef4444 9%, var(--color-surface)), var(--color-surface) 70%)" }}>
              <h2 className="text-sm font-extrabold text-[var(--color-danger)]">{prioridade.titulo}</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-text)]">{prioridade.texto}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-[var(--color-muted)]">Potencial estimado</p>
              <p className="text-2xl font-extrabold tabular-nums" style={{ color: "#f5b301" }}>{BRL(prioridade.potencial)}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <h2 className="text-sm font-extrabold text-[var(--color-text)]">🚨 PRIORIDADE DE HOJE</h2>
              <p className="mt-1 text-sm text-[var(--color-text-dim)]">Nenhuma urgência crítica — funil em dia. 👏</p>
            </div>
          )}
          {melhorAcao ? (
            <div className="rounded-2xl border border-[var(--color-success)]/40 bg-[var(--color-surface)] p-5">
              <h2 className="text-sm font-extrabold text-[var(--color-success)]">⚡ MELHOR AÇÃO AGORA</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-text)]">{melhorAcao.texto}</p>
              <div className="mt-2 flex items-center gap-2">
                {whatsappDoLead(melhorAcao.lead) ? (
                  <a href={whatsappDoLead(melhorAcao.lead)!} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-success)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--color-success)] hover:bg-[var(--color-success)]/25">
                    <Phone className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                ) : null}
                <Link href="/leads" className="rounded-lg bg-[var(--color-brand)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand)] hover:bg-[var(--color-brand)]/25">
                  Abrir no funil
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-1 text-sm font-bold text-[var(--color-text)]">📡 Radar de Tendência</h2>
            <p className="text-2xl font-extrabold" style={{ color: tendencia.cor }}>
              {tendencia.emoji} {tendencia.rotulo}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-dim)]">{tendencia.motivo}</p>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {tendencia.janelas.map((j) => (
                <div key={j.dias} className="rounded-lg bg-[var(--color-surface-2)]/60 px-1.5 py-1 text-center">
                  <p className="text-[10px] text-[var(--color-muted)]">{j.dias}d</p>
                  <p className="text-[11px] font-bold tabular-nums" style={{ color: j.atual >= j.anterior ? "var(--color-success)" : "var(--color-danger)" }}>
                    {j.anterior > 0 ? `${j.atual >= j.anterior ? "+" : ""}${(((j.atual - j.anterior) / j.anterior) * 100).toFixed(0)}%` : j.atual > 0 ? "novo" : "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-1 text-sm font-bold text-[var(--color-text)]">🎯 Meta Inteligente</h2>
            <p className="text-lg font-extrabold tabular-nums text-[var(--color-text)]">
              {BRL(vendidoCiclo)} <span className="text-sm font-normal text-[var(--color-muted)]">de {BRL(metaCiclo)}</span>
            </p>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${metaCiclo > 0 ? Math.min(100, (vendidoCiclo / metaCiclo) * 100) : 0}%`, background: "linear-gradient(90deg, var(--color-brand), #22c55e 70%, #f5b301)" }} />
            </div>
            <p className="mt-1 text-[11px] tabular-nums text-[var(--color-muted)]">
              faltam {BRL(Math.max(0, metaCiclo - vendidoCiclo))} · {metaCiclo > 0 ? ((vendidoCiclo / metaCiclo) * 100).toFixed(0) : 0}% · {diasRestantes} dia(s) restantes
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-text)]">🤖 {textoMeta}</p>
          </div>
        </div>
      </div>

      {/* ------------------- Cenários financeiros + Dinheiro parado --------------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border p-5" style={{ borderColor: "color-mix(in oklab, #f5b301 40%, transparent)", background: "linear-gradient(160deg, color-mix(in oklab, #f5b301 9%, var(--color-surface)), var(--color-surface) 70%)" }}>
          <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">📈 Previsão Financeira do Ciclo</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Pior cenário", valor: cenarios.pior, cor: "var(--color-danger)" },
              { label: "Esperado", valor: cenarios.esperado, cor: "var(--color-text)" },
              { label: "Melhor cenário", valor: cenarios.melhor, cor: "var(--color-success)" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl bg-[var(--color-surface-2)]/60 p-3">
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{c.label}</p>
                <p className="mt-0.5 text-base font-extrabold tabular-nums" style={{ color: c.cor }}>{BRL(c.valor)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-[var(--color-text-dim)]">
              Receita provável: <span className="font-extrabold tabular-nums text-[var(--color-text)]">{BRL(cenarios.provavel)}</span>
            </span>
            {cenarios.probMeta !== null ? (
              <span className="font-bold tabular-nums" style={{ color: cenarios.probMeta >= 60 ? "var(--color-success)" : cenarios.probMeta >= 30 ? "#eab308" : "var(--color-danger)" }}>
                {cenarios.probMeta}% de chance de bater a meta
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">Confiança da previsão: {previsao.confianca}% · Tendência: {previsao.tendenciaTexto}</p>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-2 text-sm font-bold text-[var(--color-text)]">💰 Dinheiro Parado & Radar de Risco</h2>
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
          <p className="mt-2 text-[11px] text-[var(--color-muted)]">
            🛰️ Radar: {riscos.length} negócio(s) em risco · {esquecidos} cliente(s) sem resposta · {BRL(dinheiro.emRisco)} podem ser perdidos
          </p>
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

        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">🎯 Próxima Melhor Ação (fila)</h2>
            {riscos.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--color-text-dim)]">Tudo em dia — sem ações urgentes agora.</p>
            ) : (
              <div className="space-y-2">
                {riscos.slice(0, 4).map((r) => {
                  const wa = whatsappDoLead(r.lead);
                  return (
                    <div key={r.lead.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-2)]/60 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--color-text)]">{r.lead.nome}</p>
                        <p className="truncate text-xs text-[var(--color-brand)]">👉 {r.acao}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {wa ? (
                          <a href={wa} target="_blank" rel="noopener" className="rounded-lg bg-[var(--color-success)]/15 p-2 text-[var(--color-success)] hover:bg-[var(--color-success)]/25" title="WhatsApp">
                            <Phone className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#06b6d4]/40 bg-[var(--color-surface)] p-5">
            <h2 className="mb-2 text-sm font-bold text-[var(--color-text)]">♻️ Oportunidades de Recuperação</h2>
            {recuperacao.itens.length === 0 ? (
              <p className="py-3 text-center text-sm text-[var(--color-text-dim)]">Nenhum cliente perdido pra recuperar.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-[var(--color-text-dim)]">
                  Potencial total: <span className="font-extrabold tabular-nums" style={{ color: "#06b6d4" }}>{BRL(recuperacao.potencial)}</span>
                </p>
                <div className="space-y-1.5">
                  {recuperacao.itens.slice(0, 4).map((r) => (
                    <div key={r.lead.id} className="rounded-lg bg-[var(--color-surface-2)]/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-[var(--color-text)]">{r.lead.nome}</p>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-[var(--color-text)]">{BRL(r.lead.valorEstimado)}</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)]">{r.motivo}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------ Chat IA (estrutura pronta) ------------------------ */}
      <div className="mt-4 rounded-2xl border border-[var(--color-brand)]/40 bg-[var(--color-surface)] p-5" style={{ background: "linear-gradient(160deg, color-mix(in oklab, var(--color-brand) 8%, var(--color-surface)), var(--color-surface) 70%)" }}>
        <h2 className="mb-1 flex items-center gap-2 text-base font-extrabold text-[var(--color-text)]">
          <MessageCircleQuestion className="h-5 w-5 text-[var(--color-brand)]" /> Pergunte ao Diretor
          <Badge tone="brand">responde com seus dados reais</Badge>
        </h2>
        <p className="mb-3 text-xs text-[var(--color-text-dim)]">Toque numa pergunta — a resposta sai na hora, calculada do CRM.</p>
        <div className="flex flex-wrap gap-2">
          {PERGUNTAS_CHAT.map((p) => (
            <button
              key={p.id}
              onClick={() => setPerguntaAtiva(p.id === perguntaAtiva ? null : p.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                perguntaAtiva === p.id
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/20 text-[var(--color-text)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              }`}
            >
              {p.pergunta}
            </button>
          ))}
        </div>
        {perguntaAtiva ? (
          <div className="lb-fade-up mt-3 rounded-xl border border-[var(--color-brand)]/35 bg-[color-mix(in_oklab,var(--color-brand)_7%,transparent)] p-4">
            <p className="text-sm leading-relaxed text-[var(--color-text)]">🤖 {responderPergunta(perguntaAtiva, contextoChat)}</p>
          </div>
        ) : null}
      </div>

      {/* --------------------------- Insights + resumos ----------------------------- */}
      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
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
        Diretor Comercial Digital · análises geradas automaticamente dos dados reais do CRM — nada é alterado.
      </p>
    </PremiumStage>
  );
}
