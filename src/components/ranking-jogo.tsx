"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUp, Crown, Minus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { nomePersonagem, Personagem, personagemPadrao } from "@/components/personagens-natal";
import {
  atualizarMemoria,
  conquistasDe,
  progressoJogador,
  tituloNeon,
  variacaoPosicao,
  XP_POR_NIVEL,
  type MemoriaPosicoes,
} from "@/lib/gamificacao-visual";
import type { Tema } from "@/lib/temas";
import type { TemaVisual } from "@/lib/tema-visual";
import type { VendedorComDesempenho } from "@/lib/types";
import { brl, cn, pct } from "@/lib/utils";

const CORES_CONFETE: Record<"neon" | "natal", string[]> = {
  neon: ["#ff2d9b", "#8b3dff", "#19c8ff", "#ffffff"],
  natal: ["#e2333f", "#1f9d55", "#f2c94c", "#ffffff"],
};

/** Referência de posição guardada neste aparelho (não vai para o banco). */
function usePosicoesBase(chave: string, ranking: VendedorComDesempenho[]) {
  const [base, setBase] = useState<Record<string, number>>({});
  const assinatura = ranking.map((d) => d.id).join("|");

  useEffect(() => {
    if (!assinatura) return;
    const atual = Object.fromEntries(assinatura.split("|").map((id, i) => [id, i + 1]));
    const k = `lb:ranking-posicoes:${chave}`;
    const d = new Date();
    const hoje = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    try {
      const salvo = localStorage.getItem(k);
      const mem = atualizarMemoria(salvo ? (JSON.parse(salvo) as MemoriaPosicoes) : null, hoje, atual);
      localStorage.setItem(k, JSON.stringify(mem));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBase(mem.base);
    } catch {
      setBase(atual);
    }
  }, [chave, assinatura]);

  return base;
}

function Variacao({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-[var(--color-success)]" title={`Subiu ${delta} desde ontem`}>
        <ArrowUp className="h-3.5 w-3.5" aria-hidden />{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-[var(--color-danger)]" title={`Caiu ${-delta} desde ontem`}>
        <ArrowDown className="h-3.5 w-3.5" aria-hidden />{-delta}
      </span>
    );
  }
  return <Minus className="h-3.5 w-3.5 text-[var(--color-muted)]" aria-label="Sem mudança de posição" />;
}

