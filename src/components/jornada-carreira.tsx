"use client";

/*
 * A TRAJETÓRIA, DESENHADA.
 *
 * O objetivo aqui é uma frase: mostrar que existe para onde crescer.
 *
 * Por isso NÃO é um jogo. Sem barra de progresso, sem porcentagem, sem
 * medalha, sem "faltam X vendas". Nada disso seria verdade — a promoção é
 * decisão do administrador, e insinuar automatismo criaria uma expectativa
 * que a operação não prometeu.
 *
 * O que se vê: onde a pessoa está, o que vem depois, e o degrau seguinte em
 * destaque discreto. Os níveis já passados aparecem apagados; os futuros,
 * presentes mas sem alarde. É um mapa, não um placar.
 */

import { ChevronDown } from "lucide-react";
import { JORNADA, degrauDe, proximoDegrau } from "@/lib/jornada";
import type { Papel } from "@/lib/types";

export function JornadaCarreira({
  papel,
  codigo,
}: {
  papel: Papel | undefined;
  /** O código real de quem está olhando — só aparece no degrau atual. */
  codigo?: string | null;
}) {
  const atual = degrauDe(papel);
  const proximo = proximoDegrau(papel);
  const iAtual = JORNADA.findIndex((d) => d.papel === papel);

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
          Trajetória na operação
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          {atual
            ? "Há caminho para crescer aqui dentro. Cada nível é uma decisão da administração, conquistada no trabalho."
            : "Estrutura de carreira da operação comercial."}
        </p>
      </div>

      <ol className="space-y-0">
        {JORNADA.map((d, i) => {
          const ehAtual = d.papel === papel;
          const ehProximo = proximo?.papel === d.papel;
          const jaPassou = iAtual >= 0 && i < iAtual;

          return (
            <li key={d.papel}>
              <div
                className={[
                  "rounded-xl border px-4 py-3 transition-colors",
                  ehAtual
                    ? "border-[var(--color-brand)]/60 bg-[var(--color-brand)]/10"
                    : ehProximo
                      ? "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                      : "border-[var(--color-border)]",
                  jaPassou ? "opacity-45" : "",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-bold uppercase tracking-wider ${
                        ehAtual ? "text-[var(--color-brand)]" : "text-[var(--color-text)]"
                      }`}
                    >
                      {d.rotulo}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">{d.resumo}</p>
                  </div>

                  {/* O código real só no degrau da pessoa. Nos outros, o
                      formato — para ela reconhecer o padrão sem que pareça
                      que o código já é dela. */}
                  <span className="shrink-0 font-mono text-xs tracking-wider text-[var(--color-muted)]">
                    {ehAtual && codigo ? codigo : `${d.prefixo}001`}
                  </span>
                </div>

                {ehAtual && (
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
                    Você está aqui
                  </p>
                )}
                {ehProximo && (
                  <p className="mt-2 text-[11px] font-semibold text-[var(--color-text-dim)]">
                    Próximo nível
                  </p>
                )}
              </div>

              {i < JORNADA.length - 1 && (
                <div className="flex justify-center py-1" aria-hidden>
                  <ChevronDown className="h-4 w-4 text-[var(--color-muted)]" />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
