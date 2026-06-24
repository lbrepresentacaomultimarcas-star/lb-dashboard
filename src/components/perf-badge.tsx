import { Check, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAIXA_INFO, type FaixaPerf, type Tendencia } from "@/lib/performance";

/** Selo da classificação (Elite, Excelente, Bom, Atenção, Precisa Melhorar). */
export function FaixaBadge({ faixa, className }: { faixa: FaixaPerf; className?: string }) {
  const info = FAIXA_INFO[faixa];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
        className,
      )}
      style={{ color: info.cor, borderColor: `${info.cor}66`, background: `${info.cor}1f` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.cor, boxShadow: `0 0 6px ${info.cor}` }} />
      {info.label}
    </span>
  );
}

/** Indicador visual de meta batida ou não batida. */
export function MetaBadge({ batida }: { batida: boolean }) {
  return batida ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
      <Check className="h-3 w-3" /> Meta batida
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
      <Minus className="h-3 w-3" /> Não batida
    </span>
  );
}

/** Tag de evolução vs ciclo anterior: ⬆ subiu / ➡ estável / ⬇ caiu / • novo. */
export function EvolucaoTag({ tendencia, delta }: { tendencia: Tendencia; delta: number }) {
  if (tendencia === "novo") return <span className="text-[11px] text-white/40">• primeiro ciclo</span>;
  const flat = tendencia === "estavel";
  const up = tendencia === "subiu";
  const cor = flat ? "rgba(255,255,255,.5)" : up ? "#22C55E" : "#f43f5e";
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums" style={{ color: cor }}>
      <Icon className="h-3 w-3" />
      {flat ? "estável" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts`}
    </span>
  );
}
