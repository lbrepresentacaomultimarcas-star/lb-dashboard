import type { ReactNode } from "react";

/** Personagens originais, em SVG: leves e nítidos em qualquer tamanho. */
export const PERSONAGENS = [
  { tipo: "papai-noel", nome: "Papai Noel" },
  { tipo: "mamae-noel", nome: "Mamãe Noel" },
  { tipo: "duende", nome: "Duende Chefe" },
  { tipo: "rena", nome: "Rena Veloz" },
  { tipo: "presentes", nome: "Mestre dos Presentes" },
  { tipo: "guardiao", nome: "Guardião do Natal" },
] as const;

export type TipoPersonagem = (typeof PERSONAGENS)[number]["tipo"];

export function personagemPadrao(id: string): TipoPersonagem {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PERSONAGENS[h % PERSONAGENS.length].tipo;
}

export function nomePersonagem(tipo: string) {
  return PERSONAGENS.find((p) => p.tipo === tipo)?.nome ?? "Duende Chefe";
}

const PELE = "#f6c9a5";

function Olhos({ y = 52, dx = 11 }: { y?: number; dx?: number }) {
  return (
    <>
      <circle cx={50 - dx} cy={y} r="3.2" fill="#2b1a12" />
      <circle cx={50 + dx} cy={y} r="3.2" fill="#2b1a12" />
      <circle cx={49 - dx} cy={y - 1} r="1" fill="#fff" />
      <circle cx={49 + dx} cy={y - 1} r="1" fill="#fff" />
    </>
  );
}

function Bochechas({ y = 60 }: { y?: number }) {
  return (
    <>
      <circle cx="33" cy={y} r="5" fill="#ef8a80" opacity="0.65" />
      <circle cx="67" cy={y} r="5" fill="#ef8a80" opacity="0.65" />
    </>
  );
}

