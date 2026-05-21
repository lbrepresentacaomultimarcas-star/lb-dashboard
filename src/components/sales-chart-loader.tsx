"use client";

import dynamic from "next/dynamic";

/**
 * Recharts é pesado (~95KB gzip). Carrega só quando o componente
 * monta de verdade, evitando peso no bundle inicial das páginas.
 */
export const SalesChart = dynamic(
  () => import("./sales-chart").then((m) => m.SalesChart),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-72 w-full place-items-center text-xs text-[var(--color-text-dim)]">
        Carregando gráfico…
      </div>
    ),
  },
);
