"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Hourglass, Trophy } from "lucide-react";
import { DESAFIO, diasRestantes, totaisDaEquipe } from "@/lib/desafio";
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

const MARCAS = ["R$ 0", "100 mil", "200 mil", "300 mil", "400 mil", "500 mil", "600 mil", "700 mil", "800 mil", "900 mil", "R$ 1 MI"];
const MEDALHA = ["🥇", "🥈", "🥉"];

export default function DesafioPage() {
  const { fichas, hoje, gestor } = useDesafio();
  if (!hoje) return null;
  const equipe = totaisDaEquipe(fichas);
  const contagem = diasRestantes(hoje);
  const problemas = fichas.filter((f) => f.problema);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <TopoDesafio titulo={DESAFIO.titulo} subtitulo="Resumo geral da equipe • Período: 26/11/2026 a 07/12/2026">
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm sm:px-6"
          style={{ background: "rgba(255,255,255,.04)", borderTop: "1px solid rgba(201,162,39,.25)" }}
        >
          <span className="inline-flex items-center gap-2 text-base font-black" style={{ color: GOLD }}>
            <Hourglass className="h-5 w-5" aria-hidden /> {contagem.texto}
          </span>
          <span className="text-white/75">Desafio · Responsabilidade · Competitividade · Espírito de equipe</span>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <BotaoImprimir onClick={() => imprimir(true, [], fichas)}>Imprimir painel</BotaoImprimir>
            <BotaoImprimir onClick={() => imprimir(false, fichas, fichas)}>Imprimir as 5 fichas</BotaoImprimir>
          </div>
        </div>
      </TopoDesafio>

      {gestor && problemas.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-amber-400/50 bg-amber-400/10 p-4 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
          <div>
            <p className="font-bold">Vínculo com o cadastro a conferir (só gestores veem este aviso):</p>
            <ul className="mt-1 list-disc pl-5">
              {problemas.map((f) => (
                <li key={f.slug}>
                  <b>{f.nome}</b>: {f.problema} A produção aparece zerada até isso ser resolvido.
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Totais da equipe */}
      <section className="rounded-2xl bg-white p-5 sm:p-6" style={{ color: NAVY }}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-black tracking-[0.12em]">TERMÔMETRO DA EQUIPE</h2>
          <p className="text-sm text-slate-600">Meta coletiva: R$ 1.000.000,00 • 5 vendedores • R$ 200.000,00 cada</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Cartao tom="navy" grande rotulo="Total produzido pela equipe" valor={brl(equipe.total)} />
          <Cartao tom="creme" grande rotulo="Falta para chegar a R$ 1 milhão" valor={brl(equipe.falta)} />
          <Cartao tom="branco" grande rotulo="% da meta atingida" valor={pct(equipe.pct)} />
        </div>
        <div className="mt-5">
          <Termometro pctAtingido={equipe.pct} marcas={MARCAS} />
        </div>
      </section>

      {/* Ranking / tabela */}
      <section className="overflow-hidden rounded-2xl bg-white" style={{ color: NAVY }}>
        <div className="flex items-center gap-2 px-5 pb-3 pt-5 sm:px-6">
          <Trophy className="h-5 w-5" style={{ color: GOLD }} aria-hidden />
          <h2 className="text-lg font-black tracking-[0.12em]">RANKING DO DESAFIO</h2>
        </div>

        {/* Computador */}
        <div className="hidden md:block">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] font-extrabold uppercase tracking-[0.15em]" style={{ background: NAVY, color: GOLD }}>
                <th className="px-4 py-3 text-center">Pos.</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3 text-right">Meta individual</th>
                <th className="px-4 py-3 text-right">Produção realizada</th>
                <th className="px-4 py-3 text-right">Quanto falta</th>
                <th className="px-4 py-3 text-right">% da meta</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {fichas.map((f, i) => (
                <tr key={f.slug} className={i % 2 ? "bg-white" : "bg-slate-50"}>
                  <td className="px-4 py-3 text-center text-lg font-black">{MEDALHA[f.posicao - 1] ?? `${f.posicao}º`}</td>
                  <td className="px-4 py-3" style={{ borderLeft: `5px solid ${GOLD}` }}>
                    <Link href={`/desafio/${f.slug}`} className="text-lg font-black hover:underline">
                      {f.nome}
                    </Link>
                    <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, f.pct)}%`, background: GOLD }} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(DESAFIO.metaIndividual)}</td>
                  <td className="px-4 py-3 text-right text-lg font-black tabular-nums">{brl(f.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(f.falta)}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{pct(f.pct)}</td>
                  <td className="px-4 py-3 text-center">
                    <SeloStatus status={f.status} />
                  </td>
                  <td className="pr-3">
                    <Link href={`/desafio/${f.slug}`} aria-label={`Ficha de ${f.nome}`}>
                      <ChevronRight className="h-5 w-5 text-slate-400" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-black text-white" style={{ background: NAVY }}>
                <td />
                <td className="px-4 py-3" style={{ color: GOLD }}>
                  TOTAL DA EQUIPE
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{brl(DESAFIO.metaColetiva)}</td>
                <td className="px-4 py-3 text-right text-lg tabular-nums">{brl(equipe.total)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{brl(equipe.falta)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{pct(equipe.pct)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Celular */}
        <ul className="space-y-3 px-4 pb-4 md:hidden">
          {fichas.map((f) => (
            <li key={f.slug}>
              <Link
                href={`/desafio/${f.slug}`}
                className="block rounded-xl bg-slate-50 p-4"
                style={{ borderLeft: `5px solid ${GOLD}` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-black">
                    {MEDALHA[f.posicao - 1] ?? `${f.posicao}º`} {f.nome}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                </div>
                <p className="mt-1 text-2xl font-black tabular-nums">{brl(f.total)}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, f.pct)}%`, background: GOLD }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    Falta <b className="tabular-nums">{brl(f.falta)}</b> · <b>{pct(f.pct)}</b>
                  </span>
                  <SeloStatus status={f.status} />
                </div>
              </Link>
            </li>
          ))}
          <li className="rounded-xl p-4 text-white" style={{ background: NAVY }}>
            <p className="text-xs font-extrabold tracking-[0.15em]" style={{ color: GOLD }}>
              TOTAL DA EQUIPE
            </p>
            <p className="text-2xl font-black tabular-nums">{brl(equipe.total)}</p>
            <p className="text-sm text-white/80">
              de {brl(DESAFIO.metaColetiva)} · falta {brl(equipe.falta)} · {pct(equipe.pct)}
            </p>
          </li>
        </ul>
      </section>

      <p className="text-center text-xs text-[var(--color-text-dim)]">
        Produção calculada automaticamente pelas vendas lançadas no CRM de 26/11 a 07/12 (data da venda), com as mesmas
        regras do Ranking: entram vendas Confirmadas e Pendentes; Canceladas não contam.
      </p>
    </div>
  );
}
