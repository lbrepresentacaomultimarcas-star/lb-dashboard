"use client";

/*
 * EVENTO / DESAFIO EM DESTAQUE — o topo do Dashboard quando há campanha.
 *
 * DUAS METAS, UMA PRIORIDADE
 *
 * A meta do evento (os R$ 8 mi da gincana, por exemplo) fica em letra pequena,
 * como contexto. A meta da LB domina a tela. Tratar os 8 milhões como se
 * fossem nossos desanima em vez de motivar: a conta nunca fecha, e o time
 * desiste antes de começar. O que move é a meta alcançável — a nossa.
 *
 * O REALIZADO É REAL
 *
 * Vem de `vendasNoPeriodo` + `totalFaturado`, as MESMAS funções que o
 * Dashboard já usa. Nenhuma conta de faturamento é refeita aqui.
 *
 * Usa `useVendas` (empresa inteira), não a versão escopada: o desafio é do
 * TIME. Um consultor precisa ver o quanto a LB já fez, não o quanto ele fez —
 * senão cada pessoa veria uma barra diferente para a mesma meta coletiva.
 *
 * Sem evento ativo, o componente devolve `null` e o espaço deixa de existir.
 */

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Flame, Trophy } from "lucide-react";
import { useVendas } from "@/lib/store";
import { totalFaturado, vendasNoPeriodo } from "@/lib/selectors";
import { useCicloProducao } from "@/lib/use-ciclo";
import { eventosApi, placar, diasRestantes, type EventoDestaque } from "@/lib/eventos";
import { brl } from "@/lib/utils";

export function EventoDestaqueCard() {
  const vendas = useVendas();
  const { config, feriados } = useCicloProducao();
  const [evento, setEvento] = useState<EventoDestaque | null>(null);

  useEffect(() => {
    let vivo = true;
    eventosApi
      .emDestaque()
      .then((e) => vivo && setEvento(e))
      .catch(() => {
        /* sem evento não é erro */
      });
    return () => {
      vivo = false;
    };
  }, []);

  const dados = useMemo(() => {
    if (!evento) return null;
    // O período do evento, não o ciclo do mês: uma gincana pode atravessar
    // a virada e o placar tem que continuar contando.
    const doPeriodo = vendasNoPeriodo(
      vendas,
      {
        from: new Date(`${evento.inicio}T00:00:00`),
        to: new Date(`${evento.fim}T23:59:59`),
        // "personalizado" e SEM cicloKey de propósito: assim o filtro usa o
        // intervalo de datas do evento, não a bucketização por ciclo de
        // produção. Uma gincana começa e termina quando o organizador diz.
        preset: "personalizado",
      },
      config,
      feriados,
    );
    return placar(evento.metaLb, totalFaturado(doPeriodo));
  }, [evento, vendas, config, feriados]);

  if (!evento || !dados) return null;

  const dias = diasRestantes(evento.fim);

  return (
    <section className="lb-fade-up relative overflow-hidden rounded-2xl border border-[var(--color-gold,#d4a72c)]/40 bg-[var(--color-surface)]">
      {/* brilho discreto no topo — presença, sem circo */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-32"
        style={{ background: "radial-gradient(120% 100% at 50% 0%, rgba(212,167,44,.16), transparent 70%)" }}
        aria-hidden
      />

      {/* --------------------------- a capa --------------------------- */}
      {evento.capaUrl && (
        <div className="relative w-full overflow-hidden border-b border-[var(--color-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- arte enviada
              pelo admin, de domínio externo (Storage); o otimizador do Next
              exigiria configurar cada host, e a arte muda a cada campanha. */}
          <img
            src={evento.capaUrl}
            alt={evento.nome}
            className="max-h-[320px] w-full object-cover"
          />
        </div>
      )}

      <div className="relative space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-gold,#d4a72c)]">
              🔥 Desafio em destaque
            </p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-[var(--color-text)] md:text-2xl">
              {evento.nome}
            </h2>
            {evento.frase && (
              <p className="mt-1 text-sm text-[var(--color-text-dim)]">{evento.frase}</p>
            )}
          </div>
          {dias >= 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-dim)]">
              <CalendarClock className="h-3 w-3" />
              {dias === 0 ? "Último dia!" : `Faltam ${dias} ${dias === 1 ? "dia" : "dias"}`}
            </span>
          )}
        </div>

        {/* ---------------------- a NOSSA meta ---------------------- */}
        <div className="rounded-xl border border-[var(--color-gold,#d4a72c)]/30 bg-[var(--color-gold,#d4a72c)]/[0.07] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-gold,#d4a72c)]">
            🎯 Meta LB
          </p>
          <p className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight text-[var(--color-text)] md:text-4xl">
            {brl(dados.meta)}
          </p>

          <div className="mt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-bold tabular-nums text-[var(--color-text)]">
                {brl(dados.realizado)}
              </span>
              <span className="font-bold tabular-nums text-[var(--color-gold,#d4a72c)]">
                {dados.pct.toFixed(2).replace(".", ",")}%
              </span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-out"
                style={{
                  width: `${dados.pctBarra}%`,
                  background: dados.bateu
                    ? "linear-gradient(90deg,#22c55e,#4ade80)"
                    : "linear-gradient(90deg,#d4a72c,#f5d76e)",
                  boxShadow: "0 0 14px -2px rgba(212,167,44,.7)",
                }}
              />
            </div>

            {dados.bateu ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-emerald-400">
                <Trophy className="h-4 w-4" /> Meta LB atingida! {brl(dados.meta)} conquistados. 🏆
              </p>
            ) : (
              <p className="mt-2 text-sm text-[var(--color-text-dim)]">
                Faltam{" "}
                <span className="font-bold text-[var(--color-text)]">{brl(dados.faltam)}</span> para
                a meta.
              </p>
            )}
          </div>
        </div>

        {/* -------- a mensagem do admin e o contexto da meta geral -------- */}
        {evento.mensagem && (
          <p className="flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm font-semibold leading-snug text-[var(--color-text)]">
            <Flame className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-gold,#d4a72c)]" />
            <span className="whitespace-pre-line">{evento.mensagem}</span>
          </p>
        )}

        {!!evento.metaGeral && evento.metaGeral > 0 && (
          <p className="text-[11px] text-[var(--color-muted)]">
            Meta geral do evento: {brl(evento.metaGeral)} — somando todas as operações. A nossa é a
            de cima.
          </p>
        )}
        {evento.descricao && (
          <p className="text-xs text-[var(--color-text-dim)]">{evento.descricao}</p>
        )}
      </div>
    </section>
  );
}
