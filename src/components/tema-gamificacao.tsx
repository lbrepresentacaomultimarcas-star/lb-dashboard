"use client";

import type { Tema } from "@/lib/temas";

/**
 * Camada de EFEITOS do tema (partículas, confetes, brilho). Decorativa,
 * absolutamente posicionada, lê os flags do tema. `confeteAtivo` força os
 * confetes (ex.: quando uma barra de meta chega a 100%).
 */
export function EfeitosTema({ tema, confeteAtivo = false }: { tema: Tema; confeteAtivo?: boolean }) {
  const e = tema.estilo.efeitos ?? {};
  const cores = e.particulasCores?.length ? e.particulasCores : ["var(--tema-primaria)", "var(--tema-secundaria)"];
  const confete = e.confetes || confeteAtivo;
  if (!e.brilho && !e.particulas && !confete) return null;
  return (
    <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden" aria-hidden>
      {e.brilho && (
        <>
          <div className="lb-drift absolute -left-32 top-8 h-96 w-96 rounded-full opacity-50 blur-3xl" style={{ background: `radial-gradient(circle, ${cores[0]}55, transparent 70%)` }} />
          <div className="lb-drift absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full opacity-40 blur-3xl" style={{ background: `radial-gradient(circle, ${cores[1] ?? cores[0]}44, transparent 70%)`, animationDelay: "5s" }} />
        </>
      )}
      {e.particulas &&
        Array.from({ length: 16 }).map((_, i) => (
          <span
            key={`p${i}`}
            className="lb-rise absolute rounded-full"
            style={{
              left: `${(i * 6.3 + 4) % 100}%`,
              bottom: `${(i % 5) * 9}%`,
              width: i % 3 === 0 ? 4 : 2,
              height: i % 3 === 0 ? 4 : 2,
              background: cores[i % cores.length],
              boxShadow: `0 0 8px ${cores[i % cores.length]}`,
              animationDuration: `${7 + (i % 5) * 1.7}s`,
              animationDelay: `${(i % 7) * 0.9}s`,
            }}
          />
        ))}
      {/* faíscas que cintilam (faíscas/brilho) */}
      {e.brilho &&
        Array.from({ length: 10 }).map((_, i) => (
          <span
            key={`s${i}`}
            className="lb-sparkle absolute rounded-full"
            style={{
              left: `${(i * 9.7 + 5) % 100}%`,
              top: `${(i * 13 + 7) % 80}%`,
              width: 3,
              height: 3,
              background: "#fff",
              boxShadow: `0 0 6px ${cores[i % cores.length]}`,
              animationDelay: `${(i % 5) * 0.5}s`,
            }}
          />
        ))}
      {/* confetes (keyframe lb-confete global) — tamanhos variados, leves */}
      {confete &&
        Array.from({ length: 30 }).map((_, i) => (
          <span
            key={`c${i}`}
            className="absolute"
            style={{
              left: `${(i * 3.3 + 2) % 100}%`,
              top: "-5%",
              width: i % 4 === 0 ? 9 : 6,
              height: i % 4 === 0 ? 6 : 11,
              borderRadius: 1,
              background: cores[i % cores.length],
              animation: `lb-confete ${4 + (i % 4)}s linear ${(i % 6) * 0.5}s infinite`,
            }}
          />
        ))}
    </div>
  );
}

function Imagem({ src, className }: { src: string; className?: string }) {
  // URLs dinâmicas de tema (qualquer domínio) → <img> é o certo aqui.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} />;
}

/** Faixa da campanha (logo + nome + meta principal + texto motivacional). */
export function BannerCampanha({ tema }: { tema: Tema }) {
  const c = tema.estilo.campanha;
  const { logo, banner } = tema.estilo;
  if (!c?.nome && !c?.metaPrincipal && !banner && !logo) return null;
  return (
    <div
      className="lb-fade-up lb-shine lb-edge-glow relative overflow-hidden rounded-2xl border border-white/10 p-5"
      style={{
        background: banner
          ? `center/cover no-repeat url(${banner})`
          : "linear-gradient(120deg, color-mix(in srgb, var(--tema-primaria) 22%, transparent), color-mix(in srgb, var(--tema-secundaria) 22%, transparent))",
        boxShadow: "0 24px 60px -22px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1)",
      }}
    >
      {/* contraste + profundidade sobre a arte */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.32) 55%, transparent), radial-gradient(ellipse at 82% -20%, color-mix(in srgb, var(--tema-primaria) 30%, transparent), transparent 60%)" }}
      />
      {/* facho de luz no topo */}
      <div
        className="pointer-events-none absolute -top-10 left-1/4 h-24 w-1/2 blur-2xl"
        style={{ background: "color-mix(in srgb, var(--tema-primaria) 22%, transparent)" }}
      />
      <div className="relative flex items-center gap-4">
        {logo ? <Imagem src={logo} className="h-14 w-14 shrink-0 rounded-xl object-contain" /> : null}
        <div className="min-w-0">
          {c?.nome ? <p className="text-xl font-extrabold uppercase tracking-tight text-white sm:text-2xl" style={{ textShadow: "0 2px 14px rgba(0,0,0,0.6)" }}>{c.nome}</p> : null}
          {c?.metaPrincipal ? <p className="text-sm font-bold" style={{ color: "var(--tema-primaria)", textShadow: "0 1px 8px rgba(0,0,0,0.55)" }}>{c.metaPrincipal}</p> : null}
          {c?.textoMotivacional ? <p className="mt-0.5 text-xs text-white/75">{c.textoMotivacional}</p> : null}
        </div>
      </div>
    </div>
  );
}

