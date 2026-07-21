"use client";

import { useSyncExternalStore } from "react";

// Barramento mínimo de sincronização em tempo real.
// O store bumpa aqui sempre que um evento REALTIME do Supabase recarrega um
// dataset; hooks com fetch PRÓPRIO (ex.: ranking via RPC ranking_dados)
// escutam pra refazer a busca na hora — sem esperar foco/refresh manual.
// Arquivo sem imports do app de propósito (evita ciclo store ↔ refresh).

let tick = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** Debounce curto: um lote de eventos (várias linhas/tabelas) vira UM aviso. */
export function bumpSync() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    tick += 1;
    listeners.forEach((l) => l());
  }, 250);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useSyncTick(): number {
  return useSyncExternalStore(subscribe, () => tick, () => 0);
}
