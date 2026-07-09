"use client";

import { NIVEIS_ORDENADOS, NIVEL_INFO, nivelDaProbabilidade } from "@/lib/consorcio";

/** Velocímetro (gauge) semicircular do Simulador.
 *  - 5 zonas coloridas (status: cada nível tem cor própria)
 *  - arco de valor + ponteiro animados (transform/opacity — GPU, leve)
 *  - respeita prefers-reduced-motion (motion-reduce:transition-none)
 *  Passe `valor` 0–100; o texto central vem por `children`. */
export function Gauge({
  valor,
  size = 240,
  children,
}: {
  valor: number;
  size?: number;
  children?: React.ReactNode;
}) {
  const v = Math.max(0, Math.min(100, valor));
  const f = v / 100;
  const cx = 100;
  const cy = 100;
  const r = 80;
  const cor = NIVEL_INFO[nivelDaProbabilidade(v)].cor;

  // ponto na semicircunferência superior (f: 0 = esquerda, 1 = direita)
  const pt = (frac: number) => {
    const th = Math.PI * (1 - frac);
    return [cx + r * Math.cos(th), cy - r * Math.sin(th)] as const;
  };
  const arco = (f0: number, f1: number) => {
    const [x0, y0] = pt(f0);
    const [x1, y1] = pt(f1);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const rot = (f - 0.5) * 180; // ponteiro: -90° (esq) → +90° (dir)

  return (
    <div className="relative" style={{ width: size, height: size * 0.62 }}>
      <svg viewBox="0 0 200 116" className="h-full w-full overflow-visible">
        {/* zonas (status): larguras conforme as faixas reais de cada nível */}
        {NIVEIS_ORDENADOS.map((n, i) => {
          const prox = NIVEIS_ORDENADOS[i + 1];
          const f0 = NIVEL_INFO[n].min / 100;
          const f1 = (prox ? NIVEL_INFO[prox].min : 100) / 100;
          return (
            <path
              key={n}
              d={arco(f0, f1)}
              fill="none"
              stroke={NIVEL_INFO[n].cor}
              strokeWidth={11}
              strokeLinecap="butt"
              opacity={0.22}
            />
          );
        })}
        {/* arco de valor (anima o preenchimento via dashoffset) */}
        <path
          d={arco(0, 1)}
          fill="none"
          stroke={cor}
          strokeWidth={11}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - v}
          className="transition-[stroke-dashoffset,stroke] duration-700 ease-out motion-reduce:transition-none"
          style={{ filter: `drop-shadow(0 0 6px ${cor}aa)` }}
        />
        {/* ponteiro */}
        <g
          className="transition-transform duration-700 ease-out motion-reduce:transition-none"
          style={{ transform: `rotate(${rot}deg)`, transformOrigin: `${cx}px ${cy}px` }}
        >
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 12} stroke={cor} strokeWidth={4} strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r={7} fill="var(--color-surface)" stroke={cor} strokeWidth={3} />
      </svg>

      {/* rótulo central (probabilidade) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        {children}
      </div>
    </div>
  );
}
