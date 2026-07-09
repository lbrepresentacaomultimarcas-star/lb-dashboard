"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { PainelResultado, AnaliseInteligente, ResumoFinanceiro } from "@/components/consorcio/painel-premium";
import {
  CONFIG_PADRAO,
  NIVEL_INFO,
  consorcioApi,
  formatBRL,
  simularContemplacao,
  type ConsorcioAssembleia,
  type ConsorcioConfig,
} from "@/lib/consorcio";

/** Modo Apresentação (tela cheia, premium) para mostrar ao cliente na mesa.
 *  Overlay fixo z-[100] cobre a sidebar → tela limpa, sem menus. */
function Apresentacao() {
  const sp = useSearchParams();
  const carta = Number(sp.get("carta")) || 0;
  const lance = Number(sp.get("lance")) || 0;
  const grupo = sp.get("grupo") ?? "";
  const cliente = sp.get("cliente") ?? "";
  const usarEmbutido = sp.get("embutido") === "1";

  const [config, setConfig] = useState<ConsorcioConfig>(CONFIG_PADRAO);
  const [historico, setHistorico] = useState<ConsorcioAssembleia[]>([]);
  const [pctEmbutidoGrupo, setPctEmbutidoGrupo] = useState(30);
  const [cheia, setCheia] = useState(false);

  useEffect(() => {
    void (async () => {
      const [cfg, asm, grupos] = await Promise.all([
        consorcioApi.obterConfig(),
        consorcioApi.listarAssembleias(),
        consorcioApi.listarGrupos(),
      ]);
      setConfig(cfg);
      setHistorico(asm.filter((a) => a.grupo === grupo));
      const g = grupos.find((x) => x.grupo === grupo);
      if (g?.pctEmbutido != null) setPctEmbutidoGrupo(g.pctEmbutido);
    })();
  }, [grupo]);

  const resultado = useMemo(
    () =>
      carta > 0 && lance > 0
        ? simularContemplacao({ valorCarta: carta, valorLance: lance, usarEmbutido, pctEmbutidoGrupo, config, historico })
        : null,
    [carta, lance, usarEmbutido, pctEmbutidoGrupo, config, historico],
  );
  const cor = resultado ? NIVEL_INFO[resultado.nivel].cor : "var(--color-brand)";

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
      /* alguns navegadores bloqueiam — ignora */
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      style={{
        background: `radial-gradient(120% 80% at 50% -10%, color-mix(in oklab, ${cor} 16%, var(--color-bg, #0a0a0f)), var(--color-bg, #0a0a0f))`,
      }}
    >
      {/* topo */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3 backdrop-blur-md md:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTelaCheia}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
          >
            {cheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {cheia ? "Sair da tela cheia" : "Tela cheia"}
          </button>
          <Link
            href="/consorcio"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4" /> Sair
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        {resultado ? (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--color-muted)]">
                Simulação de Contemplação
              </p>
              <h1 className="mt-1 text-xl font-bold text-[var(--color-text)] md:text-2xl">
                Consultoria em Consórcio · LB Representações
              </h1>
              {cliente ? (
                <p className="mt-2 text-base font-medium text-[var(--color-text-dim)] md:text-lg">
                  Apresentado para <span className="font-bold text-[var(--color-text)]">{cliente}</span>
                  {grupo ? ` · Grupo ${grupo}` : ""}
                </p>
              ) : null}
            </div>

            {/* Carta e Lance — grandes */}
            <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
                <p className="text-xs uppercase tracking-widest text-[var(--color-muted)]">Valor da carta</p>
                <p className="mt-1 text-3xl font-extrabold text-[var(--color-text)] md:text-4xl">{formatBRL(carta)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
                <p className="text-xs uppercase tracking-widest text-[var(--color-muted)]">Valor do lance</p>
                <p className="mt-1 text-3xl font-extrabold text-[var(--color-text)] md:text-4xl">{formatBRL(lance)}</p>
              </div>
            </div>

            {/* Velocímetro + % gigante + classificação */}
            <PainelResultado resultado={resultado} grande />

            {/* Resumo financeiro */}
            <ResumoFinanceiro resultado={resultado} grande />

            {/* Explicação inteligente */}
            <AnaliseInteligente resultado={resultado} grande />

            {/* Resultado final */}
            <div
              className="rounded-2xl border p-5 text-center"
              style={{ borderColor: `color-mix(in oklab, ${cor} 45%, transparent)`, background: `color-mix(in oklab, ${cor} 10%, transparent)` }}
            >
              <p className="text-sm uppercase tracking-widest text-[var(--color-text-dim)]">Resultado final</p>
              <p className="mt-1 text-2xl font-extrabold md:text-3xl" style={{ color: cor }}>
                {NIVEL_INFO[resultado.nivel].emoji} {NIVEL_INFO[resultado.nivel].titulo} · {resultado.probabilidade}% estimado
              </p>
            </div>

            <p className="text-center text-xs text-[var(--color-muted)]">LB Representações · Multimarcas Consórcios</p>
          </div>
        ) : (
          <p className="py-24 text-center text-[var(--color-text-dim)]">
            Preencha carta e lance no simulador e clique em “Modo apresentação”.
          </p>
        )}
      </div>
    </div>
  );
}

export default function ApresentacaoPage() {
  return (
    <Suspense fallback={null}>
      <Apresentacao />
    </Suspense>
  );
}
