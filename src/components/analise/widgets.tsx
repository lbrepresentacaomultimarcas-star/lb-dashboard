"use client";

// Widgets do Centro de Inteligência Comercial (/analise).
// Visual premium LB (dark, azul/verde/dourado; vermelho só em alerta),
// animações leves (transform/width/count-up) e zero libs novas.

import Link from "next/link";
import { ArrowDown, ArrowRight, Clock3, TrendingDown, TrendingUp } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useCountUp } from "@/lib/use-count-up";
import { CORES_ETAPA, type AnaliseFunil, type Destaque } from "@/lib/analise-comercial";
import type { Oportunidade } from "@/lib/oportunidades";
import type { VendedorComDesempenho } from "@/lib/types";

export const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const soft = (cor: string, pct = 14) => `color-mix(in oklab, ${cor} ${pct}%, transparent)`;

/* ------------------------------ Gauge de conversão ---------------------------- */

function faixaGauge(v: number): { cor: string; label: string } {
  if (v > 80) return { cor: "#f5b301", label: "Excepcional" };
  if (v > 60) return { cor: "#22c55e", label: "Excelente" };
  if (v > 30) return { cor: "#eab308", label: "Regular" };
  return { cor: "#ef4444", label: "Crítico" };
}

const ZONAS: { ate: number; cor: string }[] = [
  { ate: 30, cor: "#ef4444" },
  { ate: 60, cor: "#eab308" },
  { ate: 80, cor: "#22c55e" },
  { ate: 100, cor: "#f5b301" },
];

/** Velocímetro da conversão geral (0–100%), com zonas e animação de abertura. */
export function GaugeConversao({ valor, size = 230, rotulo = "conversão geral" }: { valor: number; size?: number; rotulo?: string }) {
  const v = Math.max(0, Math.min(100, valor));
  const anim = useCountUp(v);
  const { cor, label } = faixaGauge(v);
  const cx = 100;
  const cy = 100;
  const r = 80;
  const pt = (frac: number) => {
    const th = Math.PI * (1 - frac);
    return [cx + r * Math.cos(th), cy - r * Math.sin(th)] as const;
  };
  const arco = (f0: number, f1: number) => {
    const [x0, y0] = pt(f0);
    const [x1, y1] = pt(f1);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const rot = (v / 100 - 0.5) * 180;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size * 0.64 }}>
      <svg viewBox="0 0 200 118" className="h-full w-full overflow-visible">
        {ZONAS.map((z, i) => (
          <path
            key={z.ate}
            d={arco((i === 0 ? 0 : ZONAS[i - 1].ate) / 100, z.ate / 100)}
            fill="none"
            stroke={z.cor}
            strokeWidth={11}
            opacity={0.22}
          />
        ))}
        <path
          d={arco(0, 1)}
          fill="none"
          stroke={cor}
          strokeWidth={11}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - v}
          className="transition-[stroke-dashoffset,stroke] duration-1000 ease-out motion-reduce:transition-none"
          style={{ filter: `drop-shadow(0 0 7px ${cor}aa)` }}
        />
        <g
          className="transition-transform duration-1000 ease-out motion-reduce:transition-none"
          style={{ transform: `rotate(${rot}deg)`, transformOrigin: "100px 100px" }}
        >
          <line x1={100} y1={100} x2={100} y2={30} stroke={cor} strokeWidth={4} strokeLinecap="round" />
        </g>
        <circle cx={100} cy={100} r={7} fill="var(--color-surface)" stroke={cor} strokeWidth={3} />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-4xl font-extrabold leading-none tabular-nums" style={{ color: cor, textShadow: `0 0 20px ${soft(cor, 55)}` }}>
          {anim.toFixed(0)}%
        </span>
        <span className="mt-0.5 text-sm font-bold" style={{ color: cor }}>
          {label}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">{rotulo}</span>
      </div>
    </div>
  );
}

/* ------------------------------ Cards executivos ------------------------------ */

