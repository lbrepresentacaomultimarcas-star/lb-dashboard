"use client";

import { useEffect } from "react";

/**
 * Registra o service worker do PWA (só em produção, browser com suporte).
 */
export function PwaRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // procura atualização já no load
          reg.update().catch(() => {});
          // quando um NOVO service worker é encontrado, ao ativá-lo recarrega a
          // página UMA vez — assim todo deploy novo aparece sozinho (sem F5).
          reg.addEventListener("updatefound", () => {
            const novo = reg.installing;
            if (!novo) return;
            // só recarrega se JÁ havia um SW controlando (é atualização, não a
            // primeira instalação).
            const ehAtualizacao = !!navigator.serviceWorker.controller;
            novo.addEventListener("statechange", () => {
              if (novo.state === "activated" && ehAtualizacao) {
                window.location.reload();
              }
            });
          });
        })
        .catch(() => {
          /* falha silenciosa — app funciona sem SW */
        });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
