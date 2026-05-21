"use client";

import { useSyncExternalStore } from "react";

const PREFIX = "lb:setting:";
export type ImageSettingKey =
  | "logo_principal"
  | "logo_ranking"
  | "imagem_meta_1"
  | "imagem_meta_2"
  | "fundo_proposta";

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