export function CardEtapa({
  label,
  emoji,
  cor,
  qtd,
  valor,
  pctFunil,
  deltaAnterior,
  delay = 0,
}: {
  label: string;
  emoji: string;
  cor: string;
  qtd: number;
  valor: number;
  pctFunil: number | null;
  deltaAnterior: number | null;
  delay?: number;
}) {
  const qtdAnim = useCountUp(qtd, 700);
  return (
    <div
      className="lb-fade-up rounded-2xl border p-4 transition-transform duration-200 hover:-translate-y-0.5"
      style={{ animationDelay: `${delay}ms`, borderColor: soft(cor, 40), background: `linear-gradient(160deg, ${soft(cor, 10)}, transparent 60%)` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-dim)]">{label}</span>
        <span className="text-base">{emoji}</span>
      </div>
      <p className="mt-1 text-3xl font-extrabold tabular-nums" style={{ color: cor }}>
        {Math.round(qtdAnim)}
      </p>
      <p className="text-sm font-semibold tabular-nums text-[var(--color-text)]">{BRL(valor)}</p>
      <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
        <span>{pctFunil !== null ? `${pctFunil.toFixed(0)}% do funil` : "—"}</span>
        {deltaAnterior !== null ? (
          <span
            className="inline-flex items-center gap-0.5 font-semibold"
            style={{ color: deltaAnterior >= 0 ? "var(--color-success)" : "var(--color-danger)" }}
          >
            {deltaAnterior >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {deltaAnterior >= 0 ? "+" : ""}
            {deltaAnterior}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------- Funil moderno ------------------------------- */

export function FunilModerno({ a }: { a: AnaliseFunil }) {
  const topo = Math.max(a.etapas[0]?.alcancaram ?? 0, 1);
  return (
    <div className="space-y-1.5">
      {a.etapas.map((e, i) => {
        const cor = CORES_ETAPA[e.status];
        const larg = Math.max(6, (e.alcancaram / topo) * 100);
        const perda = e.convAnterior !== null ? 100 - e.convAnterior : null;
        return (
          <div key={e.status} className="lb-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
            {e.convAnterior !== null ? (
              <div className="flex items-center gap-3 py-0.5 pl-[26%] text-[11px] sm:pl-[22%]">
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--color-success)" }}>
                  <ArrowDown className="h-3 w-3" /> {e.convAnterior.toFixed(0)}% avançam
                </span>
                {perda !== null && perda > 0 ? (
                  <span className="text-[var(--color-muted)]">· {perda.toFixed(0)}% de perda</span>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-3">
              <div className="w-[26%] shrink-0 text-right sm:w-[22%]">
                <p className="truncate text-xs font-semibold text-[var(--color-text)] sm:text-sm">{e.label}</p>
                <p className="text-[10px] tabular-nums text-[var(--color-muted)]">
                  {e.tempoMedioDias !== null ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Clock3 className="h-2.5 w-2.5" /> {e.tempoMedioDias.toFixed(0)}d na etapa
                    </span>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <div className="relative h-11 flex-1 overflow-hidden rounded-xl bg-[var(--color-surface-2)]">
                <div
                  className="flex h-full items-center justify-between gap-2 rounded-xl px-3 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: `${larg}%`, background: `linear-gradient(90deg, ${soft(cor, 85)}, ${cor})` }}
                >
                  <span className="text-sm font-extrabold tabular-nums text-white drop-shadow">{e.alcancaram}</span>
                  <span className="hidden text-[11px] font-semibold tabular-nums text-white/85 sm:block">{BRL(e.valor)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- Meta do mês -------------------------------- */

export function MetaMes({
  meta,
  vendido,
  previsao,
  cicloLabel,
}: {
  meta: number;
  vendido: number;
  previsao: number;
  cicloLabel: string;
}) {
  const pct = meta > 0 ? Math.min(999, (vendido / meta) * 100) : 0;
  const pctAnim = useCountUp(Math.min(100, pct), 900);
  const falta = Math.max(0, meta - vendido);
  const bate = previsao >= meta && meta > 0;
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--color-text)]">🎯 Meta do mês</h3>
        <span className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">{cicloLabel}</span>
      </div>
      <p className="text-3xl font-extrabold tabular-nums text-[var(--color-text)]">{BRL(vendido)}</p>
      <p className="text-xs text-[var(--color-text-dim)]">de {BRL(meta)} · faltam {BRL(falta)}</p>

      <div className="mt-3 h-3.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none"
          style={{
            width: `${pctAnim}%`,
            background: "linear-gradient(90deg, var(--color-brand), #22c55e 70%, #f5b301)",
            boxShadow: "0 0 12px color-mix(in oklab, var(--color-success) 60%, transparent)",
          }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="font-bold tabular-nums text-[var(--color-text)]">{pct.toFixed(0)}% atingido</span>
        <span className="font-semibold" style={{ color: bate ? "var(--color-success)" : "var(--color-warn)" }}>
          Previsão: {BRL(previsao)} {meta > 0 ? (bate ? "· bate a meta ✅" : "· abaixo da meta") : ""}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------- Ranking premium ------------------------------ */

const MEDALHAS = ["🥇", "🥈", "🥉", "4º", "5º"];

export function RankingPremium({ rows }: { rows: VendedorComDesempenho[] }) {
  const top = rows.filter((r) => r.ativo !== false).slice(0, 5);
  if (top.length === 0)
    return <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">Sem vendas no período.</p>;
  const max = Math.max(top[0]?.vendido ?? 0, 1);
  return (
    <div className="space-y-2">
      {top.map((v, i) => (
        <div
          key={v.id}
          className="lb-fade-up flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-3 transition-transform duration-200 hover:-translate-y-0.5"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <span className="w-8 text-center text-lg font-extrabold">{MEDALHAS[i]}</span>
          <Avatar id={v.id} nome={v.nome} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[var(--color-text)]">{v.nome}</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface)]">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: `${(v.vendido / max) * 100}%`, background: i === 0 ? "#f5b301" : "var(--color-brand)" }}
              />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-extrabold tabular-nums text-[var(--color-text)]">{BRL(v.vendido)}</p>
            <p className="text-[10px] tabular-nums text-[var(--color-muted)]">
              {v.vendas} venda{v.vendas === 1 ? "" : "s"} · ticket {BRL(v.vendas > 0 ? v.vendido / v.vendas : 0)} · meta {v.pctMeta.toFixed(0)}%
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Destaques da empresa --------------------------- */

export function DestaquesPainel({ itens, nomeDe }: { itens: Destaque[]; nomeDe: (id: string | null) => string }) {
  if (itens.length === 0)
    return <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">Sem dados suficientes no período.</p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {itens.map((d, i) => (
        <div
          key={d.titulo}
          className="lb-fade-up rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-3 text-center transition-transform duration-200 hover:-translate-y-0.5"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <p className="text-xl">{d.emoji}</p>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{d.titulo}</p>
          <p className="truncate text-sm font-bold text-[var(--color-text)]">{nomeDe(d.vendedorId)}</p>
          <p className="text-sm font-extrabold tabular-nums" style={{ color: "#f5b301" }}>
            {d.valorTexto}
          </p>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- Alertas ------------------------------------ */

const NIVEL_ALERTA: Record<number, { emoji: string; titulo: string; cor: string }> = {
  3: { emoji: "🔴", titulo: "Urgente", cor: "#ef4444" },
  2: { emoji: "🟠", titulo: "Atenção", cor: "#f97316" },
  1: { emoji: "🟡", titulo: "Acompanhar", cor: "#eab308" },
};

export function AlertasPainel({ oportunidades }: { oportunidades: Oportunidade[] }) {
  const grupos = [3, 2, 1].map((p) => ({
    ...NIVEL_ALERTA[p],
    itens: oportunidades.filter((o) => o.prioridade === p),
  }));
  const total = oportunidades.length;
  return (
    <div>
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">Nenhum alerta agora — funil em dia. 👏</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {grupos.map((g) => (
            <div key={g.titulo} className="rounded-xl border p-3" style={{ borderColor: soft(g.cor, 40), background: soft(g.cor, 7) }}>
              <p className="mb-2 flex items-center justify-between text-sm font-bold" style={{ color: g.cor }}>
                <span>
                  {g.emoji} {g.titulo}
                </span>
                <span className="tabular-nums">{g.itens.length}</span>
              </p>
              <div className="space-y-1.5">
                {g.itens.slice(0, 3).map((o) => (
                  <div key={o.lead.id} className="rounded-lg bg-[var(--color-surface)]/70 px-2.5 py-1.5">
                    <p className="truncate text-xs font-semibold text-[var(--color-text)]">{o.lead.nome}</p>
                    <p className="truncate text-[11px] text-[var(--color-text-dim)]">
                      {o.motivo.replace("🟢 ", "")} · {o.diasParado}d parado
                    </p>
                  </div>
                ))}
                {g.itens.length === 0 ? <p className="text-[11px] text-[var(--color-muted)]">Nada por aqui.</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 text-right">
        <Link href="/oportunidades" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand)] hover:underline">
          Abrir Central de Oportunidades <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

/* ------------------------- Comparativo empresa × vendedor ---------------------- */

export function LinhaComparativa({
  label,
  empresa,
  vendedor,
  formato = "pct",
  invertido = false,
}: {
  label: string;
  empresa: number | null;
  vendedor: number | null;
  /** pct | brl | dias | num */
  formato?: "pct" | "brl" | "dias" | "num";
  /** true quando MENOR é melhor (ex.: tempo). */
  invertido?: boolean;
}) {
  const fmt = (v: number | null) =>
    v === null
      ? "—"
      : formato === "brl"
        ? BRL(v)
        : formato === "dias"
          ? `${v.toFixed(0)}d`
          : formato === "num"
            ? v.toFixed(0)
            : `${v.toFixed(0)}%`;
  const max = Math.max(empresa ?? 0, vendedor ?? 0, 1);
  const melhor = vendedor !== null && empresa !== null && (invertido ? vendedor <= empresa : vendedor >= empresa);
  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-[var(--color-text-dim)]">{label}</span>
        <span className="font-bold tabular-nums" style={{ color: melhor ? "var(--color-success)" : "var(--color-warn)" }}>
          {fmt(vendedor)} <span className="font-normal text-[var(--color-muted)]">vs {fmt(empresa)}</span>
        </span>
      </div>
      <div className="space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${((vendedor ?? 0) / max) * 100}%`, background: melhor ? "var(--color-success)" : "var(--color-warn)" }}
          />
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <div
            className="h-full rounded-full opacity-50 transition-[width] duration-700 ease-out"
            style={{ width: `${((empresa ?? 0) / max) * 100}%`, background: "var(--color-brand)" }}
          />
        </div>
      </div>
    </div>
  );
}
