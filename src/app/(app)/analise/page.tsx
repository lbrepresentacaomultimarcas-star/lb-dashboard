"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  BrainCircuit,
  Clock3,
  Filter,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import { Badge } from "@/components/ui/badge";
import { useAudit, useLeads, useVendas, useVendedores } from "@/lib/store";
import {
  analisarFunil,
  gerarDiagnostico,
  rankingAnalitico,
  type AnaliseFunil,
} from "@/lib/analise-comercial";

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PCT = (v: number | null) => (v === null ? "—" : `${v.toFixed(0)}%`);

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

/** Período imediatamente anterior, com a mesma duração. */
function rangeAnterior(r: { de?: Date; ate?: Date }): { de: Date; ate: Date } | null {
  if (!r.de || !r.ate) return null;
  const dur = r.ate.getTime() - r.de.getTime();
  return { de: new Date(r.de.getTime() - dur - 1), ate: new Date(r.de.getTime() - 1) };
}

/* ------------------------------- Funil visual -------------------------------- */

function FunilBarras({ a, comValores = false }: { a: AnaliseFunil; comValores?: boolean }) {
  const topo = Math.max(a.etapas[0]?.alcancaram ?? 0, 1);
  return (
    <div className="space-y-2">
      {a.etapas.map((e, i) => {
        const larg = Math.max(4, (e.alcancaram / topo) * 100);
        return (
          <div key={e.status} className="lb-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            {e.convAnterior !== null ? (
              <div className="mb-1 flex items-center gap-1 pl-2 text-[11px] text-[var(--color-muted)]">
                <ArrowDown className="h-3 w-3" /> {PCT(e.convAnterior)} avançam
              </div>
            ) : null}
            <div className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-right text-xs font-medium text-[var(--color-text-dim)] sm:w-48 sm:text-sm">
                {e.label}
              </div>
              <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-[var(--color-surface-2)]">
                <div
                  className="flex h-full items-center justify-between gap-2 rounded-lg px-3 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{
                    width: `${larg}%`,
                    background: `color-mix(in oklab, var(--color-brand) ${25 + (i / Math.max(1, a.etapas.length - 1)) * 55}%, var(--color-surface-2))`,
                  }}
                >
                  <span className="text-sm font-bold tabular-nums text-white">{e.alcancaram}</span>
                </div>
                {comValores ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-[var(--color-text-dim)]">
                    {BRL(e.valor)}
                    {e.tempoMedioDias !== null ? ` · ${e.tempoMedioDias.toFixed(0)}d` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardStat({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-transform duration-200 hover:-translate-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--color-text)]">{valor}</p>
      {sub ? <p className="text-xs text-[var(--color-text-dim)]">{sub}</p> : null}
    </div>
  );
}

/* ---------------------------------- Página ----------------------------------- */

export default function AnaliseComercialPage() {
  const leads = useLeads();
  const audits = useAudit();
  const vendas = useVendas();
  const vendedores = useVendedores();

  const [preset, setPreset] = useState<PresetPeriodo>("90");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [comparar, setComparar] = useState(true);
  const [vendedorSel, setVendedorSel] = useState("");

  const range = useMemo(() => rangeDoPreset(preset, de, ate), [preset, de, ate]);
  const antes = useMemo(() => rangeAnterior(range), [range]);

  const geral = useMemo(() => analisarFunil(leads, audits, vendas, range), [leads, audits, vendas, range]);
  const geralAnterior = useMemo(
    () => (comparar && antes ? analisarFunil(leads, audits, vendas, antes) : null),
    [comparar, antes, leads, audits, vendas],
  );

  const doVendedor = useMemo(
    () => (vendedorSel ? analisarFunil(leads, audits, vendas, { ...range, vendedorId: vendedorSel }) : null),
    [vendedorSel, leads, audits, vendas, range],
  );
  const doVendedorAnterior = useMemo(
    () =>
      comparar && antes && vendedorSel
        ? analisarFunil(leads, audits, vendas, { ...antes, vendedorId: vendedorSel })
        : null,
    [comparar, antes, vendedorSel, leads, audits, vendas],
  );

  const diagnosticos = useMemo(
    () =>
      vendedorSel && doVendedor
        ? gerarDiagnostico(doVendedor, geral, doVendedorAnterior)
        : gerarDiagnostico(geral, null, geralAnterior),
    [vendedorSel, doVendedor, geral, doVendedorAnterior, geralAnterior],
  );

  const ranking = useMemo(
    () =>
      rankingAnalitico(
        vendedores
          .filter((v) => v.ativo)
          .map((v) => ({ vendedorId: v.id, analise: analisarFunil(leads, audits, vendas, { ...range, vendedorId: v.id }) })),
      ),
    [vendedores, leads, audits, vendas, range],
  );

  const nomeVendedor = (id: string | null) => vendedores.find((v) => v.id === id)?.nome ?? "—";
  const foco = doVendedor ?? geral;

  return (
    <PremiumStage>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text)]">
            <BrainCircuit className="h-6 w-6 text-[var(--color-brand)]" /> Análise Comercial
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Inteligência do funil: onde perde, onde trava e o que fazer — complementar ao Dashboard.
          </p>
        </div>

        {/* Filtros de período */}
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
              {p === "30" ? "Últimos 30 dias" : p === "90" ? "Últimos 90 dias" : p === "tudo" ? "Tudo" : "Personalizado"}
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
              Comparar c/ período anterior
            </label>
          ) : null}
        </div>
      </div>

      {/* ------------------------- 1. FUNIL GERAL ------------------------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
              <Users className="h-4 w-4 text-[var(--color-brand)]" /> Funil geral da empresa
            </h2>
            <Badge tone="brand">{geral.totalLeads} leads no período</Badge>
          </div>
          <FunilBarras a={geral} />
        </div>

        <div className="space-y-3">
          <CardStat
            label="Conversão geral do funil"
            valor={`${geral.convGeral.toFixed(1)}%`}
            sub={
              geralAnterior
                ? `Período anterior: ${geralAnterior.convGeral.toFixed(1)}%`
                : `${geral.fechados} fechamentos · ${geral.perdidos} perdidos`
            }
          />
          <CardStat label="Vendas no período" valor={String(geral.qtdVendas)} sub={BRL(geral.valorVendido)} />
          <CardStat label="Ticket médio (vendas reais)" valor={geral.qtdVendas ? BRL(geral.ticketMedio) : "—"} />
          <CardStat
            label="Tempo médio até fechar"
            valor={geral.tempoAteFecharDias !== null ? `${geral.tempoAteFecharDias.toFixed(0)} dias` : "—"}
            sub="da criação do lead ao fechamento"
          />
        </div>
      </div>

      {/* --------------------- 2. FUNIL POR VENDEDOR ---------------------- */}
      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
            <TrendingUp className="h-4 w-4 text-[var(--color-brand)]" /> Funil individual por vendedor
          </h2>
          <select
            value={vendedorSel}
            onChange={(e) => setVendedorSel(e.target.value)}
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)]"
          >
            <option value="">Selecione o vendedor…</option>
            {vendedores
              .filter((v) => v.ativo)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
          </select>
        </div>

        {doVendedor ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <FunilBarras a={doVendedor} comValores />
              <p className="mt-2 text-[11px] text-[var(--color-muted)]">
                Na barra: quantidade · à direita: valor estimado somado e tempo médio na etapa (dias).
              </p>
            </div>
            <div className="space-y-3">
              <CardStat
                label="Conversão geral"
                valor={`${doVendedor.convGeral.toFixed(1)}%`}
                sub={doVendedorAnterior ? `Anterior: ${doVendedorAnterior.convGeral.toFixed(1)}%` : `${doVendedor.fechados} fechamentos`}
              />
              <CardStat label="Ticket médio" valor={doVendedor.qtdVendas ? BRL(doVendedor.ticketMedio) : "—"} sub={`${doVendedor.qtdVendas} vendas · ${BRL(doVendedor.valorVendido)}`} />
              <CardStat
                label="Tempo médio até fechar"
                valor={doVendedor.tempoAteFecharDias !== null ? `${doVendedor.tempoAteFecharDias.toFixed(0)} dias` : "—"}
              />
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">
            Escolha um vendedor para ver o funil individual com valores, ticket médio e tempos por etapa.
          </p>
        )}
      </div>

      {/* --------------------- 3. DIAGNÓSTICO INTELIGENTE ----------------- */}
      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
          <BrainCircuit className="h-4 w-4 text-[var(--color-brand)]" /> Diagnóstico inteligente
          {vendedorSel ? <Badge tone="brand">{nomeVendedor(vendedorSel)}</Badge> : <Badge tone="neutral">Empresa</Badge>}
        </h2>
        <p className="mb-3 text-xs text-[var(--color-text-dim)]">
          Gerado automaticamente a partir do funil, do histórico de movimentações e das vendas do período.
        </p>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {diagnosticos.map((d, i) => (
            <div
              key={i}
              className="lb-fade-up rounded-xl border p-4"
              style={{
                animationDelay: `${i * 50}ms`,
                borderColor: `color-mix(in oklab, var(--color-${d.tone}) 35%, transparent)`,
                background: `color-mix(in oklab, var(--color-${d.tone}) 8%, transparent)`,
              }}
            >
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: `var(--color-${d.tone})` }}>
                {d.titulo}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-text)]">{d.texto}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------ 4. RANKING ANALÍTICO -------------------- */}
      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
          <Trophy className="h-4 w-4 text-[var(--color-brand)]" /> Ranking analítico
        </h2>
        {ranking.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">Sem dados suficientes no período.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {ranking.map((r, i) => (
              <div
                key={r.titulo}
                className="lb-fade-up rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-transform duration-200 hover:-translate-y-0.5"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">{r.titulo}</p>
                <p className="mt-1 truncate text-base font-bold text-[var(--color-text)]">{nomeVendedor(r.vendedorId)}</p>
                <p className="text-sm font-semibold text-[var(--color-brand)]">{r.valorTexto}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 flex items-center justify-center gap-1 text-center text-xs text-[var(--color-muted)]">
        <Clock3 className="h-3.5 w-3.5" />
        Leitura analítica dos dados existentes (leads, movimentações e vendas) — nenhum dado é alterado. Complementar ao Dashboard.
      </p>
    </PremiumStage>
  );
}
