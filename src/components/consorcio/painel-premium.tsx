"use client";

import { AlertTriangle, Banknote, CheckCircle2, Layers, PiggyBank, Sparkles, Star, Wallet } from "lucide-react";
import { Gauge } from "./gauge";
import { useCountUp } from "@/lib/use-count-up";
import {
  NIVEIS_ORDENADOS,
  NIVEL_INFO,
  analiseComercial,
  formatBRL,
  textoInteligente,
  type ObsComercial,
  type SimulacaoResultado,
} from "@/lib/consorcio";

const soft = (cor: string, pct = 14) => `color-mix(in oklab, ${cor} ${pct}%, transparent)`;

/* ------------------------------ Painel de resultado -------------------------- */

export function PainelResultado({ resultado, grande = false }: { resultado: SimulacaoResultado; grande?: boolean }) {
  const info = NIVEL_INFO[resultado.nivel];
  const cor = info.cor;
  const prob = useCountUp(resultado.probabilidade);

  return (
    <div
      className="lb-fade-up relative overflow-hidden rounded-2xl border p-6 text-center transition-colors"
      style={{ borderColor: soft(cor, 45), background: `radial-gradient(120% 90% at 50% 0%, ${soft(cor, 12)}, transparent)` }}
    >
      <p className={`font-semibold uppercase tracking-widest text-[var(--color-text-dim)] ${grande ? "text-base" : "text-xs"}`}>
        Probabilidade estimada
      </p>

      {/* Classificação em DESTAQUE — vem antes da porcentagem */}
      <div
        className={`mx-auto mt-2 inline-flex items-center gap-2 rounded-full border font-extrabold tracking-wide ${grande ? "px-6 py-2.5 text-xl" : "px-4 py-1.5 text-sm"} lb-glow`}
        style={{ color: cor, borderColor: soft(cor, 55), background: soft(cor, 12) }}
      >
        <span>{info.emoji}</span> {info.titulo}
      </div>

      <div className="mt-2 flex justify-center">
        <Gauge valor={resultado.probabilidade} size={grande ? 360 : 260}>
          <span
            className={`font-extrabold leading-none tabular-nums ${grande ? "text-7xl" : "text-5xl"}`}
            style={{ color: cor, textShadow: `0 0 22px ${soft(cor, 55)}` }}
          >
            {Math.round(prob)}%
          </span>
          <span className={`mt-1 text-[var(--color-text-dim)] ${grande ? "text-sm" : "text-xs"}`}>estimado</span>
        </Gauge>
      </div>

      {/* Índice de confiança (estrelas) — credibilidade na apresentação */}
      <div className="mt-3 flex flex-col items-center gap-1">
        <div className="flex gap-1" aria-label={`Índice de confiança ${info.estrelas} de 5`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={grande ? 26 : 18}
              className="transition-colors"
              style={{ color: i <= info.estrelas ? cor : "var(--color-border)" }}
              fill={i <= info.estrelas ? cor : "none"}
            />
          ))}
        </div>
        <span className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Índice de confiança</span>
      </div>

      {/* Barra: zonas proporcionais às faixas + preenchimento na cor do nível */}
      <div className="mx-auto mt-4 max-w-md">
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <div className="absolute inset-0 flex opacity-25">
            {NIVEIS_ORDENADOS.map((n, i) => {
              const prox = NIVEIS_ORDENADOS[i + 1];
              const largura = (prox ? NIVEL_INFO[prox].min : 100) - NIVEL_INFO[n].min;
              return <div key={n} className="h-full" style={{ width: `${largura}%`, background: NIVEL_INFO[n].cor }} />;
            })}
          </div>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${resultado.probabilidade}%`, background: cor, boxShadow: `0 0 12px ${cor}` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-[var(--color-muted)]">
          <span>0%</span>
          <span>Lance: {resultado.pctLance.toFixed(1)}% do crédito</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Análise inteligente --------------------------- */

export function AnaliseInteligente({ resultado, grande = false }: { resultado: SimulacaoResultado; grande?: boolean }) {
  return (
    <div className="lb-fade-up rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
        <Sparkles className="h-4 w-4 text-[var(--color-brand)]" /> Análise inteligente
      </p>
      <p className={`leading-relaxed text-[var(--color-text-dim)] ${grande ? "text-base" : "text-sm"}`}>
        {textoInteligente(resultado.nivel)}
      </p>
    </div>
  );
}

/* -------------------------------- Comparativo -------------------------------- */

function BarraComparativa({ label, pct, cor, escala }: { label: string; pct: number; cor: string; escala: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-[var(--color-text-dim)]">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-[var(--color-text)]">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.min(100, (pct / escala) * 100)}%`, background: cor }}
        />
      </div>
    </div>
  );
}

