"use client";

import Link from "next/link";
import { ChevronRight, Hourglass, Trophy } from "lucide-react";
import {
  FRASE_PADRAO,
  diasRestantes,
  marcasTermometro,
  metaColetivaDe,
  metaUnica,
  periodoBR,
  totaisDaEquipe,
  type Desafio,
} from "@/lib/desafio";
import { objetivoDe } from "@/lib/desafio-impressao";
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
  useFichas,
  useHoje,
  usePermissoesDesafio,
} from "@/components/desafio/desafio-ui";

const MEDALHA = ["🥇", "🥈", "🥉"];

/** Painel geral de um desafio (ranking, totais, termômetro e contagem regressiva). */
export function PainelDesafio({ desafio }: { desafio: Desafio }) {
  const hoje = useHoje();
  const fichas = useFichas(desafio, hoje);
  const { admin } = usePermissoesDesafio();
  if (!hoje) return null;
  const meta = metaColetivaDe(desafio);
  const unica = metaUnica(desafio);
  const n = desafio.participantes.length;
  const equipe = totaisDaEquipe(fichas, meta);
  const contagem = diasRestantes(desafio, hoje);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <TopoDesafio
        titulo={desafio.titulo}
        subtitulo={`Resumo geral da equipe • Período: ${periodoBR(desafio)}`}
        objetivo={objetivoDe(desafio)}
      >
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm sm:px-6"
          style={{ background: "rgba(255,255,255,.04)", borderTop: "1px solid rgba(201,162,39,.25)" }}
        >
          <span className="inline-flex items-center gap-2 text-base font-black" style={{ color: GOLD }}>
            <Hourglass className="h-5 w-5" aria-hidden /> {contagem.texto}
          </span>
          <span className="text-white/75">{desafio.frase || FRASE_PADRAO}</span>
          {admin && (
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <BotaoImprimir onClick={() => imprimir(desafio, true, [], fichas)}>Imprimir painel</BotaoImprimir>
              <BotaoImprimir onClick={() => imprimir(desafio, false, fichas, fichas)}>
                Imprimir {n === 1 ? "a ficha" : `as ${n} fichas`}
              </BotaoImprimir>
            </div>
          )}
        </div>
      </TopoDesafio>

      {/* Totais da equipe */}
      <section className="rounded-2xl bg-white p-5 sm:p-6" style={{ color: NAVY }}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-black tracking-[0.12em]">TERMÔMETRO DA EQUIPE</h2>
          <p className="text-sm text-slate-600">Meta coletiva: {brl(meta)} • {n} vendedor{n === 1 ? "" : "es"}
            {unica ? ` • ${brl(unica)} cada` : ""}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Cartao tom="navy" grande rotulo="Total produzido pela equipe" valor={brl(equipe.total)} />
          <Cartao tom="creme" grande rotulo={`Falta para chegar a ${brl(meta)}`} valor={brl(equipe.falta)} />
          <Cartao tom="branco" grande rotulo="% da meta atingida" valor={pct(equipe.pct)} />
        </div>
        <div className="mt-5">
          <Termometro pctAtingido={equipe.pct} marcas={marcasTermometro(meta)} />
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
                <tr key={f.vendedorId} className={i % 2 ? "bg-white" : "bg-slate-50"}>
                  <td className="px-4 py-3 text-center text-lg font-black">{MEDALHA[f.posicao - 1] ?? `${f.posicao}º`}</td>
                  <td className="px-4 py-3" style={{ borderLeft: `5px solid ${GOLD}` }}>
                    <Link href={`/desafio/${desafio.id}/${f.vendedorId}`} className="text-lg font-black hover:underline">
                      {f.nome}
                    </Link>
                    <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, f.pct)}%`, background: GOLD }} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(f.meta)}</td>
                  <td className="px-4 py-3 text-right text-lg font-black tabular-nums">{brl(f.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(f.falta)}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{pct(f.pct)}</td>
                  <td className="px-4 py-3 text-center">
                    <SeloStatus status={f.status} />
                  </td>
                  <td className="pr-3">
                    <Link href={`/desafio/${desafio.id}/${f.vendedorId}`} aria-label={`Ficha de ${f.nome}`}>
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
                <td className="px-4 py-3 text-right tabular-nums">{brl(meta)}</td>
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
            <li key={f.vendedorId}>
              <Link
                href={`/desafio/${desafio.id}/${f.vendedorId}`}
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
              de {brl(meta)} · falta {brl(equipe.falta)} · {pct(equipe.pct)}
            </p>
          </li>
        </ul>
      </section>

      <p className="text-center text-xs text-[var(--color-text-dim)]">
        Produção calculada automaticamente pelas vendas lançadas no CRM de {periodoBR(desafio)} (data da venda), com as mesmas
        regras do Ranking: entram vendas Confirmadas e Pendentes; Canceladas não contam.
      </p>
    </div>
  );
}
