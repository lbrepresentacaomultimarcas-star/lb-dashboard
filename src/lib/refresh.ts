"use client";

import { useSyncExternalStore } from "react";
import { reloadAllData } from "./store";
import { notify } from "./notify";

/**
 * Gerenciador global de refresh manual + auto-refresh.
 *
 * - `refreshNow()` → re-busca todos os datasets do Supabase + dispara um
 *   "tick" que páginas com fetch local (ex: /admin/producoes) podem
 *   observar via `useRefreshTick()` pra recarregar a si mesmas.
 * - `setAutoRefresh(true)` → liga um timer de 60s que dispara refresh
 *   silencioso (sem toast) periodicamente. Persiste em localStorage.
 *
 * Padrão do store: estado em módulo + Set de listeners + useSyncExternalStore
 * pra reatividade. Sem React Context (mais leve e funciona client-side).
 */

const AUTO_REFRESH_KEY = "lb:setting:auto_refresh_enabled";
const AUTO_REFRESH_INTERVAL_MS = 60_000;

type State = {
  refreshing: boolean;
  lastRefresh: Date | null;
  autoRefreshEnabled: boolean;
  /** Incrementa a cada refresh concluído (manual ou auto). */
  tick: number;
};

function readAutoRefreshFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AUTO_REFRESH_KEY) === "true";
  } catch {
    return false;
  }
}

const state: State = {
  refreshing: false,
  lastRefresh: null,
  autoRefreshEnabled: readAutoRefreshFromStorage(),
  tick: 0,
};

const listeners = new Set<() => void>();
const broadcast = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

// ============================================================
// Auto-refresh timer
// ============================================================
let autoTimer: ReturnType<typeof setInterval> | null = null;

function startAutoTimer() {
  if (autoTimer || typeof window === "undefined") return;
  autoTimer = setInterval(() => {
    void refreshSilently();
  }, AUTO_REFRESH_INTERVAL_MS);
}

function stopAutoTimer() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
}

// Já liga o timer no boot do módulo se a preferência estava ativa.
if (typeof window !== "undefined" && state.autoRefreshEnabled) {
  startAutoTimer();
}

// ============================================================
// Núcleo do refresh
// ============================================================
let inflight = false;

async function doRefresh(): Promise<void> {
  if (inflight) return;
  inflight = true;
  state.refreshing = true;
  broadcast();
  try {
    await reloadAllData();
    state.lastRefresh = new Date();
    state.tick += 1;
  } finally {
    state.refreshing = false;
    inflight = false;
    broadcast();
  }
}

/** Refresh manual — mostra toast (loading → success/error). */
export async function refreshNow(): Promise<void> {
  if (inflight) return;
  const p = doRefresh();
  notify.asyncOp(p, {
    loading: "Atualizando dados…",
    success: "Dados atualizados com sucesso",
    error: "Erro ao atualizar: ",
  });
  try {
    await p;
  } catch {
    // Erro já mostrado via toast.
  }
}

/** Refresh silencioso (usado pelo timer do auto-refresh). */
async function refreshSilently(): Promise<void> {
  try {
    await doRefresh();
  } catch {
    // Silencioso de propósito — falha de auto-refresh não interrompe o usuário.
  }
}

/**
 * Refresh silencioso ao VOLTAR pro app (PWA reaberto do background / aba
 * voltando ao foco). Com throttle: no máximo 1 a cada 30s, pra não martelar
 * o Supabase em alt-tabs rápidos. Registrado no DataLoader (raiz do app).
 */
let lastFocusRefresh = 0;
export function refreshOnAppFocus(): void {
  const agora = Date.now();
  if (agora - lastFocusRefresh < 30_000) return;
  lastFocusRefresh = agora;
  void refreshSilently();
}

// ============================================================
// Toggle do auto-refresh (persiste em localStorage)
// ============================================================
export function setAutoRefresh(enabled: boolean): void {
  state.autoRefreshEnabled = enabled;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(AUTO_REFRESH_KEY, enabled ? "true" : "false");
    } catch {
      // sem localStorage (private mode etc.) — segue só em memória
    }
  }
  if (enabled) startAutoTimer();
  else stopAutoTimer();
  broadcast();
}

// ============================================================
// Hooks
// ============================================================
export function useRefreshing(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.refreshing,
    () => false,
  );
}

export function useLastRefresh(): Date | null {
  return useSyncExternalStore(
    subscribe,
    () => state.lastRefresh,
    () => null,
  );
}

/**
 * Páginas com fetch local (ex: /admin/producoes) usam isso como dependência
 * de `useEffect` pra disparar reload junto com o refresh global.
 */
export function useRefreshTick(): number {
  return useSyncExternalStore(
    subscribe,
    () => state.tick,
    () => 0,
  );
}

export function useAutoRefresh(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.autoRefreshEnabled,
    () => false,
  );
}
