"use client";

import { DollarSign, Sparkles, Target, TrendingUp, Trophy, UserCircle, Users } from "lucide-react";
import {
  useClientes,
  useLeads,
  useMetas,
  useSession,
  useVendas,
  useVendedores,
} from "@/lib/store";
import { faturamentoMensal, metaTotalDoMes, totalFaturado, vendasNoMes } from "@/lib/selectors";
import { useRankingMensal } from "@/lib/use-ranking";
import { temPermissao } from "@/lib/permissions";
import { brl, monthLabel, pct, todayMonth } from "@/lib/utils";
import { SalesChart } from "@/components/sales-chart-loader";
import { Avatar } from "@/components/avatar";
import { PremiumStage } from "@/components/premium-stage";
import { AnimatedBRL, AnimatedNum } from "@/components/ui/spark";

function StatPremium({
  icon: Icon,
  label,
  value,
  hint,
  color,
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  color: string;
  delay?: number;
}) {
  return (
    <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4" style={{ animationDelay: `${delay}s` }}>
      <div className="flex items-start justify-between">
        <span className="lb-orb h-10 w-10" style={{ ["--orb" as string]: color }}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="lb-pulse-glow mt-1 h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-white/55">{label}</p>
      <div className="text-2xl font-extrabold tabular-nums text-white">{value}</div>
      {hint && <p className="text-[11px] text-white/40">{hint}</p>}
    </div>
  );
}

function posColor(i: number) {
  return i === 0 ? "#FACC15" : i === 1 ? "#93c5fd" : i === 2 ? "#fda4af" : "rgba(255,255,255,.5)";
}
function pctColor(p: number) {
  if (p >= 100) return "#22C55E";
  if (p >= 70) return "#FACC15";
  return "#f43f5e";
}

export default function DashboardPage() {
  const session = useSession();
  const vendedores = useVendedores();
  const vendas = useVendas();
  const clientes = useClientes();
  const leads = useLeads();
  const metas = useMetas();
  const mes = todayMonth();

  // Gestor (admin/coordenador/supervisor) vê a operação inteira;
  // vendedor vê só os próprios números (já filtrados por RLS).
  const gestor = temPermissao(session, "supervisor");

  const leadsAtivos = leads.filter((l) => l.status !== "fechamento" && l.status !== "perdido");
  const valorPipeline = leadsAtivos.reduce((acc, l) => acc + l.valorEstimado, 0);

  const doMes = vendasNoMes(vendas, mes);
  const fatMes = totalFaturado(doMes);
  const ativos = vendedores.filter((v) => v.ativo).length;
  const metaTotal = metaTotalDoMes(vendedores, metas, mes);
  const pctMeta = metaTotal > 0 ? (fatMes / metaTotal) * 100 : 0;

  const ranking = useRankingMensal(mes, vendedores, vendas, metas);
  const serie = faturamentoMensal(vendas, 12);

  return (
    <PremiumStage>
      <header className="lb-fade-up flex items-center gap-3">
        <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#2563FF" }}>
          <TrendingUp className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
            {gestor ? "Visão Geral da Operação" : "Meu Desempenho"}
          </h1>
          <p className="text-sm text-white/55">
            {gestor ? "Toda a equipe" : `Olá, ${session?.nome ?? ""}`} · {monthLabel(mes)}
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatPremium
          icon={DollarSign}
          label={gestor ? "Faturamento do mês" : "Minhas vendas"}
          value={<AnimatedBRL value={fatMes} />}
          hint={`${doMes.length} vendas no mês`}
          color="#22C55E"
          delay={0}
        />
        {gestor ? (
          <StatPremium
            icon={Users}
            label="Vendedores ativos"
            value={<AnimatedNum value={ativos} />}
            hint={`de ${vendedores.length} cadastrados`}
            color="#3B82F6"
            delay={0.06}
          />
        ) : (
          <StatPremium
            icon={Sparkles}
            label="Meus leads ativos"
            value={<AnimatedNum value={leadsAtivos.length} />}
            hint={`${leads.length} no total`}
            color="#3B82F6"
            delay={0.06}
          />
        )}
        <StatPremium
          icon={Target}
          label={gestor ? "Meta total" : "Meu pipeline"}
          value={<AnimatedBRL value={gestor ? metaTotal : valorPipeline} />}
          hint={gestor ? "soma das metas ativas" : "valor em aberto"}
          color="#7C3AED"
          delay={0.12}
        />
        <StatPremium
          icon={TrendingUp}
          label="% da meta"
          value={<span style={{ color: pctColor(pctMeta) }}>{pct(pctMeta)}</span>}
          hint={pctMeta >= 100 ? "meta superada 🎉" : `faltam ${brl(Math.max(metaTotal - fatMes, 0))}`}
          color={pctColor(pctMeta)}
          delay={0.18}
        />
      </div>

      {gestor && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatPremium icon={UserCircle} label="Clientes cadastrados" value={<AnimatedNum value={clientes.length} />} hint="base atual" color="#06b6d4" />
          <StatPremium icon={Sparkles} label="Leads ativos" value={<AnimatedNum value={leadsAtivos.length} />} hint={`${leads.length} total no funil`} color="#7C3AED" />
          <StatPremium icon={TrendingUp} label="Pipeline potencial" value={<AnimatedBRL value={valorPipeline} />} hint="soma de leads em aberto" color="#FACC15" />
        </div>
      )}

      {gestor && (
        <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-300" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Faturamento mensal (12 meses)</h2>
          </div>
          <SalesChart data={serie} />
        </div>
      )}

      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-300" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Ranking de vendedores — {monthLabel(mes)}
          </h2>
        </div>
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                <th className="pb-3 pr-4">#</th>
                <th className="pb-3 pr-4">Vendedor</th>
                <th className="hidden pb-3 pr-4 text-right sm:table-cell">Vendas</th>
                <th className="pb-3 pr-4 text-right">Faturado</th>
                <th className="hidden pb-3 pr-4 text-right md:table-cell">Meta</th>
                <th className="pb-3 text-right">% meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {ranking.map((d, i) => {
                const pc = pctColor(d.pctMeta);
                return (
                  <tr key={d.id} className="transition-colors hover:bg-white/[0.05]">
                    <td className="py-3 pr-4">
                      <span
                        className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold tabular-nums"
                        style={{
                          color: i < 3 ? "#06070d" : "rgba(255,255,255,.6)",
                          background: i < 3 ? posColor(i) : "transparent",
                          boxShadow: i < 3 ? `0 0 12px -2px ${posColor(i)}` : undefined,
                        }}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Avatar id={d.id} nome={d.nome} size={28} />
                        <span className="min-w-0 truncate font-medium text-white">{d.nome}</span>
                      </div>
                    </td>
                    <td className="hidden py-3 pr-4 text-right text-white/70 tabular-nums sm:table-cell">{d.vendas}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-white tabular-nums">{brl(d.vendido)}</td>
                    <td className="hidden py-3 pr-4 text-right text-white/45 tabular-nums md:table-cell">{brl(d.metaMensal)}</td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-white/10 sm:block">
                          <div
                            className="h-full rounded-full transition-[width] duration-700"
                            style={{ width: `${Math.min(d.pctMeta, 100)}%`, background: pc, boxShadow: `0 0 10px ${pc}` }}
                          />
                        </div>
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums"
                          style={{ color: pc, borderColor: `${pc}66`, background: `${pc}1f` }}
                        >
                          {pct(d.pctMeta)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-white/45">
                    Nenhum vendedor cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PremiumStage>
  );
}
