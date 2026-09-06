"use client";

/*
 * O MAPA DE EVOLUÇÃO — a parte que interpreta.
 *
 * Separado da página porque o ADMIN vê o mesmo mapa ao abrir o perfil de um
 * colaborador. Um componente só: se a leitura mudar, muda para os dois, e não
 * existe a chance de o consultor ver um diagnóstico e o gestor outro.
 *
 * O que NÃO tem aqui, de propósito: gráfico, nota, ranking, posição. Isso é o
 * módulo Performance, e duplicá-lo transformaria o perfil em mais um relatório.
 * Aqui a pergunta é outra — o que eu faço com isso amanhã?
 */

import { AlertTriangle, ArrowRight, Sparkles, Target, TrendingUp } from "lucide-react";
import type { useEvolucao } from "@/lib/use-evolucao";
import { proximoDegrau, type Degrau } from "@/lib/jornada";
import type { Papel } from "@/lib/types";

type Mapa = ReturnType<typeof useEvolucao>;

function Bloco({
  icone, titulo, cor, children,
}: {
  icone: React.ReactNode;
  titulo: string;
  cor?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3
        className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: cor ?? "var(--color-text-dim)" }}
      >
        {icone} {titulo}
      </h3>
      {children}
    </section>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloCiclo = (chave: string) => {
  const [, m] = chave.split("-").map(Number);
  return MESES[(m - 1 + 12) % 12] ?? chave;
};

export function MapaEvolucao({
  mapa, papel, primeiraPessoa = true, nome,
}: {
  mapa: Mapa;
  papel: Papel | undefined;
  /** `false` na visão do admin: o texto fala DELE, não com ele. */
  primeiraPessoa?: boolean;
  nome?: string;
}) {
  const proximo: Degrau | null = proximoDegrau(papel);
  const quem = primeiraPessoa ? "Você" : (nome ?? "O colaborador");

  if (!mapa.temDados) {
    return (
      <Bloco icone={<Sparkles className="h-3.5 w-3.5" />} titulo="Como está evoluindo">
        <p className="text-sm text-[var(--color-text-dim)]">
          {primeiraPessoa
            ? "Ainda não há movimento suficiente no seu funil para uma leitura honesta. Registre seus atendimentos — todo o resto sai deles."
            : `Ainda não há movimento suficiente no funil de ${nome ?? "quem"} para uma leitura. Sem dado, prefiro não concluir nada.`}
        </p>
      </Bloco>
    );
  }

  const a = mapa.atual!;

  return (
    <div className="space-y-4">
      {/* ---------------- foco de hoje: a frase contextual ---------------- */}
      {primeiraPessoa && (
        <div className="lb-fade-up rounded-xl border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
            🔥 Foco de hoje
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{mapa.foco}</p>
        </div>
      )}

      {/* ------------------------- seu momento --------------------------- */}
      <Bloco icone={<Sparkles className="h-3.5 w-3.5" />} titulo={primeiraPessoa ? "Seu momento" : "Resumo para acompanhamento"}>
        <p className="text-sm leading-relaxed text-[var(--color-text)]">{mapa.momento}</p>
      </Bloco>

      {/* --------------------------- conquistas -------------------------- */}
      {mapa.conquistas.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {mapa.conquistas.map((c) => (
            <div
              key={c.titulo + c.detalhe}
              className="lb-fade-up rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-3"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-success)]">
                {c.emoji} {c.titulo}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">{c.detalhe}</p>
            </div>
          ))}
        </div>
      )}

      {/* -------------------- o que está indo bem ------------------------ */}
      {mapa.destaques.length > 0 && (
        <Bloco
          icone={<TrendingUp className="h-3.5 w-3.5" />}
          titulo={primeiraPessoa ? "🔥 Você está se destacando em" : "Pontos fortes"}
          cor="var(--color-success)"
        >
          <ul className="space-y-2">
            {mapa.destaques.map((d) => (
              <li key={d.chave} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]" />
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-[var(--color-text)]">{d.titulo}</span>
                  <span className="block text-xs text-[var(--color-text-dim)]">{d.detalhe}</span>
                </span>
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {/* ------------------------ ponto de atenção ----------------------- */}
      {mapa.gargalo && (
        <Bloco
          icone={<AlertTriangle className="h-3.5 w-3.5" />}
          titulo={primeiraPessoa ? "⚠️ Seu ponto de atenção" : "Principal ponto de desenvolvimento"}
          cor="var(--color-warn, #f59e0b)"
        >
          <p className="text-sm text-[var(--color-text)]">{mapa.gargalo.situacao}</p>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
            Foco
          </p>
          <p className="text-sm text-[var(--color-text-dim)]">{mapa.gargalo.foco}</p>
        </Bloco>
      )}

      {/* ------------------------- próximo passo ------------------------- */}
      {proximo && (
        <Bloco icone={<ArrowRight className="h-3.5 w-3.5" />} titulo={primeiraPessoa ? "Seu próximo passo" : "Próximo objetivo"}>
          <p className="text-sm font-bold uppercase tracking-wider text-[var(--color-brand)]">
            → {proximo.rotulo}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-dim)]">{proximo.resumo}</p>
          <p className="mt-2 text-[11px] text-[var(--color-muted)]">
            A evolução de cargo é uma decisão da administração — não há promoção automática por
            resultado.
          </p>
        </Bloco>
      )}

      {/* -------------------- linha do tempo resumida -------------------- */}
      <Bloco icone={<Target className="h-3.5 w-3.5" />} titulo="Como chegou até aqui">
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[420px] text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                <th className="pb-1 font-semibold">Mês</th>
                <th className="pb-1 text-right font-semibold">Oportun.</th>
                <th className="pb-1 text-right font-semibold">Agend.</th>
                <th className="pb-1 text-right font-semibold">Propostas</th>
                <th className="pb-1 text-right font-semibold">Fechados</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {mapa.historico.map((h, i) => {
                const ehAtual = i === mapa.historico.length - 1;
                return (
                  <tr
                    key={h.chave}
                    className={ehAtual ? "font-bold text-[var(--color-text)]" : "text-[var(--color-text-dim)]"}
                  >
                    <td className="py-1 capitalize">
                      {rotuloCiclo(h.chave)}
                      {ehAtual && <span className="ml-1 text-[10px] text-[var(--color-brand)]">agora</span>}
                    </td>
                    <td className="py-1 text-right">{h.ind.oportunidades}</td>
                    <td className="py-1 text-right">{h.ind.agendamentos}</td>
                    <td className="py-1 text-right">{h.ind.propostas}</td>
                    <td className="py-1 text-right">{h.ind.fechados}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          {quem} {primeiraPessoa ? "tem" : "tem"} {a.leadsAtivos} negócios ativos hoje, {a.leadsAtualizados}{" "}
          com movimento recente.
        </p>
      </Bloco>
    </div>
  );
}
