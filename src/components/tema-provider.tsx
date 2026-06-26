"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tema } from "@/lib/temas";

/**
 * Converte o pacote do tema em variáveis CSS (`--tema-*`). Os componentes da
 * gamificação leem essas variáveis — então trocar o tema = trocar os valores,
 * sem tocar em lógica nenhuma.
 */
export function varsDoTema(tema: Tema): CSSProperties {
  const e = tema.estilo;
  const v: Record<string, string> = {
    "--tema-primaria": e.primaria ?? "#FACC15",
    "--tema-secundaria": e.secundaria ?? "#6366f1",
    "--tema-terciaria": e.terciaria ?? "#a855f7",
    "--tema-ouro": e.ouro ?? "#f59e0b",
    "--tema-prata": e.prata ?? "#3b82f6",
    "--tema-bronze": e.bronze ?? "#f43f5e",
    "--tema-texto": e.texto ?? "#ffffff",
    "--tema-bg": e.background ?? "#06070d",
  };
  if (e.fontePrincipal) v["--tema-fonte"] = e.fontePrincipal;
  return v as CSSProperties;
}

/**
 * Embrulha a área da gamificação aplicando as variáveis do tema ativo, a
 * webfont (se houver) e o CSS personalizado (escopado, sanitizado).
 */
export function TemaProvider({
  tema,
  className,
  style,
  children,
}: {
  tema: Tema;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  // Carrega a webfont do tema (uma vez por url).
  useEffect(() => {
    const url = tema.estilo.fonteUrl;
    if (!url) return;
    const id = `tema-fonte-${tema.slug}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }, [tema.estilo.fonteUrl, tema.slug]);

  // CSS personalizado: só CSS (remove < e > pra não fechar a tag nem injetar HTML).
  const css = (tema.estilo.cssPersonalizado ?? "").replace(/[<>]/g, "");

  return (
    <div className={cn("lb-tema", className)} style={{ ...varsDoTema(tema), ...style }}>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {children}
    </div>
  );
}
