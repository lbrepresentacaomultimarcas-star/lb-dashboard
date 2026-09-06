"use client";

import { useMemo, useState } from "react";
import { Crown, Medal, ShieldAlert, Sparkles, Target, TrendingUp, Users, UsersRound, Wallet } from "lucide-react";
import { PAPEL_INFO, type Papel } from "@/lib/types";
import {
  useEquipes,
  useEscopo,
  useLeads,
  useMetas,
  useRoster,
  useSession,
  useVendas,
  useVendedores,
} from "@/lib/store";
import { desempenhoPorVendedor } from "@/lib/selectors";
import { useCicloProducao } from "@/lib/use-ciclo";
import { PremiumStage } from "@/components/premium-stage";
import { RoleGuard } from "@/components/role-guard";
import { Avatar } from "@/components/avatar";
import { AnimatedNum } from "@/components/ui/spark";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Badge compacto do papel. */
function PapelBadge({ papel }: { papel: Papel }) {
  const tone =
    papel === "admin" ? "#FACC15"
    : papel === "coordenador" ? "#7C3AED"
    : papel === "supervisor" ? "#3B82F6"
    : papel === "lider" ? "#22C55E"
    : "#94a3b8";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={{ color: tone, borderColor: `${tone}55`, background: `${tone}1a` }}
    >
      {PAPEL_INFO[papel].label}
    </span>
  );
}

const MEDAL = ["#FACC15", "#CBD5E1", "#D8894B"]; // ouro / prata / bronze

/*
 * Esta tela mostra a carteira dos OUTROS: exige Supervisor.
 *
 * Esconder o item do menu não protege nada -- bastaria digitar o endereço.
 * A guarda tem que estar na rota. (E, mesmo assim, o que realmente protege
 * são as regras do banco: se alguém contornar as duas, ainda assim não
 * recebe linha nenhuma.)
 */
export default function MinhaEquipePage() {
  return (
    <RoleGuard minimo="supervisor">
      <MinhaEquipeConteudo />
    </RoleGuard>
  );
}

