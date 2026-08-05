"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  BarChart3,
  CheckCircle2,
  Clock,
  Inbox,
  Medal,
  MessageCircle,
  PhoneCall,
  Send,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react";
import { centralLeadsApi, useVendedores } from "@/lib/store";
import type { CentralDashboard, CentralRankingRow } from "@/lib/types";
import { PremiumStage } from "@/components/premium-stage";

// ---------- período ----------
type Preset = "hoje" | "ontem" | "7d" | "30d" | "mes" | "mesant" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "mesant", label: "Mês anterior" },
  { id: "custom", label: "Personalizado" },
];

function computeRange(preset: Preset, cf: string, ct: string): { fromISO: string; toISO: string } {
  const now = new Date();
  const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let from: Date;
  let to: Date;
  switch (preset) {
    case "hoje":
      from = sod(now);
      to = now;
      break;
    case "ontem": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      from = sod(y);
      to = sod(now);
      break;
    }
    case "30d":
      from = new Date(now);
      from.setDate(now.getDate() - 30);
      to = now;
      break;
    case "mes":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = now;
      break;
    case "mesant":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "custom":
      from = cf ? new Date(cf) : sod(now);
      to = ct ? new Date(ct + "T23:59:59") : now;
      break;
    default:
      from = new Date(now);
      from.setDate(now.getDate() - 7);
      to = now;
  }
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

function fmtDur(seg?: number | null): string {
  if (seg == null) return "—";
  const m = Math.round(seg / 60);
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm ? `${h}h ${mm}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function Kpi({ icon, label, value, hint, cor }: { icon: React.ReactNode; label: string; value: string | number; hint?: string; cor: string }) {
  return (
    <div className="lb-card-premium lb-fade-up rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${cor}22`, color: cor, boxShadow: `0 0 18px -4px ${cor}` }}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/55">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-extrabold tabular-nums text-white" style={{ letterSpacing: "-0.02em" }}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-white/45">{hint}</p>}
    </div>
  );
}

const MEDAL = ["#FACC15", "#CBD5E1", "#D8894B"];

