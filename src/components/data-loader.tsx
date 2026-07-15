"use client";

import { useEffect } from "react";
import { initStore } from "@/lib/store";
import { refreshOnAppFocus } from "@/lib/refresh";

export function DataLoader({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initStore();
    // Abrir/voltar pro app (PWA saindo do background, aba retomando o foco)
    // → re-busca os dados do Supabase automaticamente (com throttle de 30s).
    const aoVoltar = () => {
      if (document.visibilityState === "visible") refreshOnAppFocus();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);
  return <>{children}</>;
}
