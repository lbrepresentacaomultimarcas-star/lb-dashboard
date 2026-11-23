"use client";

import { useEffect } from "react";
import { useReady, useSession, useTemaAtivo, useTemas } from "@/lib/store";
import { aplicarTemaVisual, temaVisualDoSlug, useTemaVisual } from "@/lib/tema-visual";
import { Personagem } from "@/components/personagens-natal";

/**
 * Mantém o <html> em dia com o tema global salvo no banco e desenha a cena de
 * fundo. Só decide depois de carregar os temas de uma sessão real: na tela de
 * login, sem acesso ao banco, vale o último tema salvo neste aparelho.
 */
export function TemaVisualGlobal() {
  const ready = useReady();
  const session = useSession();
  const temas = useTemas();
  const ativo = useTemaAtivo();
  const visual = useTemaVisual();

  useEffect(() => {
    if (!ready || !session || temas.length === 0) return;
    aplicarTemaVisual(temaVisualDoSlug(ativo.slug));
  }, [ready, session, temas.length, ativo.slug]);

  if (visual === "neon") return <CenaNeon />;
  if (visual === "natal") return <CenaNatal />;
  return null;
}

const PREDIOS: [number, number, number][] = [
  [0, 90, 96], [84, 58, 150], [136, 74, 112], [204, 46, 190], [244, 92, 128], [330, 62, 208],
  [386, 84, 142], [464, 54, 244], [512, 96, 164], [602, 66, 118], [662, 50, 226], [706, 94, 150],
  [794, 70, 196], [858, 88, 122], [940, 56, 262], [990, 86, 172], [1070, 62, 124], [1126, 80, 204],
  [1200, 58, 140], [1252, 92, 182], [1338, 102, 112],
];

function CenaNeon() {
  return (
    <div className="lbx-cena" aria-hidden>
      <svg className="lbx-horizonte" viewBox="0 0 1440 300" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="lbx-sol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb347" />
            <stop offset="0.5" stopColor="#ff2d9b" />
            <stop offset="1" stopColor="#8b3dff" />
          </linearGradient>
          <linearGradient id="lbx-predio" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a1450" />
            <stop offset="1" stopColor="#0d0619" />
          </linearGradient>
        </defs>
        <circle cx="1040" cy="178" r="104" fill="url(#lbx-sol)" opacity="0.72" />
        {[128, 154, 180, 206, 232].map((y, i) => (
          <rect key={y} x="920" y={y} width="240" height={3 + i} fill="#0d0619" />
        ))}
        {PREDIOS.map(([x, w, h]) => (
          <g key={x}>
            <rect x={x} y={300 - h} width={w} height={h} fill="url(#lbx-predio)" stroke="#ff2d9b" strokeOpacity="0.38" />
            {Array.from({ length: Math.floor(h / 34) }).map((_, l) => (
              <rect key={l} x={x + 10} y={300 - h + 13 + l * 32} width={w - 20} height="3" fill={l % 2 ? "#19c8ff" : "#ff6cbe"} opacity="0.42" />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

function Arvore({ x, escala }: { x: number; escala: number }) {
  return (
    <g transform={`translate(${x} ${220 - 200 * escala}) scale(${escala})`}>
      <rect x="-9" y="172" width="18" height="28" fill="#5b3a24" />
      <path d="M0 0 62 86H34l44 52H44l46 48H-90l46-48H-78l44-52H-62Z" fill="#1c6b42" />
      <path d="M0 0 62 86H34l44 52H44l46 48H0Z" fill="#14553a" />
      <circle cx="-24" cy="104" r="5" fill="#ff5a5f" />
      <circle cx="26" cy="74" r="5" fill="#f6d365" />
      <circle cx="-38" cy="160" r="5" fill="#f6d365" />
      <circle cx="42" cy="152" r="5" fill="#ff5a5f" />
      <path d="m0-15 4.500 10 11 1-8 7 2.500 11-10-6-10 6 2.500-11-8-7 11-1Z" fill="#f6d365" />
    </g>
  );
}

function CenaNatal() {
  return (
    <div className="lbx-cena" aria-hidden>
      {Array.from({ length: 16 }).map((_, i) => (
        <span
          key={i}
          className="lbx-floco"
          style={{
            left: `${(i * 6.37 + 2) % 100}%`,
            width: 2 + (i % 3),
            height: 2 + (i % 3),
            animationDuration: `${13 + (i % 5) * 3}s`,
            animationDelay: `-${(i * 2.3) % 14}s`,
          }}
        />
      ))}
      <svg className="lbx-arvores" viewBox="0 0 430 220">
        <Arvore x={110} escala={0.72} />
        <Arvore x={300} escala={1} />
        <rect x="170" y="184" width="46" height="36" rx="3" fill="#b3202f" />
        <rect x="189" y="184" width="8" height="36" fill="#f6d365" />
        <rect x="222" y="196" width="32" height="24" rx="3" fill="#f6d365" />
        <rect x="235" y="196" width="6" height="24" fill="#b3202f" />
      </svg>
    </div>
  );
}

/** Marca discreta da edição na tela de login. */
export function SeloTemaLogin() {
  const visual = useTemaVisual();
  if (visual === "neon") {
    return (
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.28em] text-[var(--lbx-brand-texto)]">
        Neon City Edition
      </p>
    );
  }
  if (visual === "natal") {
    return (
      <div className="mb-3">
        <div className="mb-2 flex justify-center gap-2">
          <Personagem tipo="duende" size={42} />
          <Personagem tipo="papai-noel" size={54} />
          <Personagem tipo="rena" size={42} />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--lbx-brand-texto)]">
          Christmas Edition
        </p>
      </div>
    );
  }
  return null;
}