/** Lista de premiações configuradas (medalhas, troféus, badges, títulos…). */
export function Premiacoes({ tema }: { tema: Tema }) {
  const lista = tema.estilo.premiacoes ?? [];
  if (lista.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {lista.map((p, i) => (
        <span
          key={i}
          title={p.criterio}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white"
        >
          {p.icone.startsWith("http") ? <Imagem src={p.icone} className="h-4 w-4 object-contain" /> : <span className="text-base leading-none">{p.icone}</span>}
          {p.nome}
        </span>
      ))}
    </div>
  );
}

/** Pódio temático compacto (pré-visualização). Usa as cores de medalha do tema. */
export function PodioPreview({ tema }: { tema: Tema }) {
  const cores = [tema.estilo.ouro ?? "#f59e0b", tema.estilo.prata ?? "#3b82f6", tema.estilo.bronze ?? "#f43f5e"];
  const medal = [tema.estilo.medalhas?.ouro ?? "🥇", tema.estilo.medalhas?.prata ?? "🥈", tema.estilo.medalhas?.bronze ?? "🥉"];
  const ordem: Array<0 | 1 | 2> = [1, 0, 2]; // 2º, 1º, 3º
  const alturas = [62, 92, 48];
  return (
    <div className="flex items-end justify-center gap-3">
      {ordem.map((idx) => (
        <div key={idx} className="flex flex-col items-center">
          <div
            className="grid h-12 w-12 place-items-center rounded-full text-xl"
            style={{ background: `${cores[idx]}22`, boxShadow: `0 0 0 2px ${cores[idx]}, 0 0 16px -2px ${cores[idx]}` }}
          >
            {medal[idx]}
          </div>
          <div className="mt-2 w-16 rounded-t-lg" style={{ height: alturas[idx], background: `linear-gradient(180deg, ${cores[idx]}, ${cores[idx]}55)` }}>
            <div className="grid h-full place-items-center text-lg font-black text-white/90">{idx + 1}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Barra de progresso de uma meta. PRESENTACIONAL: recebe o `atual` (lido de
 * dados que já existem, na tela consumidora) e o `alvo` (do tema). Não calcula
 * nada de negócio — só desenha a divisão.
 */
export function BarraProgresso({
  rotulo,
  atual,
  alvo,
  cor,
  fmt,
}: {
  rotulo: string;
  atual: number;
  alvo: number;
  cor?: string;
  fmt?: (n: number) => string;
}) {
  const pct = alvo > 0 ? Math.min(100, (atual / alvo) * 100) : 0;
  const atingiu = alvo > 0 && atual >= alvo;
  const c = cor ?? "var(--tema-primaria)";
  const f = fmt ?? ((n) => String(Math.round(n)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-white/70">{rotulo}</span>
        <span className="font-bold tabular-nums text-white">
          {f(atual)} / {f(alvo)} {atingiu ? "🎉" : ""}
        </span>
      </div>
      <div className="relative">
        <div className="h-3 w-full overflow-hidden rounded-full bg-white/10" style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)" }}>
          <div
            className="relative h-full rounded-full transition-[width] duration-1000"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${c}, var(--tema-secundaria))`, boxShadow: `0 0 12px ${c}` }}
          >
            <span className="lb-bar-shine absolute inset-0 rounded-full" />
          </div>
        </div>
        {/* marcador luminoso (bola) na ponta do progresso */}
        <span
          className="lb-marker absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80"
          style={{ left: `${pct}%`, background: c }}
        />
      </div>
    </div>
  );
}