const DESENHOS: Record<TipoPersonagem, { fundo: string; arte: ReactNode }> = {
  "papai-noel": {
    fundo: "#14553a",
    arte: (
      <>
        <path d="M24 42C26 16 58 8 76 26l12 22-10 3-8-12Z" fill="#c8202f" />
        <circle cx="86" cy="52" r="7" fill="#fff" />
        <ellipse cx="50" cy="55" rx="25" ry="23" fill={PELE} />
        <path d="M21 58c4 34 54 34 58 0-6 8-13 9-18 6-6 5-16 5-22 0-5 3-12 2-18-6Z" fill="#fff" />
        <rect x="20" y="36" width="60" height="12" rx="6" fill="#fff" />
        <Olhos y={54} />
        <Bochechas />
        <circle cx="50" cy="61" r="4" fill="#e9877b" />
        <path d="M44 70q6 5 12 0" stroke="#c8202f" strokeWidth="2.500" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  "mamae-noel": {
    fundo: "#8f1a28",
    arte: (
      <>
        <circle cx="50" cy="17" r="10" fill="#e8e4df" />
        <path d="M22 58C18 24 82 24 78 58l4 16H18Z" fill="#e8e4df" />
        <ellipse cx="50" cy="56" rx="23" ry="23" fill={PELE} />
        <path d="M27 49c8-16 38-16 46 0-10-6-36-6-46 0Z" fill="#e8e4df" />
        <circle cx="39" cy="54" r="7" fill="none" stroke="#b8862b" strokeWidth="2" />
        <circle cx="61" cy="54" r="7" fill="none" stroke="#b8862b" strokeWidth="2" />
        <path d="M46 54h8" stroke="#b8862b" strokeWidth="2" />
        <Olhos y={54} />
        <Bochechas y={64} />
        <path d="M43 67q7 6 14 0" stroke="#c8202f" strokeWidth="2.500" fill="none" strokeLinecap="round" />
        <path d="M26 82c8-6 40-6 48 0v18H26Z" fill="#fff" />
        <circle cx="50" cy="84" r="4" fill="#1f9d55" />
      </>
    ),
  },
  duende: {
    fundo: "#a51f2d",
    arte: (
      <>
        <path d="M23 56 10 44l17-2ZM77 56l13-12-17-2Z" fill={PELE} />
        <ellipse cx="50" cy="60" rx="25" ry="24" fill={PELE} />
        <path d="M24 46C30 22 52 10 82 8L70 28l6 18Z" fill="#1f9d55" />
        <circle cx="83" cy="9" r="5.500" fill="#f6d365" />
        <path d="M21 42h58v9H21Z" fill="#f6d365" />
        <Olhos y={60} />
        <Bochechas y={68} />
        <path d="M41 72q9 8 18 0" stroke="#8a3b2a" strokeWidth="2.500" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  rena: {
    fundo: "#1b6e48",
    arte: (
      <>
        <path d="M32 34C24 24 22 14 25 6m-1 16-11-5m16 13-13 3M68 34c8-10 10-20 7-28m1 16 11-5m-16 13 13 3" stroke="#d9a862" strokeWidth="4.500" fill="none" strokeLinecap="round" />
        <ellipse cx="20" cy="50" rx="11" ry="6" fill="#9a673f" transform="rotate(20 20 50)" />
        <ellipse cx="80" cy="50" rx="11" ry="6" fill="#9a673f" transform="rotate(-20 80 50)" />
        <path d="M27 50c0-30 46-30 46 0 0 20-10 40-23 40S27 70 27 50Z" fill="#a9734a" />
        <ellipse cx="50" cy="74" rx="17" ry="15" fill="#e0bd92" />
        <Olhos y={51} dx={12} />
        <circle cx="50" cy="65" r="8" fill="#e8222f" />
        <circle cx="47" cy="62" r="2.300" fill="#fff" opacity="0.8" />
        <path d="M43 80q7 5 14 0" stroke="#5b3a24" strokeWidth="2.500" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  presentes: {
    fundo: "#14553a",
    arte: (
      <>
        <rect x="18" y="38" width="64" height="50" rx="6" fill="#d12c3a" />
        <rect x="13" y="30" width="74" height="16" rx="4" fill="#ad1f2d" />
        <rect x="43" y="30" width="14" height="58" fill="#f6d365" />
        <path d="M50 30C34 10 16 18 30 28c6 3 14 2 20 2Zm0 0c16-20 34-12 20-2-6 3-14 2-20 2Z" fill="#f6d365" stroke="#c99a2e" strokeWidth="1.500" />
        <circle cx="33" cy="62" r="4" fill="#fff" />
        <circle cx="67" cy="62" r="4" fill="#fff" />
        <circle cx="33" cy="62" r="2" fill="#2b1a12" />
        <circle cx="67" cy="62" r="2" fill="#2b1a12" />
        <path d="M29 74q4 4 8 0M63 74q4 4 8 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  guardiao: {
    fundo: "#7c1622",
    arte: (
      <>
        <rect x="43" y="82" width="14" height="13" fill="#6b4226" />
        <path d="M50 12 70 40H60l18 24H66l16 20H18l16-20H22l18-24H30Z" fill="#23925a" />
        <path d="m50 1 3.500 8 8.500.8-6.500 5.500 2 8.500-7.500-4.500-7.500 4.500 2-8.500-6.500-5.500 8.500-.8Z" fill="#f6d365" />
        <Olhos y={53} dx={10} />
        <path d="M43 62q7 6 14 0" stroke="#fff" strokeWidth="2.500" fill="none" strokeLinecap="round" />
        <circle cx="31" cy="72" r="3.500" fill="#ff5a5f" />
        <circle cx="69" cy="72" r="3.500" fill="#f6d365" />
        <circle cx="50" cy="76" r="3.500" fill="#cfe9f5" />
        <circle cx="38" cy="42" r="2.500" fill="#f6d365" />
        <circle cx="62" cy="42" r="2.500" fill="#ff5a5f" />
      </>
    ),
  },
};

export function Personagem({ tipo, size = 48, titulo }: { tipo: string; size?: number; titulo?: string }) {
  const d = DESENHOS[tipo as TipoPersonagem] ?? DESENHOS.duende;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={titulo ?? nomePersonagem(tipo)}
      style={{ borderRadius: "50%", flex: "none", background: d.fundo }}
    >
      {d.arte}
    </svg>
  );
}
