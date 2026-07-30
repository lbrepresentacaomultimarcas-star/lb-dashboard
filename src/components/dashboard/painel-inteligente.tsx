"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Clock, Pin, Target } from "lucide-react";
import { useDashboardConfig, useMetasEscopo, useSession, useVendasEscopo, useVendedoresEscopo } from "@/lib/store";
import { useCicloProducao } from "@/lib/use-ciclo";
import { cicloAtual } from "@/lib/ciclo";
import { brl, pct } from "@/lib/utils";
import { fraseDoDia, lembreteDoDia, saudacaoDoHorario } from "@/lib/frases";

/** Relógio ao vivo — componente isolado (tick de 1s só re-renderiza ele). */
function Relogio() {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    // Primeira atualização fora do corpo do efeito + tick de 1s (ambos via
    // callback → sem setState síncrono no efeito e sem mismatch de hidratação).
    const primeira = setTimeout(() => setAgora(new Date()), 0);
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => {
      clearTimeout(primeira);
      clearInterval(id);
    };
  }, []);
  const dataFmt = agora
    ? agora.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })
    : "—";
  const horaFmt = agora
    ? agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  return (
    <div className="shrink-0 text-left md:text-right">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/45 md:justify-end">
        <CalendarDays className="h-3.5 w-3.5" /> Hoje é
      </div>
      <p className="text-sm font-semibold capitalize text-white">{dataFmt}</p>
      <div className="mt-1 flex items-center gap-2 md:justify-end">
        <Clock className="lb-pulse-glow h-5 w-5 text-[var(--color-brand)]" />
        <span className="text-3xl font-extrabold tabular-nums text-white">{horaFmt}</span>
      </div>
    </div>
  );
}

export function PainelInteligente() {
  const session = useSession();
  const vendas = useVendasEscopo(); // já exclui Canceladas
  const metas = useMetasEscopo();
  const vendedores = useVendedoresEscopo();
  const cfg = useDashboardConfig();
  const { config, feriados } = useCicloProducao();

  // Muda a cada dia (não precisa de relógio ao vivo pra isso).
  const saud = saudacaoDoHorario();
  const frase = fraseDoDia();
  const primeiroNome = (session?.nome ?? "").trim().split(/\s+/)[0] || "Bem-vindo";

  const ciclo = useMemo(() => {
    const c = cicloAtual(config, feriados, new Date());
    const diasRestantes = Math.max(0, Math.ceil((c.fim.getTime() - new Date().getTime()) / 86_400_000));
    return { ...c, diasRestantes };
  }, [config, feriados]);
  const inicioFmt = ciclo.inicio.toLocaleDateString("pt-BR");
  const fimFmt = ciclo.fim.toLocaleDateString("pt-BR");
  const diasRestantes = ciclo.diasRestantes;
  const corCiclo = diasRestantes > 15 ? "#22c55e" : diasRestantes >= 7 ? "#f59e0b" : "#f43f5e";

  // Motivação: faturamento da equipe no CICLO atual vs meta do ciclo.
  const faturadoCiclo = useMemo(
    () =>
      vendas.reduce((s, v) => {
        const d = new Date(v.data);
        return d >= ciclo.inicio && d <= ciclo.fim ? s + v.valor : s;
      }, 0),
    [vendas, ciclo],
  );
  const metaCiclo = useMemo(
    () =>
      vendedores
        .filter((v) => v.ativo)
        .reduce(
          (s, v) => s + (metas.find((m) => m.vendedorId === v.id && m.anoMes === ciclo.chave)?.valor ?? v.metaMensal ?? 0),
          0,
        ),
    [vendedores, metas, ciclo],
  );
  const falta = Math.max(0, metaCiclo - faturadoCiclo);
  const pctMeta = metaCiclo > 0 ? (faturadoCiclo / metaCiclo) * 100 : 0;

  const motiv = (() => {
    if (metaCiclo > 0 && faturadoCiclo >= metaCiclo)
      return { icon: "🏆", texto: `Meta do ciclo batida! Já são ${brl(faturadoCiclo)}. Continue assim!` };
    if (metaCiclo > 0 && faturadoCiclo > 0)
      return { icon: "🚀", texto: `Faltam ${brl(falta)} para a meta do ciclo — a equipe já fez ${brl(faturadoCiclo)} (${pct(pctMeta)}).` };
    if (faturadoCiclo > 0)
      return { icon: "🔥", texto: `A equipe já faturou ${brl(faturadoCiclo)} neste ciclo. Bora somar mais!` };
    return { icon: "💪", texto: "Ciclo novo começando — cada contato de hoje conta. Vamos com tudo!" };
  })();

  const lembrete = cfg.lembrete.trim() || lembreteDoDia();

  const cardCls = "rounded-xl border border-white/10 bg-white/[0.03] p-4";
  const rotuloCls = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50";

  return (
    <section className="lb-card-premium lb-fade-up rounded-2xl p-5 md:p-6">
      {/* saudação + relógio */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
            {saud.emoji} {saud.texto}, {primeiroNome}!
          </h1>
          <p className="mt-1 text-sm italic text-white/60">&ldquo;{frase}&rdquo;</p>
        </div>
        <Relogio />
      </div>

      {/* faixa de motivação */}
      <div
        className="mt-4 flex items-center gap-2 rounded-xl border p-3"
        style={{ borderColor: "rgba(16,185,129,.28)", background: "linear-gradient(90deg, rgba(16,185,129,.14), rgba(16,185,129,.03))" }}
      >
        <span className="text-lg">{motiv.icon}</span>
        <p className="text-sm font-semibold text-white">{motiv.texto}</p>
      </div>

      {/* ciclo / meta do dia / lembrete */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {/* Ciclo */}
        <div className={cardCls}>
          <div className={rotuloCls}>
            <BarChart3 className="h-3.5 w-3.5" /> Ciclo atual
          </div>
          <p className="mt-2 text-sm font-semibold text-white">
            {inicioFmt} <span className="font-normal text-white/40">até</span> {fimFmt}
          </p>
          <div className="mt-3">
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold"
              style={{ borderColor: `${corCiclo}55`, background: `${corCiclo}18`, color: corCiclo }}
            >
              ⏳ Restam {diasRestantes} {diasRestantes === 1 ? "dia" : "dias"}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-white/40">para encerrar a produção</p>
        </div>

        {/* Meta do Dia */}
        <div className={cardCls}>
          <div className={rotuloCls}>
            <Target className="h-3.5 w-3.5" /> Meta do Dia
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-white/85">
            <li>
              <span className="text-emerald-400">✔</span> Fazer <b className="text-white">{cfg.metaLigacoes}</b> ligações
            </li>
            <li>
              <span className="text-emerald-400">✔</span> Agendar <b className="text-white">{cfg.metaReunioes}</b> reuniões
            </li>
            <li>
              <span className="text-emerald-400">✔</span> Fechar <b className="text-white">{cfg.metaVendas}</b>{" "}
              {cfg.metaVendas === 1 ? "venda" : "vendas"}
            </li>
          </ul>
        </div>

        {/* Lembrete do Dia */}
        <div className={cardCls}>
          <div className={rotuloCls}>
            <Pin className="h-3.5 w-3.5" /> Lembrete do Dia
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/85">{lembrete}</p>
        </div>
      </div>
    </section>
  );
}
