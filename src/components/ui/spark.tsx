"use client";

import { useId } from "react";
import { useCountUp } from "@/lib/use-count-up";
import { brl } from "@/lib/utils";

/** Valor em BRL com animação count-up. */
export function AnimatedBRL({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{brl(v)}</span>;
}

/** Número inteiro com animação count-up. */
export function AnimatedNum({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{Math.round(v)}</span>;
}

/** Mini gráfico de linha (sparkline) com gradiente. id único via useId. */
export function Sparkline({
  data,
  color,
  className = "h-10 w-full",
}: {
  data: number[];
  color: string;
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 0;
    const y = 30 - ((v - min) / range) * 26 - 2;
    return `${x},${y}`;
  });
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className}>
      <defs>
        <linearGradient id={`sp-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,30 ${pts.join(" ")} 100,30`} fill={`url(#sp-${uid})`} />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