function MinhaEquipeConteudo() {
  const session = useSession();
  const escopo = useEscopo();
  const roster = useRoster();
  const equipes = useEquipes();
  const vendedores = useVendedores();
  const vendas = useVendas();
  const metas = useMetas();
  const leads = useLeads();
  const { config, feriados, chaveAtual } = useCicloProducao();

  // Admin/coordenador escolhem qualquer equipe; gestor fica preso à sua.
  const podeEscolher = escopo.verTudo;
  const [sel, setSel] = useState("");
  const targetId = podeEscolher
    ? sel || session?.equipeId || equipes[0]?.id || ""
    : session?.equipeId ?? "";

  const equipe = equipes.find((e) => e.id === targetId) ?? null;

  const membros = useMemo(
    () => roster.filter((p) => p.equipeId === targetId),
    [roster, targetId],
  );
  const refs = useMemo(
    () => new Set(membros.map((m) => m.vendedorRef).filter((r): r is string => !!r)),
    [membros],
  );

  const desempenho = useMemo(() => {
    const time = vendedores.filter((v) => refs.has(v.id));
    return desempenhoPorVendedor(time, vendas, metas, chaveAtual, config, feriados).sort(
      (a, b) => b.vendido - a.vendido,
    );
  }, [vendedores, refs, vendas, metas, chaveAtual, config, feriados]);

  const leadsPorRef = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) {
      if (l.vendedorId && refs.has(l.vendedorId) && l.status !== "perdido") {
        m.set(l.vendedorId, (m.get(l.vendedorId) ?? 0) + 1);
      }
    }
    return m;
  }, [leads, refs]);

  // Nome do vendedor → profile (pra avatar/papel na lista).
  const profilePorRef = useMemo(() => {
    const m = new Map<string, (typeof membros)[number]>();
    for (const p of membros) if (p.vendedorRef) m.set(p.vendedorRef, p);
    return m;
  }, [membros]);

  const totalFat = desempenho.reduce((a, d) => a + d.vendido, 0);
  const totalMeta = desempenho.reduce((a, d) => a + d.metaMensal, 0);
  const totalVendas = desempenho.reduce((a, d) => a + d.vendas, 0);
  const totalLeads = [...leadsPorRef.values()].reduce((a, n) => a + n, 0);
  const pctEquipe = totalMeta > 0 ? (totalFat / totalMeta) * 100 : 0;
  const cor = equipe?.cor ?? "#2563FF";
  const lider = roster.find((p) => p.id === (equipe?.supervisorId || equipe?.liderId));

  const seletor = podeEscolher && equipes.length > 0 && (
    <select
      value={targetId}
      onChange={(e) => setSel(e.target.value)}
      className="h-11 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-white outline-none backdrop-blur focus:border-[#3B82F6]"
    >
      {equipes.map((e) => (
        <option key={e.id} value={e.id}>
          {e.nome}
        </option>
      ))}
    </select>
  );

  const header = (
    <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: cor }}>
          <UsersRound className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
            Minha Equipe
          </h1>
          <p className="text-sm text-white/55">Desempenho do time no ciclo atual</p>
        </div>
      </div>
      {seletor}
    </header>
  );

  // Vendedor comum (sem gestão) — a rota é gated no menu, mas protege o acesso direto.
  if (!escopo.verTudo && !escopo.ehGestorEquipe) {
    return (
      <PremiumStage>
        {header}
        <div className="lb-card-premium lb-fade-up rounded-2xl">
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="lb-orb h-12 w-12" style={{ ["--orb" as string]: "#64748b" }}>
              <ShieldAlert className="h-6 w-6" />
            </span>
            <p className="text-base font-bold text-white">Você não gerencia uma equipe</p>
            <p className="max-w-md text-sm text-white/55">
              Esta área é dos supervisores e líderes. Seus próprios números estão no Dashboard e no Ranking.
            </p>
          </div>
        </div>
      </PremiumStage>
    );
  }

  // Sem equipe definida (gestor sem equipe_id, ou empresa sem equipes).
  if (!equipe) {
    return (
      <PremiumStage>
        {header}
        <div className="lb-card-premium lb-fade-up rounded-2xl">
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="lb-orb h-12 w-12" style={{ ["--orb" as string]: "#7C3AED" }}>
              <UsersRound className="h-6 w-6" />
            </span>
            <p className="text-base font-bold text-white">Nenhuma equipe para exibir</p>
            <p className="max-w-md text-sm text-white/55">
              {podeEscolher
                ? "Crie uma equipe em Administrativo → Equipes e atribua os membros em Colaboradores."
                : "Você ainda não está vinculado a uma equipe. Peça ao administrador para incluir você em Colaboradores."}
            </p>
          </div>
        </div>
      </PremiumStage>
    );
  }

  const kpis = [
    { label: "Faturamento da Equipe", texto: brl(totalFat), icon: Wallet, color: cor },
    { label: "Meta da Equipe", texto: `${pctEquipe.toFixed(0)}%`, sub: brl(totalMeta), icon: Target, color: "#22C55E" },
    { label: "Membros", value: membros.length, icon: Users, color: "#3B82F6" },
    { label: "Vendas no Ciclo", value: totalVendas, sub: `${totalLeads} leads no funil`, icon: TrendingUp, color: "#FACC15" },
  ];

  return (
    <PremiumStage>
      {header}

      {/* Identidade da equipe */}
      <div className="lb-card-premium lb-fade-up relative overflow-hidden rounded-2xl p-5">
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-40 blur-3xl"
          style={{ background: cor }}
        />
        <div
          className="pointer-events-none absolute inset-x-4 top-0 h-px"
          style={{ background: `linear-gradient(90deg,transparent,${cor},transparent)`, boxShadow: `0 0 8px ${cor}` }}
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white"
            style={{ background: cor, boxShadow: `0 0 26px -6px ${cor}` }}
          >
            <UsersRound className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-extrabold text-white">{equipe.nome}</p>
            <p className="text-sm text-white/55">
              {membros.length} {membros.length === 1 ? "membro" : "membros"} · ciclo {chaveAtual}
            </p>
          </div>
          {lider && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <span
                className="inline-grid shrink-0 place-items-center rounded-full p-0.5"
                style={{ boxShadow: "0 0 0 2px #FACC15, 0 0 12px -2px #FACC15" }}
              >
                <Avatar id={lider.id} nome={lider.nome} size={26} />
              </span>
              <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{lider.nome}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/45">
                  {equipe.supervisorId ? "Supervisor" : "Líder"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <span className="lb-orb lb-float h-10 w-10" style={{ ["--orb" as string]: k.color }}>
              <k.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[11px] uppercase tracking-wider text-white/55">{k.label}</p>
            {k.value !== undefined ? (
              <AnimatedNum value={k.value} className="block text-2xl font-extrabold tabular-nums text-white" />
            ) : (
              <p className="text-2xl font-extrabold tabular-nums text-white">{k.texto}</p>
            )}
            {k.sub && <p className="mt-0.5 text-[11px] text-white/45">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Ranking da equipe */}
      <div className="lb-card-premium lb-fade-up rounded-2xl p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-300" />
          <h2 className="text-base font-bold text-white">Ranking da equipe</h2>
          <span className="text-xs text-white/45">· por faturamento no ciclo</span>
        </div>

        {desempenho.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/45">
            Os membros ainda não têm vendas registradas neste ciclo.
          </p>
        ) : (
          <div className="space-y-2">
            {desempenho.map((d, i) => {
              const prof = profilePorRef.get(d.id);
              const pct = Math.min(100, Math.max(0, d.pctMeta));
              const leadsN = leadsPorRef.get(d.id) ?? 0;
              const medal = i < 3 ? MEDAL[i] : null;
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition-colors hover:bg-white/[0.06]"
                >
                  {/* posição / medalha */}
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold tabular-nums"
                    style={
                      medal
                        ? { color: "#0b1220", background: medal, boxShadow: `0 0 14px -3px ${medal}` }
                        : { color: "#cbd5e1", background: "rgba(255,255,255,0.06)" }
                    }
                  >
                    {medal ? <Medal className="h-4 w-4" /> : i + 1}
                  </span>
                  <Avatar id={prof?.id ?? d.id} nome={d.nome} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{d.nome}</p>
                      {prof && <PapelBadge papel={prof.papel} />}
                    </div>
                    {/* barra de meta */}
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: pct >= 100 ? "#22C55E" : cor,
                          boxShadow: `0 0 8px -1px ${pct >= 100 ? "#22C55E" : cor}`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-extrabold tabular-nums text-white">{brl(d.vendido)}</p>
                    <p className="text-[11px] tabular-nums text-white/45">
                      {d.pctMeta.toFixed(0)}% da meta · {d.vendas} venda{d.vendas === 1 ? "" : "s"} · {leadsN} lead{leadsN === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PremiumStage>
  );
}
