"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { DESAFIO, DIAS_DESAFIO, META_DIARIA, rotuloDia } from "@/lib/desafio";
import {
  BotaoImprimir,
  Cartao,
  GOLD,
  NAVY,
  SeloStatus,
  Termometro,
  TopoDesafio,
  brl,
  imprimir,
  pct,
  useDesafio,
} from "@/components/desafio/desafio-ui";

export default function FichaDesafioPage() {
  const { vendedor } = useParams<{ vendedor: string }>();
  const { fichas, hoje } = useDesafio();
  if (!hoje) return null;

  // navegação na ordem oficial dos nomes, não do ranking (não "pula" ao mudar a posição)
  const ordemOficial = DESAFIO.participantes.map((n) => fichas.find((f) => f.nome === n)!).filter(Boolean);
  const idx = ordemOficial.findIndex((f) => f.slug === vendedor);
  const f = ordemOficial[idx];

  if (!f) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
        <p className="text-lg font-bold">Vendedor não encontrado no desafio.</p>
        <Link href="/desafio" className="font-bold underline" style={{ color: GOLD }}>
          Voltar ao painel do desafio
        </Link>
      </div>
    );
  }
  const anterior = ordemOficial[(idx - 1 + ordemOficial.length) % ordemOficial.length];
  const proximo = ordemOficial[(idx + 1) % ordemOficial.length];

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/desafio" className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: GOLD }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Painel da equipe
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <Link
            href={`/desafio/${anterior.slug}`}
            className="inline-flex items-center rounded-lg px-2 py-1.5 text-[var(--color-text-dim)] hover:bg-white/5"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> {anterior.nome}
          </Link>
          <Link
            href={`/desafio/${proximo.slug}`}
            className="inline-flex items-center rounded-lg px-2 py-1.5 text-[var(--color-text-dim)] hover:bg-white/5"
          >
            {proximo.nome} <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      <TopoDesafio titulo={f.nome.toUpperCase()} subtitulo={`Controle individual • ${DESAFIO.titulo}`}>
        <div
          className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6"
          style={{ background: "rgba(255,255,255,.04)", borderTop: "1px solid rgba(201,162,39,.25)" }}
        >
          <span className="text-base font-black" style={{ color: GOLD }}>
            {f.posicao}º lugar no desafio
          </span>
          <SeloStatus status={f.status} />
          <div className="sm:ml-auto">
            <BotaoImprimir onClick={() => imprimir(false, [f], fichas)}>Imprimir ficha</BotaoImprimir>
          </div>
        </div>
      </TopoDesafio>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao tom="navy" rotulo="Meta individual" valor={brl(DESAFIO.metaIndividual)} />
        <Cartao rotulo="Período" valor="26/11 a 07/12/2026" />
        <Cartao rotulo="Meta diária de referência" valor={brl(META_DIARIA)} />
        <Cartao rotulo="Dias do desafio" valor={`${DIAS_DESAFIO.length} dias`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <section className="overflow-hidden rounded-2xl bg-white" style={{ color: NAVY }}>
          <table className="w-full text-left text-[13px] sm:text-base">
            <thead>
              <tr className="text-[10px] font-extrabold uppercase sm:text-[11px] sm:tracking-[0.12em]" style={{ background: NAVY, color: GOLD }}>
                <th className="px-2 py-3 sm:px-3">Data</th>
                <th className="hidden px-2 py-3 sm:px-3 sm:table-cell">Meta diária</th>
                <th className="px-2 py-3 sm:px-3 text-right">Vendido<span className="hidden sm:inline"> no dia</span></th>
                <th className="px-2 py-3 sm:px-3 text-right">Acumulado</th>
                <th className="hidden px-2 py-3 sm:px-3 text-right md:table-cell">Quanto falta</th>
                <th className="px-2 py-3 sm:px-3 text-center"><span className="sm:hidden">Res.</span><span className="hidden sm:inline">Resultado</span></th>
              </tr>
            </thead>
            <tbody>
              {f.dias.map((d, i) => {
                const r = rotuloDia(d.chave);
                const eHoje = d.chave === hoje;
                return (
                  <tr
                    key={d.chave}
                    className={i % 2 ? "bg-white" : "bg-slate-50"}
                    style={eHoje ? { boxShadow: `inset 4px 0 0 ${GOLD}`, background: "#FBF5E2" } : undefined}
                  >
                    <td className="px-2 py-2.5 sm:px-3">
                      <span className="block text-base font-black sm:inline">{r.data}</span>{" "}
                      <span className="text-xs text-slate-600 sm:text-sm">{r.semana}</span>
                      {eHoje && (
                        <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-black text-white" style={{ background: NAVY }}>
                          HOJE
                        </span>
                      )}
                    </td>
                    <td className="hidden px-2 py-2.5 sm:px-3 tabular-nums text-slate-600 sm:table-cell">{brl(META_DIARIA)}</td>
                    <td className="px-2 py-2.5 sm:px-3 text-right font-bold tabular-nums">{d.valor ? brl(d.valor) : "—"}</td>
                    <td className="px-2 py-2.5 sm:px-3 text-right tabular-nums">{d.futuro ? "—" : brl(d.acumulado)}</td>
                    <td className="hidden px-2 py-2.5 sm:px-3 text-right tabular-nums md:table-cell">{d.futuro ? "—" : brl(d.falta)}</td>
                    <td className="px-2 py-2.5 sm:px-3 text-center">
                      {d.resultado === "vendeu" ? (
                        <span className="text-xl font-black text-green-600" title="Vendeu no dia" aria-label="Vendeu no dia">
                          ✓
                        </span>
                      ) : d.resultado === "nao_vendeu" ? (
                        <span className="text-xl font-black text-red-600" title="Não vendeu no dia" aria-label="Não vendeu no dia">
                          X
                        </span>
                      ) : (
                        <span className="sr-only">Dia em aberto</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-black text-white" style={{ background: NAVY }}>
                <td className="px-2 py-3 sm:px-3" style={{ color: GOLD }}>
                  TOTAL
                </td>
                <td className="hidden px-2 py-3 sm:px-3 tabular-nums sm:table-cell">{brl(DESAFIO.metaIndividual)}</td>
                <td className="px-2 py-3 sm:px-3 text-right tabular-nums">{brl(f.total)}</td>
                <td className="px-2 py-3 sm:px-3" />
                <td className="hidden px-2 py-3 sm:px-3 text-right tabular-nums md:table-cell">{brl(f.falta)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </section>

        <aside className="space-y-3">
          <Cartao tom="navy" grande rotulo="Total vendido" valor={brl(f.total)} />
          <Cartao tom="creme" grande rotulo="Falta para a meta" valor={brl(f.falta)} />
          <Cartao tom="branco" grande rotulo="% da meta" valor={pct(f.pct)} />
          <div className="rounded-xl bg-white p-4" style={{ color: NAVY }}>
            <Termometro pctAtingido={f.pct} />
            <p className="mt-3 text-xs font-extrabold tracking-[0.15em]">REGRA DE MARCAÇÃO</p>
            <p className="mt-1 text-sm">
              <b className="text-green-600">✓</b> Vendeu no dia
            </p>
            <p className="text-sm">
              <b className="text-red-600">X</b> Não vendeu no dia
            </p>
            <p className="text-sm text-slate-500">Em branco: hoje ainda sem venda ou dia futuro</p>
          </div>
        </aside>
      </div>

      {f.problema && (
        <p className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-sm text-amber-100">
          Vínculo com o cadastro a conferir: {f.problema}
        </p>
      )}
    </div>
  );
}
