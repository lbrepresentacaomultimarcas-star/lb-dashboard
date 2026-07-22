"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { useResultados, useSession } from "@/lib/store";
import {
  BRLc,
  filtrarPeriodo,
  filtrarPorIntervalo,
  mesLabel,
  resumir,
  type FiltroMeses,
} from "@/lib/resultados";

/** Apresentar ao Cliente: tela cheia premium (sem menus do CRM) com os
 *  resultados oficiais de Sergipe — a resposta visual para "consórcio
 *  contempla?" e "quanto já foi liberado?". */
function Apresentacao() {
  const sp = useSearchParams();
  const session = useSession();
  // Mesma fonte dos demais módulos (store global + Realtime). O período vem
  // do painel via ?de&ate; ?meses continua aceito como retrocompatível.
  const itens = useResultados();
  const de = sp.get("de");
  const ate = sp.get("ate");
  const meses = (Number(sp.get("meses")) || 12) as FiltroMeses;

  const [cheia, setCheia] = useState(false);

  const doPeriodo = useMemo(() => {
    if (de && ate) {
      return filtrarPorIntervalo(itens, new Date(`${de}T00:00:00`), new Date(`${ate}T23:59:59.999`));
    }
    return filtrarPeriodo(itens, meses);
  }, [itens, de, ate, meses]);
  const resumo = useMemo(() => resumir(doPeriodo), [doPeriodo]);
  const maxMes = Math.max(1, ...resumo.porMes.map((m) => m.qtd));
  const periodoLabel =
    de && ate
      ? "no período selecionado"
      : meses === 0
        ? "todo o histórico"
        : meses === 1
          ? "no último mês"
          : `nos últimos ${meses} meses`;

  async function toggleTelaCheia() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setCheia(true);
      } else {
        await document.exitFullscreen();
        setCheia(false);
      }
    } catch {
      /* navegador pode bloquear — ignora */
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto" style={{ background: "linear-gradient(160deg, #132743, #0a1626)" }}>
      {/* topo */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3 backdrop-blur-md md:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <button onClick={toggleTelaCheia} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10">
            {cheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {cheia ? "Sair da tela cheia" : "Tela cheia"}
          </button>
          <Link href="/resultados" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10">
            <X className="h-4 w-4" /> Sair
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 text-center md:py-14">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">Resultados oficiais da administradora</p>
        <h1 className="mt-2 text-3xl font-extrabold text-white md:text-5xl">
          Consórcio contempla em <span style={{ color: "#d4a72c" }}>Sergipe</span>? Contempla.
        </h1>
        <p className="mt-2 text-sm text-white/70 md:text-base">E aqui está a prova, {periodoLabel}:</p>

        {/* número gigante */}
        <p className="mt-8 text-8xl font-extrabold tabular-nums md:text-9xl" style={{ color: "#d4a72c", textShadow: "0 0 40px rgba(212,167,44,.35)" }}>
          {resumo.total}
        </p>
        <p className="text-lg font-semibold text-white md:text-xl">contemplações em Sergipe</p>
        {resumo.total > 0 ? (
          <p className="mt-1 text-sm text-white/70">
            🎯 {resumo.sorteios} por sorteio · 🚀 {resumo.lances} por lance
          </p>
        ) : null}

        <div className="mx-auto mt-8 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-widest text-white/60">Crédito estimado liberado</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-white md:text-4xl">
              {resumo.creditoEstimado ? BRLc(resumo.creditoEstimado) : "—"}
            </p>
            <p className="mt-1 text-[10px] text-white/50">com base no % dos lances vencedores</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-widest text-white/60">Grupos com contemplação</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-white md:text-4xl">{resumo.porGrupo.length}</p>
            <p className="mt-1 text-[10px] text-white/50">grupos diferentes contemplando em SE</p>
          </div>
        </div>

        {/* tipos de bem */}
        {resumo.porBem.length > 0 ? (
          <div className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-2">
            {resumo.porBem.slice(0, 5).map((m) => (
              <span key={m.nome} className="rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-semibold text-white">
                {m.nome}: <span style={{ color: "#d4a72c" }}>{m.qtd}</span>
              </span>
            ))}
          </div>
        ) : null}

        {/* evolução */}
        {resumo.porMes.length > 1 ? (
          <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-white/15 bg-white/5 p-6">
            <p className="mb-4 text-sm font-bold uppercase tracking-widest text-white/70">Evolução mês a mês</p>
            <div className="flex items-end justify-center gap-2 overflow-x-auto md:gap-3">
              {resumo.porMes.map((m) => (
                <div key={m.mes} className="flex min-w-10 flex-col items-center gap-1.5">
                  <span className="text-xs font-bold tabular-nums text-white">{m.qtd}</span>
                  <div className="w-8 rounded-t-lg transition-[height] duration-700 md:w-10" style={{ height: `${Math.max(12, (m.qtd / maxMes) * 140)}px`, background: "linear-gradient(180deg, #d4a72c, rgba(212,167,44,.35))" }} />
                  <span className="text-[10px] text-white/60">{mesLabel(m.mes)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {itens.length === 0 ? (
          <p className="mt-10 text-white/70">Nenhum resultado importado ainda — importe o resultado oficial no módulo Resultados LB.</p>
        ) : null}

        <div className="mt-12 border-t border-white/10 pt-6">
          {session?.nome ? (
            <>
              <p className="text-sm text-white/80">Apresentação preparada por</p>
              <p className="text-lg font-extrabold text-white">{session.nome}</p>
              <p className="text-sm" style={{ color: "#d4a72c" }}>Consultor LB Representações</p>
            </>
          ) : (
            <p className="text-sm text-white/80">LB Representações</p>
          )}
          <p className="mt-3 text-[11px] text-white/50">
            Fonte: resultados oficiais das assembleias · cotas de Sergipe (UF) · crédito estimado a partir do % dos lances.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ApresentacaoResultadosPage() {
  return (
    <Suspense fallback={null}>
      <Apresentacao />
    </Suspense>
  );
}
