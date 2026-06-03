"use client";

import { RefreshCw } from "lucide-react";
import { refreshNow, useLastRefresh, useRefreshing } from "@/lib/refresh";
import { cn } from "@/lib/utils";

function formatHHMM(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Botão "Atualizar Dados" para o Topbar.
 *
 * Layout vertical: ícone + timestamp em pt-BR (HH:mm) abaixo.
 * Anima rotação enquanto refreshing=true (cobre auto-refresh também).
 */
export function RefreshButton() {
  const refreshing = useRefreshing();
  const lastRefresh = useLastRefresh();
  const stamp = lastRefresh ? formatHHMM(lastRefresh) : "—";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={() => void refreshNow()}
        disabled={refreshing}
        aria-label="Atualizar dados"
        title={
          refreshing
            ? "Atualizando…"
            : lastRefresh
              ? `Última atualização: ${stamp}`
              : "Clique para atualizar os dados"
        }
        className={cn(
          "grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-dim)] transition-colors",
          "hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-brand)]/10 hover:text-[var(--color-brand)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
      </button>
      <span
        className="text-[9px] leading-none text-[var(--color-text-dim)] tabular-nums"
        aria-live="polite"
      >
        {stamp}
      </span>
    </div>
  );
}