export function RankingJogo({
  ranking,
  tema,
  visual,
  chavePeriodo,
}: {
  ranking: VendedorComDesempenho[];
  tema: Tema;
  visual: Exclude<TemaVisual, "padrao">;
  chavePeriodo: string;
}) {
  const lista = useMemo(() => ranking.slice(0, 10), [ranking]);
  const base = usePosicoesBase(chavePeriodo, ranking);
  const apelidos = tema.estilo.apelidos ?? {};
  const natal = visual === "natal";

  const dados = (d: VendedorComDesempenho, i: number) => {
    const posicao = i + 1;
    const prog = progressoJogador(d);
    const conf = apelidos[d.id];
    const personagem = conf?.personagem ?? personagemPadrao(d.id);
    const apelido = conf?.apelido?.trim() || (natal ? nomePersonagem(personagem) : tituloNeon(prog.nivel));
    return { posicao, prog, personagem, apelido, conquistas: conquistasDe(d, posicao), delta: variacaoPosicao(base, d.id, posicao) };
  };

  const rosto = (d: VendedorComDesempenho, personagem: string, size: number) => (
    <span className="lbx-moldura">
      {natal ? (
        <>
          <Personagem tipo={personagem} size={size} />
          <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-[var(--color-surface)]">
            <Avatar id={d.id} nome={d.nome} size={Math.max(20, Math.round(size * 0.36))} />
          </span>
        </>
      ) : (
        <Avatar id={d.id} nome={d.nome} size={size} />
      )}
    </span>
  );

  if (lista.length === 0) {
    return <div className="lbx-card p-10 text-center text-[var(--color-text-dim)]">Sem consultores para ranquear ainda.</div>;
  }

  const campeao = lista[0];
  const c = dados(campeao, 0);

  return (
    <section className="space-y-3" aria-label="Ranking da equipe">
      <article className={cn("lbx-card lbx-campeao p-4 sm:p-6", c.delta > 0 && "lbx-sobe")}>
        {campeao.pctMeta >= 100 &&
          Array.from({ length: 16 }).map((_, i) => (
            <span
              key={i}
              className="lbx-confete"
              aria-hidden
              style={{
                left: `${(i * 6.2 + 3) % 100}%`,
                background: CORES_CONFETE[visual][i % 4],
                animationDelay: `${(i % 6) * 0.14}s`,
              }}
            />
          ))}
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div className="relative">
            <Crown className="absolute -top-5 left-1/2 z-10 h-7 w-7 -translate-x-1/2 text-[var(--lbx-c)]" fill="currentColor" aria-hidden />
            {rosto(campeao, c.personagem, 104)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--lbx-brand-texto)]">
              {natal ? "Campeão do Natal" : "Nº 1 da cidade"}
            </p>
            <h2 className="truncate text-2xl font-extrabold text-[var(--color-text)] sm:text-3xl">{campeao.nome}</h2>
            <p className="mt-0.5 flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--color-text-dim)] sm:justify-start">
              “{c.apelido}” <span className="lbx-nivel">NÍVEL {c.prog.nivel}</span> <Variacao delta={c.delta} />
            </p>
            <div className="mt-3 max-w-md">
              <div className="lbx-barra" role="progressbar" aria-label="XP no nível" aria-valuemin={0} aria-valuemax={XP_POR_NIVEL} aria-valuenow={c.prog.xpNoNivel}>
                <span style={{ width: `${c.prog.pctNivel}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-text-dim)] tabular-nums">
                {c.prog.xpNoNivel}/{XP_POR_NIVEL} XP · faltam {c.prog.faltam} para o nível {c.prog.nivel + 1}
              </p>
            </div>
            {c.conquistas.length > 0 && (
              <ul className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {c.conquistas.map((q) => (
                  <li key={q.chave} className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text)]">
                    <span aria-hidden>{q.icone}</span> {natal ? q.natal : q.neon}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-2xl font-extrabold text-[var(--color-success)] tabular-nums sm:text-3xl">{brl(campeao.vendido)}</p>
            <p className="text-xs text-[var(--color-text-dim)] tabular-nums">
              {campeao.vendas} vendas · {pct(campeao.pctMeta)} da meta
            </p>
            <p className="text-xs text-[var(--color-text-dim)] tabular-nums">Comissão {brl(campeao.comissao)}</p>
          </div>
        </div>
      </article>

      <ol className="space-y-2">
        {lista.slice(1).map((d, idx) => {
          const j = dados(d, idx + 1);
          return (
            <li
              key={d.id}
              className={cn("lbx-card grid grid-cols-[28px_auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-3 md:grid-cols-[32px_auto_minmax(150px,1fr)_minmax(150px,1fr)_auto]", j.delta > 0 && "lbx-sobe", j.delta < 0 && "lbx-desce")}
            >
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-lg font-black text-[var(--color-text)] tabular-nums">{j.posicao}</span>
                <Variacao delta={j.delta} />
              </div>
              {rosto(d, j.personagem, 46)}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--color-text)]">{d.nome}</p>
                <p className="truncate text-xs text-[var(--color-text-dim)]">“{j.apelido}”</p>
                {j.conquistas.length > 0 && (
                  <p className="mt-0.5 truncate text-xs" title={j.conquistas.map((q) => (natal ? q.natal : q.neon)).join(", ")}>
                    {j.conquistas.map((q) => <span key={q.chave} role="img" aria-label={natal ? q.natal : q.neon} className="mr-1">{q.icone}</span>)}
                  </p>
                )}
              </div>
              <div className="text-right md:order-last">
                <p className="text-sm font-bold text-[var(--color-success)] tabular-nums">{brl(d.vendido)}</p>
                <p className="text-[11px] text-[var(--color-text-dim)] tabular-nums">{d.vendas} vendas · {pct(d.pctMeta)}</p>
                <p className="text-[11px] text-[var(--color-text-dim)] tabular-nums">Comissão {brl(d.comissao)}</p>
              </div>
              <div className="col-span-full md:col-span-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="lbx-nivel">NÍVEL {j.prog.nivel}</span>
                  {j.prog.subindo ? (
                    <span className="lbx-subindo inline-flex items-center gap-0.5 text-[11px] font-bold text-[var(--lbx-brand-texto)]">
                      <ChevronsUp className="h-3.5 w-3.5" aria-hidden /> Subindo de nível
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--color-text-dim)] tabular-nums">{j.prog.xpNoNivel}/{XP_POR_NIVEL} XP</span>
                  )}
                </div>
                <div className="lbx-barra" role="progressbar" aria-label={`XP de ${d.nome}`} aria-valuemin={0} aria-valuemax={XP_POR_NIVEL} aria-valuenow={j.prog.xpNoNivel}>
                  <span style={{ width: `${j.prog.pctNivel}%` }} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-[var(--color-text-dim)]">
        XP é só visual: 10 por ponto percentual da meta e 25 por venda. A classificação continua sendo a do ranking oficial.
      </p>
    </section>
  );
}