export function Comparativo({ resultado, faixaRecomendada }: { resultado: SimulacaoResultado; faixaRecomendada: number }) {
  const cor = NIVEL_INFO[resultado.nivel].cor;
  const escala = Math.max(resultado.pctLance, faixaRecomendada, 1) * 1.15;
  const acima = resultado.pctLance >= faixaRecomendada;
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-[var(--color-text)]">Comparativo</p>
        <span
          className="rounded-md border px-2 py-0.5 text-xs font-semibold"
          style={{ color: acima ? "var(--color-success)" : "var(--color-warn)", borderColor: soft(acima ? "#22c55e" : "#f59e0b", 40), background: soft(acima ? "#22c55e" : "#f59e0b", 12) }}
        >
          {acima ? "Seu lance está na faixa (ou acima)" : "Seu lance está abaixo da faixa"}
        </span>
      </div>
      <div className="space-y-3">
        <BarraComparativa label="Seu lance" pct={resultado.pctLance} cor={cor} escala={escala} />
        <BarraComparativa label="Faixa recomendada" pct={faixaRecomendada} cor="var(--color-text-dim)" escala={escala} />
      </div>
    </div>
  );
}

/* ------------------------------ Resumo financeiro ---------------------------- */

function CardFinanceiro({
  icone: Icone,
  label,
  valor,
  cor,
  grande,
}: {
  icone: React.ComponentType<{ className?: string }>;
  label: string;
  valor: number;
  cor: string;
  grande?: boolean;
}) {
  const v = useCountUp(valor, 800);
  return (
    <div
      className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{ boxShadow: `inset 0 0 0 1px transparent` }}
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-lg transition-transform group-hover:scale-110"
        style={{ background: soft(cor, 16), color: cor }}
      >
        <Icone className="h-4 w-4" />
      </span>
      <p className="mt-2 text-[11px] uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className={`font-extrabold tabular-nums text-[var(--color-text)] ${grande ? "text-2xl" : "text-lg"}`}>{formatBRL(v)}</p>
    </div>
  );
}

export function ResumoFinanceiro({ resultado, grande = false }: { resultado: SimulacaoResultado; grande?: boolean }) {
  return (
    <div className={`grid gap-3 ${grande ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-4"}`}>
      <CardFinanceiro icone={Layers} label="Lance embutido" valor={resultado.valorEmbutido} cor="#8b5cf6" grande={grande} />
      <CardFinanceiro icone={Wallet} label="Recurso próprio" valor={resultado.recursoProprio} cor="#6366f1" grande={grande} />
      <CardFinanceiro icone={Banknote} label="Crédito líquido" valor={resultado.creditoLiquido} cor="#22c55e" grande={grande} />
      <CardFinanceiro icone={PiggyBank} label="Economia obtida" valor={resultado.valorEmbutido} cor="#f5b301" grande={grande} />
    </div>
  );
}

/* ------------------------------ Análise comercial ---------------------------- */

export function AnaliseComercial({ resultado, carta }: { resultado: SimulacaoResultado; carta: number }) {
  const obs: ObsComercial[] = analiseComercial(resultado, carta);
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="mb-3 text-sm font-bold text-[var(--color-text)]">Análise comercial</p>
      <p className="mb-3 text-xs text-[var(--color-text-dim)]">Observações para apoiar o vendedor na negociação — não são promessa de contemplação.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {obs.map((o, i) => {
          const ok = o.tipo === "ok";
          const cor = ok ? "#22c55e" : "#f59e0b";
          const Icone = ok ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={i}
              className="lb-fade-up flex items-center gap-2.5 rounded-xl border p-3"
              style={{ borderColor: soft(cor, 35), background: soft(cor, 8), animationDelay: `${i * 40}ms` }}
            >
              <Icone className="h-5 w-5 shrink-0" style={{ color: cor }} />
              <span className="text-sm font-medium text-[var(--color-text)]">{o.texto}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
