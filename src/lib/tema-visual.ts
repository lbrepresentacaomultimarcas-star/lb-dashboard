"use client";

import { useSyncExternalStore } from "react";

/**
 * Identidade visual GLOBAL do CRM. O tema ativo continua vindo da tabela
 * `temas`; aqui ele só vira um atributo no <html> (`data-lb-tema`), e o CSS
 * (temas-visuais.css) repinta o sistema inteiro a partir dele.
 */
export type TemaVisual = "padrao" | "neon" | "natal";

export const SLUG_NEON = "neon-city";
export const SLUG_NATAL = "natal";
export const SLUG_PADRAO = "lb-premium";

export const CHAVE_TEMA_VISUAL = "lb:tema-visual";

export function temaVisualDoSlug(slug: string | undefined): TemaVisual {
  if (slug === SLUG_NEON) return "neon";
  if (slug === SLUG_NATAL) return "natal";
  return "padrao";
}

/**
 * Roda antes da primeira pintura para não piscar o tema padrão. É também o que
 * permite a tela de login (sem acesso ao banco) abrir com o último tema.
 */
export const SCRIPT_BOOT_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(CHAVE_TEMA_VISUAL)});if(t==="neon"||t==="natal")document.documentElement.setAttribute("data-lb-tema",t)}catch(e){}`;

function lerDoDocumento(): TemaVisual {
  if (typeof document === "undefined") return "padrao";
  const t = document.documentElement.getAttribute("data-lb-tema");
  return t === "neon" || t === "natal" ? t : "padrao";
}

let atual: TemaVisual = lerDoDocumento();
const ouvintes = new Set<() => void>();

export function aplicarTemaVisual(tema: TemaVisual) {
  try {
    localStorage.setItem(CHAVE_TEMA_VISUAL, tema);
  } catch {
    /* navegação privada: o tema só não fica salvo neste aparelho */
  }
  if (tema === atual && tema === lerDoDocumento()) return;
  atual = tema;
  if (tema === "padrao") document.documentElement.removeAttribute("data-lb-tema");
  else document.documentElement.setAttribute("data-lb-tema", tema);
  ouvintes.forEach((fn) => fn());
}

function assinar(fn: () => void) {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

export function useTemaVisual(): TemaVisual {
  return useSyncExternalStore(assinar, () => atual, () => "padrao");
}
