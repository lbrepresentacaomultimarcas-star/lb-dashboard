"use client";

import { useMemo } from "react";
import {
  Activity,
  Award,
  Crown,
  Flame,
  Minus,
  Rocket,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useMetas, useVendas, useVendedores } from "@/lib/store";
import { faturamentoMensal } from "@/lib/selectors";
import { useRankingMensal } from "@/lib/use-ranking";
import { useCountUp } from "@/lib/use-count-up";
import { brl, monthLabel, pct, todayMonth } from "@/lib/utils";
import type { VendedorComDesempenho } from "@/lib/types";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/avatar";

const PODIUM_ORDER: (0 | 1 | 2)[] = [1, 0, 2]; // 2º, 1º, 3º

const MOTIVACAO = [
  { frase: "Disciplina é fazer o que precisa ser feito, mesmo quando você não quer fazer.", tag: "Foco • Força • Fé" },
  { frase: "Quem não é visto, não é lembrado. Aparece no topo.", tag: "Visibilidade • Ação" },
  { frase: "Cada não te aproxima do próximo sim. Continua ligando.", tag: "Persistência" },
  { frase: "Meta não é teto, é piso. Voa mais alto.", tag: "Ambição" },
  { frase: "Pipeline cheio, mente tranquila. Alimenta o funil todo dia.", tag: "Consistência" },
];

type Tone = {
  ring: string;   // cor do anel/borda
  drum: string;   // gradiente do cilindro
  light: string;  // brilho/numero
  glow: string;   // aura atrás do avatar
};

const TONES: Tone[] = [
  { // 1º ouro
    ring: "#f59e0b",
    drum: "linear-gradient(180deg,#7a4d06 0%,#3a2403 55%,#160d02 100%)",
    light: "#fcd34d",
    glow: "radial-gradient(circle,rgba(250,204,21,0.5),transparent 70%)",
  },
  { // 2º azul
    ring: "#3b82f6",
    drum: "linear-gradient(180deg,#1e3a8a 0%,#10204d 55%,#070d1f 100%)",
    light: "#93c5fd",
    glow: "radial-gradient(circle,rgba(59,130,246,0.45),transparent 70%)",
  },
  { // 3º vermelho
    ring: "#f43f5e",
    drum: "linear-gradient(180deg,#9f1239 0%,#4d0a1c 55%,#1f060d 100%)",
    light: "#fda4af",
    glow: "radial-gradient(circle,rgba(244,63,94,0.4),transparent 70%)",
  },
];

function badgeFor(d: VendedorComDesempenho, index: number) {
  if (index === 0) return { label: "Top Closer", cls: "border-yellow-400/50 bg-yellow-400/15 text-yellow-300", icon: Crown };
  if (d.pctMeta >= 100) return { label: "Bateu meta", cls: "border-emerald-400/50 bg-emerald-400/15 text-emerald-300", icon: Trophy };
  if (d.pctMeta >= 70) return { label: "Em ascensão", cls: "border-indigo-400/50 bg-indigo-400/15 text-indigo-300", icon: Rocket };
  if (d.vendas >= 5) return { label: "Sequência 5", cls: "border-amber-400/50 bg-amber-400/15 text-amber-300", icon: Flame };
  return { label: "Persistente", cls: "border-rose-400/50 bg-rose-400/15 text-rose-300", icon: Star };
}

