"use client";

import { cn } from "@/lib/utils";
import { useBoolSetting, useImageSetting } from "@/lib/settings";

/**
 * Co-branding oficial LB: logo da LB Representações SEMPRE no canto esquerdo e a
 * logo parceira (Multimarcas) no canto direito, alinhadas na mesma altura, cada
 * uma sobre uma "plaquinha" clara (fica legível e elegante em fundo escuro).
 *
 * As imagens vêm das Configurações (uploads independentes) com fallback para os
 * arquivos padrão em /public. A logo parceira respeita a chave "Exibir logo
 * parceira" — desligada, aparece só a LB.
 */
export function MarcaDupla({
  height = 32,
  className,
  plaque = true,
}: {
  height?: number;
  className?: string;
  plaque?: boolean;
}) {
  const lb = useImageSetting("logo_principal") ?? "/logo-lb.jpg";
  const parceira = useImageSetting("logo_parceira") ?? "/logo-multimarcas.jpg";
  const mostrarParceira = useBoolSetting("exibir_logo_parceira", true);

  const placa = plaque
    ? "rounded-lg bg-white px-2.5 py-1 shadow-sm ring-1 ring-black/5"
    : "";

  return (
    <div className={cn("flex w-full items-center justify-between gap-3", className)}>
      <span className={cn("inline-flex items-center", placa)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={lb} alt="LB Representações" style={{ height }} className="w-auto object-contain" />
      </span>
      {mostrarParceira ? (
        <span className={cn("inline-flex items-center", placa)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={parceira}
            alt="Multimarcas Consórcios"
            style={{ height }}
            className="w-auto object-contain"
          />
        </span>
      ) : (
        <span aria-hidden />
      )}
    </div>
  );
}

/** Faixa fina de co-branding para o topo das telas (shell do app e login). */
export function BrandBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 md:px-6",
        className,
      )}
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <MarcaDupla height={30} />
    </div>
  );
}
