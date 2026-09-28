"use client";

import { useEffect } from "react";

/**
 * Registra o service worker do PWA (só em produção, browser com suporte).
 *
 * POR QUE O `?v=` NO ENDEREÇO
 *
 * O navegador decide se há versão nova comparando o ARQUIVO do service worker
 * byte a byte. Como `public/sw.js` é o mesmo em todo deploy, ele nunca via
 * diferença: nenhuma atualização era detectada, o `updatefound` abaixo nunca
 * disparava, e o cache antigo nunca era limpo — a última troca manual da
 * versão tinha sido em 07/08/2026. Correções publicadas depois disso podiam
 * demorar dias para chegar no navegador de quem já tinha o app aberto.
 *
 * Com a versão do deploy no endereço, cada publicação vira um endereço novo:
 * o navegador instala, o service worker apaga os caches das versões
 * anteriores e a página recarrega sozinha.
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
      const versao = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
      navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(versao)}`)
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
