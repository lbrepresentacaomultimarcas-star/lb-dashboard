"use client";

import { useMemo, useState } from "react";
import { BrainCircuit, Filter, Siren, Sparkles, Trophy, Users } from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import { RoleGuard } from "@/components/role-guard";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import {
  AlertasPainel,
  BRL,
  CardEtapa,
  DestaquesPainel,
  FunilModerno,
  GaugeConversao,
  LinhaComparativa,
  MetaMes,
  RankingPremium,
} from "@/components/analise/widgets";
import { useAudit, useLeadsEscopo, useMetasEscopo, useVendasEscopo, useVendedoresEscopo } from "@/lib/store";
import { useCicloProducao } from "@/lib/use-ciclo";
import { useRankingPeriodo } from "@/lib/use-ranking";
import { periodFromPreset, type Period } from "@/lib/period";
import { metaTotalDoPeriodo, totalFaturado, vendasNoPeriodo } from "@/lib/selectors";
import {
  CORES_ETAPA,
  SUGESTAO_POR_ETAPA,
  analisarFunil,
  calcularDestaques,
  gerarDiagnostico,
  inteligenciaComercial,
  receitaPrevista,
  type AnaliseFunil,
} from "@/lib/analise-comercial";
import { analisarOportunidades } from "@/lib/oportunidades";

const EMOJI_ETAPA: Record<string, string> = {
  oportunidade: "💡",
  primeiro_contato: "📞",
  reuniao: "📄",
  reuniao_agendada: "📅",
  acompanhamento: "🤝",
  fechamento: "✅",
  perdido: "❌",
};

type PresetPeriodo = "30" | "90" | "tudo" | "custom";

function rangeDoPreset(p: PresetPeriodo, de: string, ate: string): { de?: Date; ate?: Date } {
  const fim = new Date();
  fim.setHours(23, 59, 59, 999);
  if (p === "30" || p === "90") {
    const ini = new Date();
    ini.setDate(ini.getDate() - Number(p));
    ini.setHours(0, 0, 0, 0);
    return { de: ini, ate: fim };
  }
  if (p === "custom") {
    return {
      de: de ? new Date(`${de}T00:00:00`) : undefined,
      ate: ate ? new Date(`${ate}T23:59:59`) : undefined,
    };
  }
  return {};
}

function rangeAnterior(r: { de?: Date; ate?: Date }): { de: Date; ate: Date } | null {
  if (!r.de || !r.ate) return null;
  const dur = r.ate.getTime() - r.de.getTime();
  return { de: new Date(r.de.getTime() - dur - 1), ate: new Date(r.de.getTime() - 1) };
}

/** Dados estratégicos da empresa → somente ADMIN. */
export default function AnaliseComercialPage() {
  return (
    <RoleGuard minimo="admin">
      <CentroInteligencia />
    </RoleGuard>
  );
}

