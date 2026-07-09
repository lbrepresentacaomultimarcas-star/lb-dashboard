"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Landmark } from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import {
  CLASSIFICACAO_INFO,
  CONFIG_PADRAO,
  consorcioApi,
  formatBRL,
  simularContemplacao,
  type ConsorcioAssembleia,
  type ConsorcioConfig,
} from "@/lib/consorcio";

/** Tela comercial: visual limpo e grande para o consultor apresentar a
 *  simulação ao cliente durante a negociação. Sem dados administrativos. */
function Apresentacao() {
  const sp = useSearchParams();
  const carta = Number(sp.get("carta")) || 0;
  const lance = Number(sp.get("lance")) || 0;
  const grupo = sp.get("grupo") ?? "";
  const usarEmbutido = sp.get("embutido") === "1";

  const [config, setConfig] = useState<ConsorcioConfig>(CONFIG_PADRAO);
  const [historico, setHistorico] = useState<ConsorcioAssembleia[]>([]);
  const [pctEmbutidoGrupo, setPctEmbutidoGrupo] = useState(30);

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

  const cls = resultado ? CLASSIFICACAO_INFO[resultado.classificacao] : null;

  return (
    <PremiumStage>
      <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center py-8">
        <Link
          href="/consorcio"
          className="mb-6 inline-flex w-fit items-center gap-1 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] print:hidden"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao simulador
        </Link>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-xl">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-widest text-[var(--color-text-dim)]">
            <Landmark className="h-4 w-4 text-[var(--color-brand)]" />
            Simulação de contemplação{grupo ? ` · Grupo ${grupo}` : ""}
          </p>

          {resultado && cls ? (
            <>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-[var(--color-surface-2)] p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Crédito</p>
                  <p className="mt-1 text-2xl font-extrabold text-[var(--color-text)]">{formatBRL(carta)}</p>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-2)] p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Lance ofertado</p>
                  <p className="mt-1 text-2xl font-extrabold text-[var(--color-text)]">{formatBRL(lance)}</p>
                </div>
              </div>

              <p className="mt-8 text-7xl font-extrabold tracking-tight text-[var(--color-text)]">
                {resultado.pctLance.toFixed(1)}%
              </p>
              <p className="text-sm text-[var(--color-text-dim)]">do valor do crédito</p>

              <p className="mt-4 text-3xl font-bold">
                {cls.emoji}{" "}
                <span
                  style={{
                    color:
                      cls.tone === "success"
                        ? "var(--color-success)"
                        : cls.tone === "warn"
                          ? "var(--color-warn)"
                          : "var(--color-danger)",
                  }}
                >
                  {cls.label}
                </span>
              </p>

              {usarEmbutido && resultado.valorEmbutido > 0 ? (
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-[var(--color-surface-2)] p-3">
                    <p className="text-[10px] uppercase text-[var(--color-muted)]">Lance embutido</p>
                    <p className="mt-1 font-bold text-[var(--color-text)]">{formatBRL(resultado.valorEmbutido)}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-surface-2)] p-3">
                    <p className="text-[10px] uppercase text-[var(--color-muted)]">Recurso próprio</p>
                    <p className="mt-1 font-bold text-[var(--color-text)]">{formatBRL(resultado.recursoProprio)}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-surface-2)] p-3">
                    <p className="text-[10px] uppercase text-[var(--color-muted)]">Crédito líquido</p>
                    <p className="mt-1 font-bold text-[var(--color-text)]">{formatBRL(resultado.creditoLiquido)}</p>
                  </div>
                </div>
              ) : null}

              {resultado.medianaHistorico !== null ? (
                <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-[var(--color-text-dim)]">
                  Nas {resultado.totalAssembleiasHistorico} assembleias registradas deste grupo, o menor lance livre
                  contemplado ficou em torno de <strong>{resultado.medianaHistorico.toFixed(1)}%</strong> (mediana).
                </p>
              ) : null}

              <p className="mx-auto mt-6 max-w-xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-xs leading-relaxed text-[var(--color-text-dim)]">
                ⚠️ Esta é uma <strong>estimativa</strong> para apoiar a sua decisão. A contemplação depende do resultado
                da assembleia e <strong>não é garantida</strong> em nenhuma hipótese.
              </p>
            </>
          ) : (
            <p className="py-16 text-sm text-[var(--color-text-dim)]">
              Preencha carta e lance no simulador e clique em “Modo apresentação”.
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-[var(--color-muted)]">
          LB Representações · Multimarcas Consórcios
        </p>
      </div>
    </PremiumStage>
  );
}

export default function ApresentacaoPage() {
  return (
    <Suspense fallback={null}>
      <Apresentacao />
    </Suspense>
  );
}
