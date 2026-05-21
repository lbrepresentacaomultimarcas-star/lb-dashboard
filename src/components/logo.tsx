"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useImageSetting } from "@/lib/settings";

type Props = {
  size?: number;
  className?: string;
  showTextFallback?: boolean;
  /** Qual override de imagem usar (configurável em /configuracoes). */
  variant?: "logo_principal" | "logo_ranking";
};

export function Logo({
  size = 32,
  className,
  showTextFallback = true,
  variant = "logo_principal",
}: Props) {
  const override = useImageSetting(variant);
  const [erro, setErro] = useState(false);
  const src = override ?? "/logo.jpg";

  if (erro && !override) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-xl bg-[var(--color-brand)] font-bold text-white",
          className,
        )}
        style={{ width: size, height: size, fontSize: Math.max(12, size * 0.4) }}
      >
        {showTextFallback ? "LB" : ""}
      </div>
    );
  }

  // Quando vier de localStorage (data URL), <img> normal evita o otimizador.
  if (override) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt="LB Representações"
        width={size}
        height={size}
        className={cn("object-contain", className)}
        style={{ width: size, height: size }}
        onError={() => setErro(true)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt="LB Representações"
      width={size}
      height={size}
      priority
      onError={() => setErro(true)}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
