"use client";

import { useMemo } from "react";
import {
  Activity,
  Award,
  Crown,
  Flame,
  Rocket,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { useMetas, useVendas, useVendedores } from "@/lib/store";
import { faturamentoMensal } from "@/lib/selectors";
import { useRankingMensal } from "@/lib/use-ranking";
import { useCountUp } from "@/lib/use-count-up";
import { brl, monthLabel, pct, todayMonth } from "@/lib/utils";
import type { VendedorComDesempenho } from "@/lib/types";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/avatar";

const PODIUM_ORDER: (0 | 1 | 2)[] = [1, 0, 2]; // 2º, 1º, 3º na ordem visual

const MOTIVACAO = [
  "Quem não é visto, não é lembrado. Aparece no topo.",
  "Cada não te aproxima do próximo sim.",
  "Disciplina vence motivação. Liga pro próximo lead.",
  "Meta não é teto, é piso. Voa mais alto.",
  "O melhor vendedor não é o mais talentoso — é o mais consistente.",
  "Hoje é dia de bater meta. Bora.",
  "Pipeline cheio, mente tranquila. Alimenta o funil.",
];

type Tone = {
  ring: string;        // cor do anel neon
  glow: string;        // gradiente de brilho atrás do avatar
  base: string;        // gradiente do pilar
  light: string;       // cor do número/topo
  text: string;        // classe de cor do nome
  h: number;           // altura do pilar
  icon: typeof Crown;
};

function badgeFor(d: VendedorComDesempenho, index: number) {
  if (index === 0) return { label: "Elite", cls: "from-yellow-400/30 to-amber-500/10 text-yellow-300 border-yellow-400/40", icon: Crown };
  if (d.pctMeta >= 100) return { label: "Meta batida", cls: "from-emerald-400/25 to-emerald-500/5 text-emerald-300 border-emerald-400/40", icon: Trophy };
  if (d.pctMeta >= 70) return { label: "Em ascensão", cls: "from-amber-400/25 to-orange-500/5 text-amber-300 border-amber-400/40", icon: Rocket };
  if (d.vendas >= 5) return { label: "Sequência 5", cls: "from-indigo-400/25 to-violet-500/5 text-indigo-300 border-indigo-400/40", icon: Flame };
  return { label: "Persistente", cls: "from-slate-400/20 to-slate-500/5 text-slate-300 border-slate-400/30", icon: Star };
}

function AnimatedBRL({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{brl(v)}</span>;
}

export default function RankingPage() {
  const vendedores = useVendedores();
  const vendas = useVendas();
  const metas = useMetas();
  const mes = todayMonth();

  const ranking = useRankingMensal(mes, vendedores, vendas, metas);
  const top3 = ranking.slice(0, 3);
  const top10 = ranking.slice(0, 10);
  const total = ranking.reduce((acc, d) => acc + d.vendido, 0);
  const totalComissao = ranking.reduce((acc, d) => acc + d.comissao, 0);
  const metaGlobal = ranking.reduce((acc, d) => acc + d.metaMensal, 0);
  const pctGlobal = metaGlobal > 0 ? (total / metaGlobal) * 100 : 0;
  const ativos = ranking.length;

  // Crescimento vs mês anterior
  const serie = useMemo(() => faturamentoMensal(vendas, 2), [vendas]);
  const crescimento = useMemo(() => {
    if (serie.length < 2) return 0;
    const ant = serie[0].total;
    const atual = serie[1].total;
    return ant > 0 ? ((atual - ant) / ant) * 100 : 0;
  }, [serie]);

  const motivacao = MOTIVACAO[new Date().getDate() % MOTIVACAO.length];

  const tones: Tone[] = [
    { // 1º — ouro
      ring: "#facc15",
      glow: "radial-gradient(circle at 50% 30%, rgba(250,204,21,0.45), transparent 70%)",
      base: "linear-gradient(180deg, #a16207 0%, #1a1206 100%)",
      light: "#fde047",
      text: "text-yellow-300",
      h: 300,
      icon: Crown,
    },
    { // 2º — prata/ciano
      ring: "#67e8f9",
      glow: "radial-gradient(circle at 50% 30%, rgba(103,232,249,0.38), transparent 70%)",
      base: "linear-gradient(180deg, #155e75 0%, #08131a 100%)",
      light: "#a5f3fc",
      text: "text-cyan-200",
      h: 220,
      icon: Award,
    },
    { // 3º — bronze/vermelho
      ring: "#fb7185",
      glow: "radial-gradient(circle at 50% 30%, rgba(251,113,133,0.35), transparent 70%)",
      base: "linear-gradient(180deg, #9f1239 0%, #1a0710 100%)",
      light: "#fda4af",
      text: "text-rose-200",
      h: 180,
      icon: Star,
    },
  ];

  return (
    <div
      className="-m-4 md:-m-6 relative min-h-[calc(100vh-4rem)] overflow-hidden p-4 md:p-6 pb-24 md:pb-6"
      style={{
        background:
          "radial-gradient(ellipse at 25% 0%, rgba(99,102,241,0.16), transparent 55%), radial-gradient(ellipse at 85% 90%, rgba(168,85,247,0.16), transparent 55%), #06070d",
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

      {/* luz ambiente flutuante (blobs) */}
      <div
        className="lb-drift pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.35), transparent 70%)" }}
      />
      <div
        className="lb-drift pointer-events-none absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.3), transparent 70%)", animationDelay: "5s" }}
      />
      {/* grid futurista no chão */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64 opacity-25"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to top, #000, transparent)",
          WebkitMaskImage: "linear-gradient(to top, #000, transparent)",
          transform: "perspective(420px) rotateX(60deg)",
          transformOrigin: "bottom",
        }}
      />

      <div className="relative grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ============ COLUNA PRINCIPAL ============ */}
        <div className="space-y-8">
          <header className="flex flex-wrap items-end justify-between gap-3 lb-fade-up">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                Ranking de Vendas
              </h1>
              <p className="text-sm text-white/60">{monthLabel(mes)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-white/50">Faturamento total</p>
              <AnimatedBRL
                value={total}
                className="text-2xl font-bold text-cyan-300 tabular-nums md:text-3xl"
              />
            </div>
          </header>

          {/* ============ PÓDIO ============ */}
          {top3.length === 0 ? (
            <div className="lb-glass rounded-2xl p-12 text-center text-white/60">
              Sem vendedores pra ranquear ainda.
            </div>
          ) : (
            <div className="flex items-end justify-center gap-2 pt-20 sm:gap-5 lg:gap-7">
              {PODIUM_ORDER.map((idx) => {
                const d = top3[idx];
                const tone = tones[idx];
                const champion = idx === 0;
                const avatarSize = champion ? 168 : 96;
                const cardW = champion ? "w-36 sm:w-52" : "w-24 sm:w-36";
                if (!d) {
                  return (
                    <div key={`e-${idx}`} className={`flex ${cardW} flex-col items-center opacity-20`}>
                      <div className="mb-4 rounded-full bg-white/5" style={{ width: avatarSize * 0.7, height: avatarSize * 0.7 }} />
                      <div className="w-full rounded-t-xl border border-white/10" style={{ height: tone.h * 0.6, background: tone.base }} />
                    </div>
                  );
                }
                const b = badgeFor(d, idx);
                return (
                  <div
                    key={d.id}
                    className={`lb-fade-up relative flex ${cardW} flex-col items-center ${champion ? "z-10" : ""}`}
                    style={{ animationDelay: `${idx * 0.12}s` }}
                  >
                    {/* Holofote no campeão */}
                    {champion && (
                      <div
                        className="lb-spotlight pointer-events-none absolute -top-16 left-1/2 -z-10 h-80 w-56 -translate-x-1/2"
                        style={{
                          background: "linear-gradient(to bottom, rgba(253,224,71,0.5), transparent 75%)",
                          clipPath: "polygon(38% 0, 62% 0, 100% 100%, 0% 100%)",
                          filter: "blur(8px)",
                        }}
                      />
                    )}

                    {/* AVATAR + aura + anel neon + coroa + partículas */}
                    <div className="relative mb-5">
                      {/* aura pulsante */}
                      <div
                        className="lb-aura absolute -inset-6 rounded-full"
                        style={{ background: tone.glow }}
                      />
                      {champion && (
                        <>
                          <Crown
                            className="lb-float absolute -top-12 left-1/2 z-20 h-12 w-12 -translate-x-1/2 text-yellow-300"
                            fill="currentColor"
                            style={{ filter: "drop-shadow(0 0 14px rgba(253,224,71,0.95))" }}
                          />
                          {[0, 1, 2, 3, 4, 5, 6, 7].map((p) => (
                            <span
                              key={p}
                              className="pointer-events-none absolute bottom-3 left-1/2 h-1.5 w-1.5 rounded-full bg-yellow-300"
                              style={{
                                animation: `lb-particle ${2 + (p % 3) * 0.6}s ease-in ${p * 0.35}s infinite`,
                                marginLeft: `${(p - 3.5) * 18}px`,
                                boxShadow: "0 0 6px rgba(253,224,71,0.9)",
                              }}
                            />
                          ))}
                        </>
                      )}
                      <div
                        className="lb-ring relative grid place-items-center rounded-full"
                        style={{ ["--ring-c" as string]: tone.ring }}
                      >
                        <Avatar id={d.id} nome={d.nome} size={avatarSize} className="relative" />
                      </div>
                    </div>

                    {/* base circular iluminada */}
                    <div
                      className="lb-glow pointer-events-none absolute left-1/2 h-6 w-[120%] -translate-x-1/2 rounded-[100%] blur-md"
                      style={{ bottom: tone.h - 10, background: tone.light, opacity: 0.5 }}
                    />

                    {/* PÓDIO 3D */}
                    <div
                      className="lb-pillar relative w-full rounded-t-2xl border-x border-t border-white/15"
                      style={{ height: tone.h, background: tone.base }}
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-2 lb-glow rounded-t-2xl"
                        style={{ background: tone.light, boxShadow: `0 0 22px ${tone.light}` }}
                      />
                      <div
                        className={`grid h-full place-items-center font-black tabular-nums ${champion ? "text-8xl sm:text-9xl" : "text-6xl sm:text-7xl"}`}
                        style={{ color: tone.light, textShadow: `0 0 28px ${tone.light}` }}
                      >
                        {idx + 1}
                      </div>
                    </div>

                    {/* NOME + VALOR + BADGE */}
                    <div className={`relative z-10 -mt-px w-full rounded-b-2xl border-x border-b border-white/15 bg-black/60 px-2 py-3 text-center backdrop-blur ${tone.text}`}>
                      <p className={`truncate font-bold ${champion ? "text-base sm:text-lg" : "text-sm"}`}>{d.nome}</p>
                      <AnimatedBRL value={d.vendido} className={`block font-bold text-white tabular-nums ${champion ? "text-sm" : "text-xs"}`} />
                      <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full border bg-gradient-to-b px-2 py-0.5 text-[10px] font-bold ${b.cls}`}>
                        <b.icon className="h-2.5 w-2.5" /> {b.label}
                      </span>
                    </div>

                    {/* Reflexo no chão */}
                    <div className="lb-reflection mt-1 w-full" aria-hidden>
                      <div
                        className="w-full rounded-b-2xl"
                        style={{ height: tone.h * 0.4, background: tone.base }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ============ TOP 10 ============ */}
          {top10.length > 0 && (
            <div className="lb-fade-up lb-glass rounded-2xl p-4">
              <div className="mb-3 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-300" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">Top 10 vendedores</h2>
              </div>
              <div className="space-y-2">
                {top10.map((d, i) => {
                  const b = badgeFor(d, i);
                  return (
                    <div
                      key={d.id}
                      className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 p-2.5 transition-all hover:border-white/15 hover:bg-white/10"
                    >
                      <div className="flex w-6 shrink-0 items-center justify-center">
                        <span className={`text-sm font-bold tabular-nums ${i === 0 ? "text-yellow-300" : i === 1 ? "text-cyan-200" : i === 2 ? "text-rose-200" : "text-white/40"}`}>
                          {i + 1}
                        </span>
                      </div>
                      <Avatar id={d.id} nome={d.nome} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-white">{d.nome}</p>
                          <span className={`hidden shrink-0 rounded-full border bg-gradient-to-b px-1.5 py-px text-[9px] font-bold sm:inline ${b.cls}`}>
                            {b.label}
                          </span>
                        </div>
                        {/* barra de progresso animada */}
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="relative h-full rounded-full transition-[width] duration-1000 ease-out"
                            style={{
                              width: `${Math.min(d.pctMeta, 100)}%`,
                              background:
                                d.pctMeta >= 100
                                  ? "linear-gradient(90deg,#22c55e,#4ade80)"
                                  : d.pctMeta >= 70
                                    ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                                    : "linear-gradient(90deg,#6366f1,#a78bfa)",
                            }}
                          >
                            <span className="lb-bar-shine absolute inset-0" />
                          </div>
                        </div>
                      </div>
                      <div className="hidden text-right sm:block">
                        <p className="text-sm font-bold text-white tabular-nums">{brl(d.vendido)}</p>
                        <p className="text-[10px] text-white/50 tabular-nums">{d.vendas} vendas · {pct(d.pctMeta)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-emerald-300 tabular-nums">{brl(d.comissao)}</p>
                        <p className="text-[9px] uppercase text-white/40">comissão</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ============ PAINEL LATERAL (widgets) ============ */}
        <aside className="space-y-4">
          {/* Logo */}
          <div className="lb-fade-up lb-glass rounded-2xl p-4">
            <div className="flex items-center justify-center gap-3">
              <Logo size={44} />
              <div className="border-l border-white/20 pl-3">
                <p className="text-[10px] uppercase tracking-widest text-white/60">LB</p>
                <p className="text-sm font-bold text-white">Representações</p>
              </div>
            </div>
          </div>

          {/* Meta global */}
          <div className="lb-glass lb-fade-up rounded-2xl p-4">
            <div className="mb-2 flex items-center gap-2 text-white/80">
              <Activity className="h-4 w-4 text-indigo-300" />
              <span className="text-xs font-semibold uppercase tracking-wider">Meta global da equipe</span>
            </div>
            <AnimatedBRL value={total} className="text-2xl font-bold text-white tabular-nums" />
            <p className="text-xs text-white/50">de {brl(metaGlobal)}</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400 transition-[width] duration-1000"
                style={{ width: `${Math.min(pctGlobal, 100)}%` }}
              >
                <span className="lb-bar-shine absolute inset-0" />
              </div>
            </div>
            <p className="mt-1 text-right text-xs font-bold text-indigo-300">{pct(pctGlobal)}</p>
          </div>

          {/* Widgets de stats */}
          <div className="grid grid-cols-2 gap-3">
            <Widget icon={Users} label="Vendedores" value={String(ativos)} tint="text-cyan-300" />
            <Widget
              icon={crescimento >= 0 ? TrendingUp : TrendingDown}
              label="Crescimento"
              value={`${crescimento >= 0 ? "+" : ""}${pct(crescimento)}`}
              tint={crescimento >= 0 ? "text-emerald-300" : "text-rose-300"}
            />
            <Widget icon={Trophy} label="Comissão total" value={brl(totalComissao)} tint="text-amber-300" small />
            <Widget
              icon={Crown}
              label="Destaque do mês"
              value={top3[0]?.nome ?? "—"}
              tint="text-yellow-300"
              small
            />
          </div>

          {/* Últimas conquistas */}
          <div className="lb-fade-up lb-glass rounded-2xl p-4">
            <div className="mb-2 flex items-center gap-2 text-white/80">
              <Award className="h-4 w-4 text-yellow-300" />
              <span className="text-xs font-semibold uppercase tracking-wider">Conquistas</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {top3.map((d, i) => {
                const b = badgeFor(d, i);
                return (
                  <span key={d.id} className={`inline-flex items-center gap-1 rounded-full border bg-gradient-to-b px-2 py-1 text-[10px] font-bold ${b.cls}`}>
                    <b.icon className="h-3 w-3" /> {d.nome.split(" ")[0]} · {b.label}
                  </span>
                );
              })}
              {top3.length === 0 && <span className="text-xs text-white/40">Sem conquistas ainda</span>}
            </div>
          </div>

          {/* Motivação */}
          <div className="lb-glass lb-fade-up rounded-2xl border-indigo-400/20 p-4">
            <div className="mb-1 flex items-center gap-2 text-indigo-200">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Motivação do dia</span>
            </div>
            <p className="text-sm font-medium leading-snug text-white">{motivacao}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Widget({
  icon: Icon,
  label,
  value,
  tint,
  small,
}: {
  icon: typeof Crown;
  label: string;
  value: string;
  tint: string;
  small?: boolean;
}) {
  return (
    <div className="lb-glass lb-fade-up rounded-2xl p-3">
      <Icon className={`mb-1 h-4 w-4 ${tint}`} />
      <p className="text-[10px] uppercase tracking-wider text-white/50">{label}</p>
      <p className={`truncate font-bold text-white tabular-nums ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}
