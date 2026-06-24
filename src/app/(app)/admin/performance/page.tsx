"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Sliders, Sparkles, Trophy } from "lucide-react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PremiumStage } from "@/components/premium-stage";
import { FaixaBadge, MetaBadge } from "@/components/perf-badge";
import { usePerformanceConfig, performanceConfigApi } from "@/lib/store";
import {
  calcularPerformance,
  detalharIndicadores,
  FAIXA_INFO,
  versusMeta,
  type MetasPerformance,
  type PesosPerformance,
} from "@/lib/performance";

function NumField({
  id,
  label,
  value,
  onChange,
  suffix,
  min = 0,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  min?: number;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={min}
          value={value}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export default function PerformanceConfigPage() {
  const config = usePerformanceConfig();
  const [pesos, setPesos] = useState<PesosPerformance>(config.pesos);
  const [metas, setMetas] = useState<MetasPerformance>(config.metas);
  const [salvando, setSalvando] = useState(false);
  const dirty = useRef(false);

  // Re-semeia do banco enquanto o admin ainda não editou.
  useEffect(() => {
    if (dirty.current) return;
    setPesos(config.pesos);
    setMetas(config.metas);
  }, [config]);

  const setPeso = (k: keyof PesosPerformance, n: number) => {
    dirty.current = true;
    setPesos((p) => ({ ...p, [k]: n }));
  };
  const setMeta = (k: keyof MetasPerformance, n: number) => {
    dirty.current = true;
    setMetas((m) => ({ ...m, [k]: n }));
  };

  const somaPesos = pesos.conversao + pesos.fechamentos + pesos.agendamentos + pesos.propostas + pesos.atualizacao;

  // ---- Simulador ao vivo (demonstra classificação + meta atual + meta batida) ----
  const [sim, setSim] = useState({
    fechados: 5,
    oportunidades: 15,
    agendamentos: 12,
    propostas: 18,
    leadsAtivos: 10,
    leadsAtualizados: 8,
  });
  const setSimField = (k: keyof typeof sim, n: number) => setSim((s) => ({ ...s, [k]: n }));

  const cfgAtual = useMemo(() => ({ pesos, metas }), [pesos, metas]);
  const resultado = useMemo(() => calcularPerformance(sim, cfgAtual), [sim, cfgAtual]);
  const detalhes = useMemo(() => detalharIndicadores(sim, cfgAtual), [sim, cfgAtual]);
  const vmSim = versusMeta(resultado.nota, metas.metaEmpresa);

  async function salvar() {
    setSalvando(true);
    try {
      await performanceConfigApi.save({ pesos, metas });
      dirty.current = false;
      notify.success("Configuração de performance salva");
    } catch (e) {
      notify.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  const fmt = (v: number, unidade: "%" | "qtd") =>
    unidade === "%" ? `${Math.round(v)}%` : `${Math.round(v)}`;

  return (
    <PremiumStage>
      <header className="lb-fade-up flex items-center gap-3">
        <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#C9A227" }}>
          <Trophy className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
            Índice LB de Performance
          </h1>
          <p className="text-sm text-white/55">Pesos e metas do cálculo de desempenho — sem mexer no código.</p>
        </div>
      </header>

      {/* PESOS */}
      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <Sliders className="h-4 w-4 text-amber-300" /> Pesos
          </h2>
          <span className={`text-xs font-bold tabular-nums ${somaPesos === 100 ? "text-emerald-300" : "text-amber-300"}`}>
            Soma: {somaPesos}{somaPesos !== 100 ? " (ideal 100)" : ""}
          </span>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-3 xl:grid-cols-5">
          <NumField id="pc" label="Conversão" value={pesos.conversao} onChange={(n) => setPeso("conversao", n)} suffix="%" />
          <NumField id="pf" label="Fechamentos" value={pesos.fechamentos} onChange={(n) => setPeso("fechamentos", n)} suffix="%" />
          <NumField id="pa" label="Agendamentos" value={pesos.agendamentos} onChange={(n) => setPeso("agendamentos", n)} suffix="%" />
          <NumField id="pp" label="Propostas" value={pesos.propostas} onChange={(n) => setPeso("propostas", n)} suffix="%" />
          <NumField id="pu" label="Atualização CRM" value={pesos.atualizacao} onChange={(n) => setPeso("atualizacao", n)} suffix="%" />
        </div>
      </div>

      {/* METAS */}
      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Metas (bater a meta = 100% no indicador)</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
            <div className="min-w-[180px] flex-1">
              <p className="text-sm font-semibold text-white">Meta da empresa (performance mínima)</p>
              <p className="text-[11px] text-white/50">Nota que cada vendedor precisa atingir — aparece no card dele.</p>
            </div>
            <div className="w-32">
              <Label htmlFor="me">Meta</Label>
              <div className="relative">
                <Input
                  id="me"
                  type="number"
                  min={0}
                  max={100}
                  value={metas.metaEmpresa}
                  onChange={(e) => setMeta("metaEmpresa", Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">%</span>
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
            <NumField id="mc" label="Conversão" value={metas.conversao} onChange={(n) => setMeta("conversao", n)} suffix="%" />
            <NumField id="mf" label="Fechamentos" value={metas.fechamentos} onChange={(n) => setMeta("fechamentos", n)} suffix="qtd" />
            <NumField id="ma" label="Agendamentos" value={metas.agendamentos} onChange={(n) => setMeta("agendamentos", n)} suffix="qtd" />
            <NumField id="mp" label="Propostas" value={metas.propostas} onChange={(n) => setMeta("propostas", n)} suffix="qtd" />
            <NumField id="md" label="Frescor do lead" value={metas.diasFrescor} onChange={(n) => setMeta("diasFrescor", n)} suffix="dias" min={1} />
            <NumField id="ml" label="Limiar evolução" value={metas.limiarEvolucao} onChange={(n) => setMeta("limiarEvolucao", n)} suffix="pts" />
          </div>
        </div>
        <div className="flex justify-end px-5 pb-5">
          <Button onClick={salvar} disabled={salvando}>
            <Save className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar configuração"}
          </Button>
        </div>
      </div>

      {/* SIMULADOR */}
      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <Sparkles className="h-4 w-4 text-indigo-300" /> Simulador — veja a nota mudar ao vivo
          </h2>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[300px_1fr]">
          {/* entradas */}
          <div className="grid grid-cols-2 gap-3">
            <NumField id="sf" label="Fechados" value={sim.fechados} onChange={(n) => setSimField("fechados", n)} />
            <NumField id="so" label="Oportunidades" value={sim.oportunidades} onChange={(n) => setSimField("oportunidades", n)} />
            <NumField id="sa" label="Agendamentos" value={sim.agendamentos} onChange={(n) => setSimField("agendamentos", n)} />
            <NumField id="sp" label="Propostas" value={sim.propostas} onChange={(n) => setSimField("propostas", n)} />
            <NumField id="sla" label="Leads ativos" value={sim.leadsAtivos} onChange={(n) => setSimField("leadsAtivos", n)} />
            <NumField id="slu" label="Atualizados (7d)" value={sim.leadsAtualizados} onChange={(n) => setSimField("leadsAtualizados", n)} />
          </div>

          {/* resultado */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/45">Nota de performance</p>
                <p className="text-4xl font-extrabold tabular-nums text-white">
                  {resultado.nota.toFixed(1)}<span className="text-xl text-white/40">%</span>
                </p>
                <p className="text-[11px] font-semibold" style={{ color: vmSim.atingiu ? "#22C55E" : "#fb923c" }}>
                  Meta {Math.round(metas.metaEmpresa)}% ·{" "}
                  {vmSim.atingiu ? `acima em ${vmSim.diferenca.toFixed(0)}%` : `faltam ${vmSim.diferenca.toFixed(0)}%`}
                </p>
              </div>
              <div className="text-right">
                <FaixaBadge faixa={resultado.faixa} />
                <p className="mt-1 max-w-[240px] text-[11px] text-white/55">{FAIXA_INFO[resultado.faixa].mensagem}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {detalhes.map((d) => (
                <div key={d.chave} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs text-white/70">{d.label}</span>
                  <span className="w-24 shrink-0 text-[11px] tabular-nums text-white/45">
                    {fmt(d.realizado, d.unidade)} / meta {fmt(d.meta, d.unidade)}
                  </span>
                  <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-white/10 sm:block">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(d.subNota, 100)}%`, background: d.batida ? "#22C55E" : "#3B82F6" }}
                    />
                  </div>
                  <MetaBadge batida={d.batida} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PremiumStage>
  );
}