function CentroInteligencia() {
  const leads = useLeadsEscopo();
  const audits = useAudit();
  const vendas = useVendasEscopo();
  const vendedores = useVendedoresEscopo();
  const metas = useMetasEscopo();
  const { config, feriados } = useCicloProducao();

  // Instante de abertura da tela (estável entre re-renders — exigência do lint
  // de pureza; a previsão do ciclo não precisa de relógio vivo).
  const [agoraMs] = useState(() => Date.now());
  const [preset, setPreset] = useState<PresetPeriodo>("90");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [comparar, setComparar] = useState(true);
  const [vendedorSel, setVendedorSel] = useState("");

  const range = useMemo(() => rangeDoPreset(preset, de, ate), [preset, de, ate]);
  const antes = useMemo(() => rangeAnterior(range), [range]);

  /* ------------------------------ análises base ----------------------------- */
  const geral = useMemo(() => analisarFunil(leads, audits, vendas, range), [leads, audits, vendas, range]);
  const geralAnterior = useMemo(
    () => (comparar && antes ? analisarFunil(leads, audits, vendas, antes) : null),
    [comparar, antes, leads, audits, vendas],
  );

  const ativos = useMemo(() => vendedores.filter((v) => v.ativo), [vendedores]);
  const porVendedor = useMemo(
    () =>
      ativos.map((v) => ({
        vendedorId: v.id,
        nome: v.nome,
        analise: analisarFunil(leads, audits, vendas, { ...range, vendedorId: v.id }),
      })),
    [ativos, leads, audits, vendas, range],
  );
  const anteriorPorVendedor = useMemo(() => {
    if (!comparar || !antes) return null;
    const m = new Map<string, AnaliseFunil>();
    for (const v of ativos) m.set(v.id, analisarFunil(leads, audits, vendas, { ...antes, vendedorId: v.id }));
    return m;
  }, [comparar, antes, ativos, leads, audits, vendas]);

  /* ------------------------- meta do ciclo + previsão ------------------------ */
  const periodoCiclo = useMemo(
    () => periodFromPreset("mes-atual", new Date(), config, feriados),
    [config, feriados],
  );
  const metaCiclo = useMemo(() => metaTotalDoPeriodo(ativos, metas, periodoCiclo), [ativos, metas, periodoCiclo]);
  const vendidoCiclo = useMemo(
    () => totalFaturado(vendasNoPeriodo(vendas, periodoCiclo, config, feriados)),
    [vendas, periodoCiclo, config, feriados],
  );
  const previsaoCiclo = useMemo(() => {
    const ini = periodoCiclo.from.getTime();
    const fim = periodoCiclo.to.getTime();
    const decorrido = Math.max(1, agoraMs - ini);
    const total = Math.max(decorrido, fim - ini);
    return (vendidoCiclo / decorrido) * total;
  }, [vendidoCiclo, periodoCiclo, agoraMs]);

  /* ------------------------------- inteligência ------------------------------ */
  const insights = useMemo(
    () =>
      inteligenciaComercial({
        geral,
        anterior: geralAnterior,
        porVendedor,
        metaCiclo,
        vendidoCiclo,
        previsaoCiclo,
      }),
    [geral, geralAnterior, porVendedor, metaCiclo, vendidoCiclo, previsaoCiclo],
  );
  const destaques = useMemo(
    () => calcularDestaques(porVendedor, anteriorPorVendedor),
    [porVendedor, anteriorPorVendedor],
  );
  const alertas = useMemo(() => analisarOportunidades(leads), [leads]);

  /* ------------------------------ ranking premium ---------------------------- */
  const periodoRanking: Period = useMemo(
    () => (range.de && range.ate ? { from: range.de, to: range.ate, preset: "personalizado" } : periodoCiclo),
    [range, periodoCiclo],
  );
  const ranking = useRankingPeriodo(periodoRanking, vendedores, vendas, metas, config, feriados);

  /* ------------------------------ funil individual --------------------------- */
  const doVendedor = useMemo(
    () => (vendedorSel ? analisarFunil(leads, audits, vendas, { ...range, vendedorId: vendedorSel }) : null),
    [vendedorSel, leads, audits, vendas, range],
  );
  const doVendedorAnterior = useMemo(
    () => (vendedorSel && comparar && antes ? analisarFunil(leads, audits, vendas, { ...antes, vendedorId: vendedorSel }) : null),
    [vendedorSel, comparar, antes, leads, audits, vendas],
  );
  const diagnosticoIndividual = useMemo(
    () => (doVendedor ? gerarDiagnostico(doVendedor, geral, doVendedorAnterior) : []),
    [doVendedor, geral, doVendedorAnterior],
  );
  const melhorVendedor = useMemo(() => {
    const comBase = porVendedor.filter((p) => p.analise.totalLeads >= 3);
    return comBase.reduce<(typeof comBase)[number] | null>(
      (acc, p) => (acc === null || p.analise.convGeral > acc.analise.convGeral ? p : acc),
      null,
    );
  }, [porVendedor]);

  const nomeDe = (id: string | null) => vendedores.find((v) => v.id === id)?.nome ?? "—";
  const totalAtivosFunil = geral.etapas.reduce((s, e) => s + e.atuais, 0) + geral.perdidos;
  const emNegociacao = geral.etapas.slice(0, -1).reduce((s, e) => s + e.valorAtuais, 0);
  const prevista = receitaPrevista(geral);
  const vendedorInfo = vendedores.find((v) => v.id === vendedorSel) ?? null;
  const rankIndividual = ranking.find((r) => r.id === vendedorSel) ?? null;

  const errosAcertos = useMemo(() => {
    if (!doVendedor) return { erros: [] as string[], acertos: [] as string[], sugestoes: [] as string[] };
    const erros: string[] = [];
    const acertos: string[] = [];
    const sugestoes: string[] = [];
    doVendedor.etapas.forEach((e, i) => {
      const eq = geral.etapas[i];
      if (e.convAnterior === null || eq.convAnterior === null || doVendedor.etapas[i - 1].alcancaram < 3) return;
      const delta = e.convAnterior - eq.convAnterior;
      if (delta <= -8) {
        erros.push(`Conversão para “${e.label}” ${Math.abs(delta).toFixed(0)} p.p. abaixo da empresa (${e.convAnterior.toFixed(0)}% vs ${eq.convAnterior.toFixed(0)}%).`);
        const sug = SUGESTAO_POR_ETAPA[doVendedor.etapas[i - 1].status];
        if (sug && !sugestoes.includes(sug)) sugestoes.push(sug);
      } else if (delta >= 8) {
        acertos.push(`Conversão para “${e.label}” ${delta.toFixed(0)} p.p. ACIMA da empresa (${e.convAnterior.toFixed(0)}% vs ${eq.convAnterior.toFixed(0)}%).`);
      }
    });
    return { erros, acertos, sugestoes };
  }, [doVendedor, geral]);

  return (
    <PremiumStage>
      {/* ------------------------------- Cabeçalho ------------------------------ */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text)]">
            <BrainCircuit className="h-6 w-6 text-[var(--color-brand)]" /> Centro de Inteligência Comercial
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Decisões em segundos: onde perde, onde agir, quem apoiar e a previsão do mês.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--color-muted)]" />
          {(["30", "90", "tudo", "custom"] as PresetPeriodo[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                preset === p
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-text)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              }`}
            >
              {p === "30" ? "30 dias" : p === "90" ? "90 dias" : p === "tudo" ? "Tudo" : "Personalizado"}
            </button>
          ))}
          {preset === "custom" ? (
            <span className="flex items-center gap-1">
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-sm text-[var(--color-text)]" />
              <span className="text-xs text-[var(--color-muted)]">até</span>
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-sm text-[var(--color-text)]" />
            </span>
          ) : null}
          {preset !== "tudo" ? (
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-dim)]">
              <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-brand)]" />
              Comparar período anterior
            </label>
          ) : null}
        </div>
      </div>

      {/* -------------------- Gauge + IA protagonista (herói) ------------------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
          <h2 className="mb-1 text-sm font-bold text-[var(--color-text)]">Conversão geral</h2>
          <GaugeConversao valor={geral.convGeral} />
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            {geral.fechados} fechamento(s) de {geral.totalLeads} lead(s)
            {geralAnterior ? ` · antes: ${geralAnterior.convGeral.toFixed(0)}%` : ""}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-brand)]/40 bg-[var(--color-surface)] p-5 xl:col-span-2" style={{ background: "linear-gradient(160deg, color-mix(in oklab, var(--color-brand) 10%, var(--color-surface)), var(--color-surface) 70%)" }}>
          <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold text-[var(--color-text)]">
            🤖 Inteligência Comercial IA
            <Badge tone="brand">análise automática</Badge>
          </h2>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {insights.map((d, i) => (
              <div
                key={`${d.titulo}-${i}`}
                className="lb-fade-up rounded-xl border p-3.5"
                style={{
                  animationDelay: `${i * 60}ms`,
                  borderColor: `color-mix(in oklab, var(--color-${d.tone}) 35%, transparent)`,
                  background: `color-mix(in oklab, var(--color-${d.tone}) 7%, transparent)`,
                }}
              >
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: `var(--color-${d.tone})` }}>
                  {d.emoji} {d.titulo}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--color-text)]">{d.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --------------------------- Cards executivos --------------------------- */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {geral.etapas.map((e, i) => (
          <CardEtapa
            key={e.status}
            label={e.label}
            emoji={EMOJI_ETAPA[e.status] ?? "•"}
            cor={CORES_ETAPA[e.status]}
            qtd={e.atuais}
            valor={e.valorAtuais}
            pctFunil={totalAtivosFunil > 0 ? (e.atuais / totalAtivosFunil) * 100 : null}
            deltaAnterior={geralAnterior ? e.atuais - (geralAnterior.etapas[i]?.atuais ?? 0) : null}
            delay={i * 50}
          />
        ))}
        <CardEtapa
          label="Perdidos"
          emoji={EMOJI_ETAPA.perdido}
          cor={CORES_ETAPA.perdido}
          qtd={geral.perdidos}
          valor={geral.valorPerdidos}
          pctFunil={totalAtivosFunil > 0 ? (geral.perdidos / totalAtivosFunil) * 100 : null}
          deltaAnterior={geralAnterior ? geral.perdidos - geralAnterior.perdidos : null}
          delay={geral.etapas.length * 50}
        />
      </div>

      {/* -------------------------- Dashboard executivo ------------------------- */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[
          { label: "Receita prevista", valor: BRL(prevista), cor: "#f5b301" },
          { label: "Receita realizada", valor: BRL(geral.valorVendido), cor: "#22c55e" },
          { label: "Receita perdida", valor: BRL(geral.valorPerdidos), cor: "#ef4444" },
          { label: "Em negociação", valor: BRL(emNegociacao), cor: "var(--color-brand)" },
          { label: "Em propostas", valor: BRL(geral.etapas[2]?.valorAtuais ?? 0), cor: CORES_ETAPA.reuniao },
          { label: "Em reuniões", valor: BRL(geral.etapas[3]?.valorAtuais ?? 0), cor: CORES_ETAPA.reuniao_agendada },
          { label: "Em acompanhamento", valor: BRL(geral.etapas[4]?.valorAtuais ?? 0), cor: CORES_ETAPA.acompanhamento },
          { label: "Taxa de recuperação", valor: geral.taxaRecuperacao !== null ? `${geral.taxaRecuperacao.toFixed(0)}%` : "—", cor: "#06b6d4" },
        ].map((k, i) => (
          <div
            key={k.label}
            className="lb-fade-up rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-transform duration-200 hover:-translate-y-0.5"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{k.label}</p>
            <p className="mt-0.5 truncate text-base font-extrabold tabular-nums" style={{ color: k.cor }}>
              {k.valor}
            </p>
          </div>
        ))}
      </div>

      {/* ------------------------ Funil moderno + Meta mês ---------------------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
              <Users className="h-4 w-4 text-[var(--color-brand)]" /> Funil da empresa
            </h2>
            <Badge tone="brand">{geral.totalLeads} leads no período</Badge>
          </div>
          <FunilModerno a={geral} />
        </div>
        <div className="space-y-4">
          <MetaMes meta={metaCiclo} vendido={vendidoCiclo} previsao={previsaoCiclo} cicloLabel={periodoCiclo.cicloKey ?? "mês atual"} />
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
              <Trophy className="h-4 w-4" style={{ color: "#f5b301" }} /> Ranking do período
            </h3>
            <RankingPremium rows={ranking} />
          </div>
        </div>
      </div>

      {/* ----------------------- Destaques + Alertas ---------------------------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">🏆 Destaques da Empresa</h2>
          <DestaquesPainel itens={destaques} nomeDe={nomeDe} />
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
            <Siren className="h-4 w-4 text-[var(--color-danger)]" /> Alertas do funil
          </h2>
          <AlertasPainel oportunidades={alertas} />
        </div>
      </div>

      {/* ---------------------------- Funil individual -------------------------- */}
      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
            <Sparkles className="h-4 w-4 text-[var(--color-brand)]" /> Análise individual do vendedor
          </h2>
          <select
            value={vendedorSel}
            onChange={(e) => setVendedorSel(e.target.value)}
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)]"
          >
            <option value="">Selecione o vendedor…</option>
            {ativos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </div>

        {doVendedor && vendedorInfo ? (
          <div className="space-y-4">
            {/* Perfil + gauge + números */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-4">
                <Avatar id={vendedorInfo.id} nome={vendedorInfo.nome} size={64} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold text-[var(--color-text)]">{vendedorInfo.nome}</p>
                  <p className="text-xs text-[var(--color-text-dim)]">
                    {doVendedor.totalLeads} lead(s) no período · pipeline {BRL(doVendedor.etapas.slice(0, -1).reduce((s, e) => s + e.valorAtuais, 0))}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-[var(--color-muted)]">
                    Vendido: <span className="font-bold text-[var(--color-text)]">{BRL(doVendedor.valorVendido)}</span>
                    {" · "}Ticket: <span className="font-bold text-[var(--color-text)]">{doVendedor.qtdVendas ? BRL(doVendedor.ticketMedio) : "—"}</span>
                    {" · "}Meta: <span className="font-bold text-[var(--color-text)]">{rankIndividual ? `${rankIndividual.pctMeta.toFixed(0)}%` : "—"}</span>
                    {" · "}Fecha em: <span className="font-bold text-[var(--color-text)]">{doVendedor.tempoAteFecharDias !== null ? `${doVendedor.tempoAteFecharDias.toFixed(0)}d` : "—"}</span>
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-4 text-center">
                <GaugeConversao valor={doVendedor.convGeral} size={190} rotulo="conversão do vendedor" />
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Comparativo</p>
                <LinhaComparativa label="Conversão" empresa={geral.convGeral} vendedor={doVendedor.convGeral} />
                <LinhaComparativa label="Ticket médio" empresa={geral.qtdVendas ? geral.ticketMedio : null} vendedor={doVendedor.qtdVendas ? doVendedor.ticketMedio : null} formato="brl" />
                <LinhaComparativa label="Tempo até fechar" empresa={geral.tempoAteFecharDias} vendedor={doVendedor.tempoAteFecharDias} formato="dias" invertido />
                <LinhaComparativa label="Leads no período" empresa={geral.totalLeads / Math.max(1, ativos.length)} vendedor={doVendedor.totalLeads} formato="num" />
                {melhorVendedor && melhorVendedor.vendedorId !== vendedorSel ? (
                  <p className="mt-2 text-[11px] text-[var(--color-muted)]">
                    Melhor da equipe: <span className="font-semibold text-[var(--color-text)]">{melhorVendedor.nome}</span> com {melhorVendedor.analise.convGeral.toFixed(0)}% — diferença de {(melhorVendedor.analise.convGeral - doVendedor.convGeral).toFixed(0)} p.p.
                  </p>
                ) : melhorVendedor ? (
                  <p className="mt-2 text-[11px] font-semibold" style={{ color: "#f5b301" }}>
                    🏆 É o melhor vendedor da equipe no período.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Funil individual */}
            <FunilModerno a={doVendedor} />

            {/* Diagnóstico IA individual + erros/acertos */}
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-[var(--color-brand)]/35 bg-[color-mix(in_oklab,var(--color-brand)_7%,transparent)] p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-brand)]">🤖 Diagnóstico da IA</p>
                <div className="space-y-2">
                  {diagnosticoIndividual.map((d, i) => (
                    <p key={i} className="text-sm leading-relaxed text-[var(--color-text)]">
                      <span className="font-bold" style={{ color: `var(--color-${d.tone})` }}>
                        {d.titulo}:
                      </span>{" "}
                      {d.texto}
                    </p>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {errosAcertos.acertos.length > 0 ? (
                  <div className="rounded-xl border border-[var(--color-success)]/35 bg-[color-mix(in_oklab,var(--color-success)_7%,transparent)] p-4">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--color-success)]">✅ Principais acertos</p>
                    {errosAcertos.acertos.map((t, i) => (
                      <p key={i} className="text-sm text-[var(--color-text)]">• {t}</p>
                    ))}
                  </div>
                ) : null}
                {errosAcertos.erros.length > 0 ? (
                  <div className="rounded-xl border border-[var(--color-warn)]/35 bg-[color-mix(in_oklab,var(--color-warn)_7%,transparent)] p-4">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--color-warn)]">⚠️ Pontos a corrigir</p>
                    {errosAcertos.erros.map((t, i) => (
                      <p key={i} className="text-sm text-[var(--color-text)]">• {t}</p>
                    ))}
                    {errosAcertos.sugestoes.length > 0 ? (
                      <div className="mt-2 border-t border-[var(--color-border)] pt-2">
                        {errosAcertos.sugestoes.map((s, i) => (
                          <p key={i} className="text-xs text-[var(--color-text-dim)]">💡 {s}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {errosAcertos.erros.length === 0 && errosAcertos.acertos.length === 0 ? (
                  <p className="rounded-xl border border-[var(--color-border)] p-4 text-sm text-[var(--color-text-dim)]">
                    Sem desvios relevantes vs a média da empresa neste período (ou volume ainda pequeno).
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">
            Escolha um vendedor para ver o perfil completo: gauge, comparativos, funil e o diagnóstico exclusivo da IA.
          </p>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
        Centro de Inteligência Comercial · leitura analítica dos dados existentes (leads, movimentações e vendas) — nenhum dado é alterado.
      </p>
    </PremiumStage>
  );
}