function AnimatedBRL({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{brl(v)}</span>;
}

function Laurel({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 120 84" style={{ color }} aria-hidden>
      {[0, 1].map((m) => (
        <g key={m} transform={m === 1 ? "scale(-1,1) translate(-120,0)" : ""}>
          <path d="M60 82 C 30 74 17 50 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ellipse
              key={i}
              cx={20 + i * 1.5}
              cy={24 + i * 10}
              rx="7"
              ry="3.4"
              transform={`rotate(${-55 + i * 9} ${20 + i * 1.5} ${24 + i * 10})`}
              fill="currentColor"
              opacity="0.8"
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 0;
    const y = 32 - ((v - min) / range) * 28 - 2;
    return `${x},${y}`;
  });
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-12 w-full">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,32 ${pts.join(" ")} 100,32`} fill="url(#spark)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function RankingPage() {
  const vendedores = useVendedores();
  const vendas = useVendas();
  const metas = useMetas();
  const mes = todayMonth();

  const ranking = useRankingMensal(mes, vendedores, vendas, metas);
  const top3 = ranking.slice(0, 3);
  const resto = ranking.slice(3, 10); // posições 4-10 na tabela
  const total = ranking.reduce((a, d) => a + d.vendido, 0);
  const metaGlobal = ranking.reduce((a, d) => a + d.metaMensal, 0);
  const pctGlobal = metaGlobal > 0 ? (total / metaGlobal) * 100 : 0;

  const serie = useMemo(() => faturamentoMensal(vendas, 8), [vendas]);
  const crescimento = useMemo(() => {
    const s = serie.slice(-2);
    if (s.length < 2 || s[0].total === 0) return 0;
    return ((s[1].total - s[0].total) / s[0].total) * 100;
  }, [serie]);

  const champ = top3[0];
  const mot = MOTIVACAO[new Date().getDate() % MOTIVACAO.length];

  return (
    <div
      className="-m-4 md:-m-6 relative min-h-[calc(100vh-4rem)] overflow-hidden p-4 md:p-6 pb-24 md:pb-6"
      style={{
        background:
          "radial-gradient(ellipse at 25% 0%, rgba(99,102,241,0.16), transparent 55%), radial-gradient(ellipse at 85% 95%, rgba(168,85,247,0.15), transparent 55%), #06070d",
      }}
    >
      {/* estrelas */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 60% 70%, #fff, transparent), radial-gradient(1.5px 1.5px at 80% 20%, rgba(255,255,255,.7), transparent), radial-gradient(1px 1px at 40% 80%, #fff, transparent), radial-gradient(2px 2px at 10% 60%, rgba(255,255,255,.8), transparent)",
          backgroundSize: "300px 300px, 400px 400px, 500px 500px, 350px 350px, 450px 450px",
        }}
      />
      {/* blobs de luz */}
      <div className="lb-drift pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.35), transparent 70%)" }} />
      <div className="lb-drift pointer-events-none absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.3), transparent 70%)", animationDelay: "5s" }} />
      {/* grid futurista */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64 opacity-20"
        style={{
          backgroundImage: "linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to top, #000, transparent)",
          WebkitMaskImage: "linear-gradient(to top, #000, transparent)",
          transform: "perspective(420px) rotateX(60deg)",
          transformOrigin: "bottom",
        }}
      />
      {/* partículas de luz subindo (fumaça futurista) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className="lb-rise absolute rounded-full"
            style={{
              left: `${(i * 6.3 + 4) % 100}%`,
              bottom: `${(i % 5) * 9}%`,
              width: i % 3 === 0 ? 4 : 2,
              height: i % 3 === 0 ? 4 : 2,
              background: i % 2 === 0 ? "rgba(250,204,21,.85)" : "rgba(129,140,248,.85)",
              boxShadow: i % 2 === 0 ? "0 0 8px rgba(250,204,21,.7)" : "0 0 8px rgba(129,140,248,.7)",
              animationDuration: `${7 + (i % 5) * 1.7}s`,
              animationDelay: `${(i % 7) * 0.9}s`,
            }}
          />
        ))}
      </div>
      {/* vinheta — mais contraste entre fundo e elementos */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 34%, transparent 38%, rgba(0,0,0,0.55) 100%)" }}
      />

      <div className="relative grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ===================== COLUNA PRINCIPAL ===================== */}
        <div className="space-y-7">
          {/* Header */}
          <header className="flex flex-wrap items-start justify-between gap-3 lb-fade-up">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-yellow-400" style={{ filter: "drop-shadow(0 0 10px rgba(250,204,21,.6))" }} />
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Ranking de vendas</h1>
                <p className="text-sm text-white/55">{monthLabel(mes)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-white/50">Total faturamento</p>
              <div className="flex items-center justify-end gap-2">
                <AnimatedBRL value={total} className="text-2xl font-bold text-emerald-400 tabular-nums md:text-3xl" />
                <span className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold ${crescimento >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                  {crescimento >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {pct(Math.abs(crescimento))}
                </span>
              </div>
              <p className="text-[11px] text-white/40">vs mês anterior</p>
            </div>
          </header>

          {/* ===================== PÓDIO ===================== */}
          {top3.length === 0 ? (
            <div className="lb-glass rounded-2xl p-12 text-center text-white/60">Sem vendedores pra ranquear ainda.</div>
          ) : (
            <div className="relative pt-24">
              {/* PALCO: disco de luz + neblina */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 flex justify-center">
                <div
                  className="h-40 w-[90%] rounded-[50%] blur-2xl"
                  style={{ background: "radial-gradient(ellipse at center, rgba(250,204,21,0.22), rgba(99,102,241,0.12) 45%, transparent 72%)" }}
                />
              </div>
              <div
                className="lb-fog pointer-events-none absolute inset-x-6 bottom-2 -z-10 h-24 rounded-[50%] blur-2xl"
                style={{ background: "radial-gradient(ellipse at center, rgba(255,255,255,0.10), transparent 70%)" }}
              />
              <div
                className="lb-fog pointer-events-none absolute inset-x-16 bottom-8 -z-10 h-16 rounded-[50%] blur-2xl"
                style={{ background: "radial-gradient(ellipse at center, rgba(168,85,247,0.16), transparent 70%)", animationDelay: "4s" }}
              />

              <div className="flex items-end justify-center gap-2 sm:gap-4 lg:gap-5">
              {PODIUM_ORDER.map((idx) => {
                const d = top3[idx];
                const tone = TONES[idx];
                const champion = idx === 0;
                const drumH = champion ? 160 : idx === 1 ? 108 : 88;
                const avatar = champion ? 124 : 80;
                const colW = champion ? "w-[44%] max-w-[330px]" : "w-[29%] max-w-[210px]";
                if (!d) {
                  return <div key={`e-${idx}`} className={colW} />;
                }
                const b = badgeFor(d, idx);
                return (
                  <div key={d.id} className={`lb-fade-up flex flex-col items-center ${colW} ${champion ? "z-10" : ""}`} style={{ animationDelay: `${idx * 0.1}s` }}>
                    {/* holofote campeão */}
                    {champion && (
                      <div
                        className="lb-spotlight pointer-events-none absolute -top-24 left-1/2 -z-10 h-[36rem] w-72 -translate-x-1/2"
                        style={{ background: "linear-gradient(to bottom, rgba(252,211,77,0.5), transparent 80%)", clipPath: "polygon(42% 0,58% 0,100% 100%,0 100%)", filter: "blur(12px)" }}
                      />
                    )}

                    {/* CARD DE VIDRO (flutuante) */}
                    <div className="lb-bob w-full" style={{ animationDelay: `${idx * 0.7}s` }}>
                    <div
                      className={`lb-glass-strong lb-podium-card relative w-full rounded-2xl px-3 pb-4 text-center ${champion ? "pt-20" : "pt-12"}`}
                      style={{
                        borderColor: `${tone.ring}80`,
                        boxShadow: champion
                          ? `0 0 110px -4px ${tone.ring}, 0 0 44px -6px ${tone.light}, 0 28px 72px -14px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.28)`
                          : `0 0 60px -8px ${tone.ring}, 0 24px 60px -14px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.22)`,
                      }}
                    >
                      {/* reflexo holográfico */}
                      <span className="lb-holo pointer-events-none absolute inset-0 rounded-2xl" aria-hidden />
                      {/* avatar sobreposto */}
                      <div className={`absolute left-1/2 -translate-x-1/2 ${champion ? "-top-14" : "-top-10"}`}>
                        <div className="relative">
                          {/* luz ambiente atrás do avatar */}
                          <div className="lb-aura absolute rounded-full" style={{ inset: champion ? "-2rem" : "-1.1rem", background: tone.glow, filter: "blur(3px)" }} />
                          {champion && (
                            <div className="lb-glow absolute -inset-10 rounded-full" style={{ background: tone.glow, opacity: 0.5 }} />
                          )}
                          {champion && (
                            <>
                              <Crown className="lb-float absolute -top-8 left-1/2 z-20 h-8 w-8 -translate-x-1/2 text-yellow-300" fill="currentColor" style={{ filter: "drop-shadow(0 0 12px rgba(253,224,71,.95))" }} />
                              {[0, 1, 2, 3, 4, 5].map((p) => (
                                <span key={p} className="pointer-events-none absolute bottom-2 left-1/2 h-1.5 w-1.5 rounded-full bg-yellow-300" style={{ animation: `lb-particle ${2 + (p % 3) * 0.6}s ease-in ${p * 0.4}s infinite`, marginLeft: `${(p - 2.5) * 16}px`, boxShadow: "0 0 6px rgba(253,224,71,.9)" }} />
                              ))}
                            </>
                          )}
                          <div className="lb-ring relative grid place-items-center rounded-full" style={{ ["--ring-c" as string]: tone.ring }}>
                            <Avatar id={d.id} nome={d.nome} size={avatar} className="relative" />
                          </div>
                        </div>
                      </div>

                      {/* badge flutuante */}
                      <span className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${b.cls}`}>
                        <b.icon className="h-2.5 w-2.5" /> {b.label}
                      </span>

                      <p className={`mt-1 truncate font-bold text-white ${champion ? "text-base sm:text-lg" : "text-sm"}`}>{d.nome}</p>
                      <AnimatedBRL value={d.vendido} className={`block font-extrabold text-emerald-400 tabular-nums ${champion ? "text-xl sm:text-2xl" : "text-lg"}`} />

                      {/* stats */}
                      <div className="mt-3 grid grid-cols-3 gap-1 border-t border-white/10 pt-2 text-center">
                        <div>
                          <p className="text-[8px] uppercase tracking-wider text-white/40">Vendas</p>
                          <p className="text-xs font-bold text-white tabular-nums">{d.vendas}</p>
                        </div>
                        <div>
                          <p className="text-[8px] uppercase tracking-wider text-white/40">% Meta</p>
                          <p className="text-xs font-bold text-white tabular-nums">{pct(d.pctMeta)}</p>
                        </div>
                        <div>
                          <p className="text-[8px] uppercase tracking-wider text-white/40">Comissão</p>
                          <p className="text-xs font-bold text-emerald-300 tabular-nums">{brl(d.comissao)}</p>
                        </div>
                      </div>
                      {/* barra */}
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className="relative h-full rounded-full transition-[width] duration-1000" style={{ width: `${Math.min(d.pctMeta, 100)}%`, background: "linear-gradient(90deg,#22c55e,#4ade80)" }}>
                          <span className="lb-bar-shine absolute inset-0" />
                        </div>
                      </div>
                      <p className="mt-1.5 text-[10px] text-white/45">Meta: {brl(d.metaMensal)}</p>
                    </div>
                    </div>

                    {/* MONUMENTO 3D (pedestal) */}
                    <div className="relative w-[80%]" style={{ height: drumH }}>
                      {/* degraus do monumento (atrás) */}
                      <div className="absolute -bottom-1 left-1/2 h-4 w-[116%] -translate-x-1/2 rounded-md" style={{ background: "linear-gradient(180deg,#2b3142,#0d1019)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.18), 0 8px 18px -4px rgba(0,0,0,.75)" }} />
                      <div className="absolute -bottom-5 left-1/2 h-4 w-[140%] -translate-x-1/2 rounded-md" style={{ background: "linear-gradient(180deg,#1b1f2d,#06080f)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.10), 0 14px 26px -6px rgba(0,0,0,.85)" }} />
                      {/* topo elíptico */}
                      <div className="absolute inset-x-0 top-0 h-4 rounded-[50%]" style={{ background: tone.light, opacity: 0.9, boxShadow: `0 0 22px ${tone.light}` }} />
                      {/* corpo */}
                      <div className="lb-pillar lb-cyl absolute inset-x-0 bottom-2 top-2 overflow-hidden" style={{ background: tone.drum, borderRadius: "10px 10px 16px 16px" }}>
                        {/* louros + número */}
                        <div className="absolute inset-0 grid place-items-center">
                          <div className="relative grid place-items-center">
                            <Laurel size={champion ? 120 : 80} color={tone.light} />
                            <span className="absolute font-black tabular-nums" style={{ color: tone.light, fontSize: champion ? 50 : 34, textShadow: `0 0 22px ${tone.light}` }}>{idx + 1}</span>
                          </div>
                        </div>
                      </div>
                      {/* base elíptica iluminada no chão */}
                      <div className="lb-glow absolute -bottom-1 left-1/2 h-4 w-[120%] -translate-x-1/2 rounded-[50%] blur-md" style={{ background: tone.light, opacity: 0.4 }} />
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {/* ===================== TOP 10 (4 a 10) ===================== */}
          <div className="lb-glass lb-fade-up rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-300" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Top 10 vendedores</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                    <th className="pb-2 pr-3">Posição</th>
                    <th className="pb-2 pr-3">Vendedor</th>
                    <th className="pb-2 pr-3 text-right">Faturamento</th>
                    <th className="hidden pb-2 pr-3 sm:table-cell">% Meta</th>
                    <th className="hidden pb-2 pr-3 text-right md:table-cell">Vendas</th>
                    <th className="pb-2 pr-3 text-right">Comissão</th>
                    <th className="hidden pb-2 text-right sm:table-cell">Evolução</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {resto.map((d, i) => {
                    const pos = i + 4;
                    const b = badgeFor(d, pos - 1);
                    return (
                      <tr key={d.id} className="group transition-colors hover:bg-white/5">
                        <td className="py-2.5 pr-3">
                          <span className="font-bold text-white/70 tabular-nums">{pos}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <Avatar id={d.id} nome={d.nome} size={32} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white">{d.nome}</p>
                              <span className={`inline-flex items-center gap-0.5 rounded border px-1 py-px text-[8px] font-bold uppercase ${b.cls}`}>
                                <b.icon className="h-2 w-2" /> {b.label}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-semibold text-white tabular-nums">{brl(d.vendido)}</td>
                        <td className="hidden py-2.5 pr-3 sm:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(d.pctMeta, 100)}%`, background: d.pctMeta >= 100 ? "#22c55e" : d.pctMeta >= 70 ? "#f59e0b" : "#6366f1" }} />
                            </div>
                            <span className="text-[10px] text-white/50 tabular-nums">{pct(d.pctMeta)}</span>
                          </div>
                        </td>
                        <td className="hidden py-2.5 pr-3 text-right text-white/70 tabular-nums md:table-cell">{d.vendas}</td>
                        <td className="py-2.5 pr-3 text-right font-semibold text-emerald-300 tabular-nums">{brl(d.comissao)}</td>
                        <td className="hidden py-2.5 text-right sm:table-cell">
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-white/40">
                            <Minus className="h-3 w-3" /> —
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {resto.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-xs text-white/40">
                        Só temos o pódio por enquanto — conforme a equipe vende, o Top 10 enche.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ===================== PAINEL DIREITO ===================== */}
        <aside className="space-y-4">
          <div className="lb-glass lb-fade-up flex items-center justify-center gap-3 rounded-2xl p-4">
            <Logo size={40} />
            <div className="border-l border-white/20 pl-3">
              <p className="text-[10px] uppercase tracking-widest text-white/60">LB</p>
              <p className="text-sm font-bold text-white">Representações</p>
            </div>
          </div>

          {/* Desempenho geral */}
          <div className="lb-glass lb-fade-up rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
                <Activity className="h-4 w-4 text-indigo-300" /> Desempenho geral
              </span>
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${crescimento >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                {crescimento >= 0 ? "+" : ""}{pct(crescimento)}
              </span>
            </div>
            <Sparkline data={serie.map((s) => s.total)} color="#818cf8" />
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/55">Total faturamento</span>
                <span className="font-semibold text-white tabular-nums">{brl(total)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/55">Meta total</span>
                <span className="font-semibold text-white tabular-nums">{brl(metaGlobal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/55">Atingimento</span>
                <span className="font-bold text-indigo-300 tabular-nums">{pct(pctGlobal)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="relative h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400 transition-[width] duration-1000" style={{ width: `${Math.min(pctGlobal, 100)}%` }}>
                  <span className="lb-bar-shine absolute inset-0" />
                </div>
              </div>
              {pctGlobal < 100 && (
                <p className="text-[11px] text-white/45">🔥 Faltam {brl(Math.max(metaGlobal - total, 0))} para a meta</p>
              )}
            </div>
          </div>

          {/* Destaque do mês */}
          {champ && (
            <div className="lb-glass lb-fade-up rounded-2xl p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
                <Crown className="h-4 w-4 text-yellow-300" /> Destaque do mês
              </p>
              <div className="flex items-center gap-3">
                <div className="lb-ring rounded-full" style={{ ["--ring-c" as string]: "#f59e0b" }}>
                  <Avatar id={champ.id} nome={champ.nome} size={52} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{champ.nome}</p>
                  <p className="text-sm font-bold text-emerald-400 tabular-nums">{brl(champ.vendido)}</p>
                  <p className="text-[10px] text-white/45">{champ.vendas} vendas · {pct(champ.pctMeta)} da meta</p>
                </div>
              </div>
            </div>
          )}

          {/* Últimas conquistas */}
          <div className="lb-glass lb-fade-up rounded-2xl p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
              <Award className="h-4 w-4 text-yellow-300" /> Últimas conquistas
            </p>
            <div className="space-y-2.5">
              {top3.map((d, i) => {
                const b = badgeFor(d, i);
                return (
                  <div key={d.id} className="flex items-center gap-2.5">
                    <Avatar id={d.id} nome={d.nome} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{d.nome}</p>
                      <p className="flex items-center gap-1 text-[10px] text-white/50">
                        <b.icon className="h-2.5 w-2.5" /> {i === 0 ? "Líder do ranking" : i === 1 ? "Subiu pro pódio" : "No pódio"}
                      </p>
                    </div>
                  </div>
                );
              })}
              {top3.length === 0 && <p className="text-xs text-white/40">Sem conquistas ainda</p>}
            </div>
          </div>

          {/* Motivação */}
          <div className="lb-glass lb-fade-up rounded-2xl border-indigo-400/20 p-4">
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-200">
              <Sparkles className="h-4 w-4" /> Motivação do dia
            </p>
            <p className="text-sm font-medium leading-snug text-white">“{mot.frase}”</p>
            <p className="mt-2 text-xs font-semibold text-indigo-300">{mot.tag}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