export default function CentralPainelPage() {
  const vendedores = useVendedores();
  const nomeVend = (id?: string) => vendedores.find((v) => v.id === id)?.nome ?? "—";

  const [preset, setPreset] = useState<Preset>("7d");
  const [cf, setCf] = useState("");
  const [ct, setCt] = useState("");
  const { fromISO, toISO } = useMemo(() => computeRange(preset, cf, ct), [preset, cf, ct]);

  const [dash, setDash] = useState<CentralDashboard | null>(null);
  const [rank, setRank] = useState<CentralRankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [d, r] = await Promise.all([centralLeadsApi.dashboard(fromISO, toISO), centralLeadsApi.ranking(fromISO, toISO)]);
      if (!alive) return;
      setDash(d);
      setRank(r);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [fromISO, toISO]);

  const d = dash;
  const taxaConv = d && d.recebidos > 0 ? Math.round((d.convertidos / d.recebidos) * 100) : 0;

  const kpis = [
    { label: "Recebidos", value: d?.recebidos ?? 0, icon: <Inbox className="h-4 w-4" />, cor: "#2563FF" },
    { label: "Distribuídos", value: d?.distribuidos ?? 0, icon: <Send className="h-4 w-4" />, cor: "#7C3AED" },
    { label: "Aguardando ligação", value: d?.aguardando_ligacao ?? 0, icon: <Clock className="h-4 w-4" />, cor: "#3B82F6" },
    { label: "Atenderam", value: d?.atendidos ?? 0, icon: <PhoneCall className="h-4 w-4" />, cor: "#22C55E" },
    { label: "Não atenderam", value: d?.nao_atendidos ?? 0, icon: <XCircle className="h-4 w-4" />, cor: "#f59e0b" },
    { label: "Aguardando resposta", value: d?.aguardando_resposta ?? 0, icon: <MessageCircle className="h-4 w-4" />, cor: "#eab308" },
    { label: "Convertidos", value: d?.convertidos ?? 0, icon: <CheckCircle2 className="h-4 w-4" />, cor: "#10b981", hint: `${taxaConv}% de conversão` },
    { label: "Perdidos", value: d?.perdidos ?? 0, icon: <Ban className="h-4 w-4" />, cor: "#ef4444" },
  ];

  const tempos = [
    { label: "Até distribuição", seg: d?.tempo_medio_distribuicao_seg },
    { label: "Até 1ª ligação", seg: d?.tempo_medio_primeira_ligacao_seg },
    { label: "Até atendimento", seg: d?.tempo_medio_atendimento_seg },
    { label: "Até conversão", seg: d?.tempo_medio_conversao_seg },
  ];

  const maxOrigem = Math.max(1, ...(d?.por_origem ?? []).map((o) => o.total));

  return (
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#2563FF" }}>
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Painel da Central de Leads
            </h1>
            <p className="text-sm text-white/55">Métricas de intake, distribuição e produtividade</p>
          </div>
        </div>
      </header>

      {/* Seletor de período */}
      <div className="lb-fade-up flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${
              preset === p.id
                ? "border-[#3B82F6] bg-[#3B82F6]/15 text-white"
                : "border-white/12 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={cf} onChange={(e) => setCf(e.target.value)} className="h-9 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-xs text-white" />
            <span className="text-white/40">até</span>
            <input type="date" value={ct} onChange={(e) => setCt(e.target.value)} className="h-9 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-xs text-white" />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <div key={k.label} style={{ animationDelay: `${i * 0.04}s` }} className={loading ? "opacity-60" : ""}>
            <Kpi icon={k.icon} label={k.label} value={k.value} hint={k.hint} cor={k.cor} />
          </div>
        ))}
      </div>

      {/* Tempos médios */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tempos.map((t) => (
          <div key={t.label} className="lb-card-premium lb-fade-up rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider text-white/55">Tempo médio</p>
            <p className="mt-1 text-lg font-bold text-white">{fmtDur(t.seg)}</p>
            <p className="text-[11px] text-white/45">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Ranking de produtividade */}
        <div className="lb-card-premium lb-fade-up rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-300" />
            <h2 className="text-base font-bold text-white">Ranking de produtividade</h2>
            <span className="text-xs text-white/45">· no período</span>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-white/45">Carregando…</p>
          ) : rank.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/45">Sem dados no período selecionado.</p>
          ) : (
            <div className="lb-scroll overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-white/45">
                    <th className="pb-2 pr-2 font-semibold">#</th>
                    <th className="pb-2 pr-2 font-semibold">Consultor</th>
                    <th className="pb-2 pr-2 text-right font-semibold">Trab.</th>
                    <th className="pb-2 pr-2 text-right font-semibold">Atend.</th>
                    <th className="pb-2 pr-2 text-right font-semibold">Conv.</th>
                    <th className="pb-2 pr-2 text-right font-semibold">Tx. atend.</th>
                    <th className="pb-2 pr-2 text-right font-semibold">Tx. conv.</th>
                    <th className="pb-2 text-right font-semibold">Resposta</th>
                  </tr>
                </thead>
                <tbody>
                  {rank.map((r, i) => (
                    <tr key={r.vendedor_id} className="border-t border-white/8">
                      <td className="py-2 pr-2">
                        {i < 3 ? (
                          <Medal className="h-4 w-4" style={{ color: MEDAL[i] }} />
                        ) : (
                          <span className="text-white/50">{i + 1}</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 font-medium text-white">{nomeVend(r.vendedor_id)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-white/80">{r.trabalhados}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-white/80">{r.atendidos}</td>
                      <td className="py-2 pr-2 text-right tabular-nums font-bold text-emerald-300">{r.convertidos}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-white/70">{r.taxa_atendimento}%</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-white/70">{r.taxa_conversao}%</td>
                      <td className="py-2 text-right tabular-nums text-white/60">{fmtDur(r.tempo_resposta_seg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Conversão por origem */}
        <div className="lb-card-premium lb-fade-up rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#3B82F6]" />
            <h2 className="text-base font-bold text-white">Conversão por origem</h2>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-white/45">Carregando…</p>
          ) : !d || d.por_origem.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/45">Sem dados no período.</p>
          ) : (
            <div className="space-y-3">
              {d.por_origem
                .slice()
                .sort((a, b) => b.total - a.total)
                .map((o) => {
                  const conv = o.total > 0 ? Math.round((o.convertidos / o.total) * 100) : 0;
                  return (
                    <div key={o.origem}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="truncate text-white/80">{o.origem}</span>
                        <span className="tabular-nums text-white/50">
                          {o.convertidos}/{o.total} · {conv}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(o.total / maxOrigem) * 100}%`, background: "linear-gradient(90deg,#2563FF,#22C55E)" }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </PremiumStage>
  );
}
