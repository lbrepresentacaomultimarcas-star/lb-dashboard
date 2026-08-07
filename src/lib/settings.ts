"use client";

import { useSyncExternalStore } from "react";

const PREFIX = "lb:setting:";
export type ImageSettingKey =
  | "logo_principal"
  | "logo_parceira"
  | "logo_ranking"
  | "imagem_meta_1"
  | "imagem_meta_2"
  | "fundo_proposta";

/** Preferências booleanas (ex.: exibir a logo parceira no co-branding). */
export type BoolSettingKey = "exibir_logo_parceira";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const cache = new Map<string, { raw: string | null; value: string | null }>();

function read(key: ImageSettingKey): string | null {
  if (typeof window === "undefined") return null;
  const full = PREFIX + key;
  const raw = (() => {
    try {
      return localStorage.getItem(full);
    } catch {
      return null;
    }
  })();
  const c = cache.get(full);
  if (c && c.raw === raw) return c.value;
  cache.set(full, { raw, value: raw });
  return raw;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useImageSetting(key: ImageSettingKey): string | null {
  return useSyncExternalStore(subscribe, () => read(key), () => null);
}

/** Lê uma preferência booleana; se nunca definida, devolve `padrao`. */
function readBool(key: BoolSettingKey, padrao: boolean): boolean {
  if (typeof window === "undefined") return padrao;
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? padrao : v === "1";
  } catch {
    return padrao;
  }
}

export function useBoolSetting(key: BoolSettingKey, padrao = true): boolean {
  return useSyncExternalStore(subscribe, () => readBool(key, padrao), () => padrao);
}

export const settings = {
  set(key: ImageSettingKey, dataUrl: string | null) {
    if (typeof window === "undefined") return;
    const full = PREFIX + key;
    if (dataUrl) localStorage.setItem(full, dataUrl);
    else localStorage.removeItem(full);
    cache.delete(full);
    notify();
  },
  get: read,
  setBool(key: BoolSettingKey, val: boolean) {
    if (typeof window === "undefined") return;
    localStorage.setItem(PREFIX + key, val ? "1" : "0");
    notify();
  },
  getBool: readBool,
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key?.startsWith(PREFIX)) {
      cache.delete(e.key);
      notify();
    }
  });
}

/** Lê um arquivo de input como data URL (base64). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}
