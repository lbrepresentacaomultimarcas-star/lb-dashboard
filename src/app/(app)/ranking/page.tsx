"use client";

import { useMemo } from "react";
import { Crown, Star, Trophy } from "lucide-react";
import { useMetas, useVendas, useVendedores } from "@/lib/store";
import { desempenhoPorVendedor, totalFaturado, vendasNoMes } from "@/lib/selectors";
import { brl, monthLabel, pct, todayMonth } from "@/lib/utils";
import { Logo } from "@/components/logo";

const PODIUM_ORDER: (0 | 1 | 2)[] = [1, 0, 2]; // 2º, 1º, 3º na ordem visual

function avatarColor(nome: string) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

function initials(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export default function RankingPage() {
  const vendedores = useVendedores();
  const vendas = useVendas();
  const metas = useMetas();
  const mes = todayMonth();

  const ranking = useMemo(
    () =>
      desempenhoPorVendedor(vendedores, vendas, metas, mes)
        .filter((d) => d.ativo)
        .sort((a, b) => b.vendido - a.vendido),
    [vendedores, vendas, metas, mes],
  );
  const top3 = ranking.slice(0, 3);
  const total = totalFaturado(vendasNoMes(vendas, mes));

  const tones = [
    {
      // 1º — azul/ciano
      ring: "0 0 36px rgba(99,179,255,0.65), 0 0 0 4px rgba(99,179,255,0.45) inset",
      glow: "radial-gradient(circle at 50% 0%, rgba(99,179,255,0.4), transparent 70%)",
      base: "linear-gradient(180deg, #1e3a8a 0%, #0c1633 100%)",
      podiumLight: "rgba(99,179,255,0.5)",
      label: "text-cyan-300",
      icon: Crown,
      h: 280,
    },
    {
      // 2º — verde
      ring: "0 0 28px rgba(74,222,128,0.55), 0 0 0 4px rgba(74,222,128,0.35) inset",
      glow: "radial-gradient(circle at 50% 0%, rgba(74,222,128,0.35), transparent 70%)",
      base: "linear-gradient(180deg, #166534 0%, #0a1f12 100%)",
      podiumLight: "rgba(74,222,128,0.45)",
      label: "text-emerald-300",
      icon: Trophy,
      h: 210,
    },
    {
      // 3º — vermelho/laranja
      ring: "0 0 28px rgba(251,113,133,0.55), 0 0 0 4px rgba(251,113,133,0.35) inset",
      glow: "radial-gradient(circle at 50% 0%, rgba(251,113,133,0.35), transparent 70%)",
      base: "linear-gradient(180deg, #7f1d1d 0%, #1f0a0a 100%)",
      podiumLight: "rgba(251,113,133,0.45)",
      label: "text-rose-300",
      icon: Star,
      h: 170,
    },
  ];

  return (
    <div
      className="-m-4 md:-m-6 min-h-[calc(100vh-4rem)] relative overflow-hidden p-6"
      style={{
        background:
          "radial-gradient(ellipse at 30% 0%, rgba(56,189,248,0.18), transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(168,85,247,0.18), transparent 50%), #06070d",
      }}
    >
      {/* Estrelinhas */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, white, transparent), radial-gradient(1px 1px at 60% 70%, white, transparent), radial-gradient(1.5px 1.5px at 80% 20%, rgba(255,255,255,0.7), transparent), radial-gradient(1px 1px at 40% 80%, white, transparent), radial-gradient(2px 2px at 10% 60%, rgba(255,255,255,0.8), transparent), radial-gradient(1px 1px at 90% 50%, white, transparent)",
          backgroundSize: "300px 300px, 400px 400px, 500px 500px, 350px 350px, 450px 450px, 380px 380px",
        }}
      />

      <div className="relative grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* COLUNA ESQUERDA — Pódio + Total */}
        <div className="space-y-8">
          <header className="flex items-center justify-between text-white">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Ranking de vendas</h1>
              <p className="text-sm text-white/60">{monthLabel(mes)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-white/60">Total</p>
              <p className="text-3xl font-bold text-cyan-300 tabular-nums">{brl(total)}</p>
            </div>
          </header>

          {/* PÓDIO */}
          {top3.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center text-white/60">
              Sem vendedores ativos pra ranquear.
            </div>
          ) : (
            <div className="flex items-end justify-center gap-4 sm:gap-8 lg:gap-12 pt-12">
              {PODIUM_ORDER.map((idx) => {
                const d = top3[idx];
                if (!d) {
                  // espaço reservado vazio (mantém alinhamento)
                  const tone = tones[idx];
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="flex w-32 flex-col items-center sm:w-40"
                      style={{ opacity: 0.25 }}
                    >
                      <div className="mb-4 grid h-28 w-28 sm:h-32 sm:w-32 place-items-center rounded-full bg-white/5">
                        <span className="text-white/40">—</span>
                      </div>
                      <div
                        className="w-full rounded-t-xl border border-white/10"
                        style={{ height: tone.h, background: tone.base }}
                      >
                        <div
                          className="grid h-full place-items-center text-7xl font-extrabold sm:text-8xl"
                          style={{ color: tone.podiumLight }}
                        >
                          {idx + 1}
                        </div>
                      </div>
                    </div>
                  );
                }
                const tone = tones[idx];
                const Icon = tone.icon;
                return (
                  <div
                    key={d.id}
                    className="flex w-32 flex-col items-center sm:w-44"
                  >
                    {/* AVATAR */}
                    <div
                      className="relative mb-4 flex h-28 w-28 sm:h-36 sm:w-36 items-center justify-center rounded-full"
                      style={{ boxShadow: tone.ring }}
                    >
                      <div
                        className="absolute -inset-6 rounded-full"
                        style={{ background: tone.glow }}
                      />
                      <div
                        className="relative grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-3xl font-bold text-white"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${avatarColor(d.nome)} 0%, rgba(0,0,0,0.5) 100%)`,
                        }}
                      >
                        {initials(d.nome)}
                      </div>
                      {idx === 0 && (
                        <Icon
                          className="absolute -top-3 -right-2 h-8 w-8 text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.8)]"
                          fill="currentColor"
                        />
                      )}
                    </div>

                    {/* PÓDIO */}
                    <div
                      className="relative w-full rounded-t-xl border border-white/10 overflow-hidden"
                      style={{ height: tone.h, background: tone.base }}
                    >
                      <div
                        className="grid h-full place-items-center text-8xl font-extrabold sm:text-9xl tabular-nums"
                        style={{
                          color: tone.podiumLight,
                          textShadow: `0 0 20px ${tone.podiumLight}, 0 0 40px ${tone.podiumLight}`,
                        }}
                      >
                        {idx + 1}
                      </div>
                    </div>

                    {/* NOME + VALOR */}
                    <div
                      className={`-mt-1 w-full rounded-b-xl border border-white/10 bg-black/40 px-3 py-3 text-center backdrop-blur ${tone.label}`}
                    >
                      <p className="truncate text-sm font-semibold sm:text-base">{d.nome}</p>
                      <p className="text-xs text-white/80 tabular-nums">{brl(d.vendido)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* COLUNA DIREITA — Lista completa */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-3">
              <Logo size={48} />
              <div className="border-l border-white/20 pl-3">
                <p className="text-xs uppercase tracking-widest text-white/60">LB</p>
                <p className="text-sm font-bold text-white">Representações</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {ranking.map((d, i) => (
              <div
                key={d.id}
                className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${avatarColor(d.nome)} 0%, rgba(0,0,0,0.6) 100%)`,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{d.nome}</p>
                    <p className="truncate text-xs text-white/60">
                      Meta: {brl(d.metaMensal)} · Total: {brl(d.vendido)}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(d.pctMeta, 100)}%`,
                        background:
                          d.pctMeta >= 100
                            ? "linear-gradient(90deg, #22c55e, #4ade80)"
                            : d.pctMeta >= 70
                              ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                              : "linear-gradient(90deg, #6366f1, #a78bfa)",
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-white/60">
                    {d.pctMeta >= 100
                      ? `Meta superada (${pct(d.pctMeta)})`
                      : `Faltam ${brl(Math.max(d.metaMensal - d.vendido, 0))} para a meta`}
                  </p>
                </div>
              </div>
            ))}
            {ranking.length === 0 && (
              <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
                Sem vendedores ainda.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
