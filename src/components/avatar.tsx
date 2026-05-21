"use client";

import { useState } from "react";
import { avatarPublicUrl } from "@/lib/avatar-url";
import { cn } from "@/lib/utils";

function initials(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function colorFor(nome: string) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

export function Avatar({
  id,
  nome,
  size = 40,
  className,
  ring,
}: {
  id?: string | null;
  nome: string;
  size?: number;
  className?: string;
  ring?: string;
}) {
  const [erro, setErro] = useState(false);
  const url = avatarPublicUrl(id);

  if (url && !erro) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={nome}
        width={size}
        height={size}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size, boxShadow: ring }}
        onError={() => setErro(true)}
      />
    );
  }

  // Fallback: iniciais com cor derivada do nome
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.36),
        backgroundImage: `linear-gradient(135deg, ${colorFor(nome)} 0%, rgba(0,0,0,0.55) 100%)`,
        boxShadow: ring,
      }}
    >
      {initials(nome || "?")}
    </div>
  );
}
