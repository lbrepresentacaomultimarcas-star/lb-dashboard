"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Crown, Trophy } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CenarioNatal, CenarioNeon, PapaiNoelGrande, PersonagemNeon } from "@/components/ranking-cenarios";
import { iconeApelido } from "@/lib/apelidos-tema";
import {
  atualizarMemoria,
  reconhecimentosDe,
  variacaoPosicao,
  type LinhaReconhecimento,
  type MemoriaPosicoes,
} from "@/lib/gamificacao-visual";
import type { ApelidoTema, Tema } from "@/lib/temas";
import type { TemaVisual } from "@/lib/tema-visual";
import type { VendedorComDesempenho } from "@/lib/types";
import { brl, cn, pct } from "@/lib/utils";

type Visual = Exclude<TemaVisual, "padrao">;

const CORES: Record<Visual, string[]> = {
  natal: ["#ffc933", "#3f9bff", "#ff3b5c"],
  neon: ["#ffc933", "#29d3ff", "#ff2fd0"],
};

/**
 * Referência de "subiu/desceu". Espera os dados oficiais assentarem (a primeira
 * pintura pode vir do cálculo local) e só considera quem já vendeu no período:
 * empate em zero não é mudança de posição.
 */
function usePosicoesBase(chave: string, ranking: VendedorComDesempenho[]) {
  const [base, setBase] = useState<Record<string, number>>({});
  const assinatura = ranking.filter((d) => d.vendido > 0).map((d) => d.id).join("|");

  useEffect(() => {
    if (!assinatura) return;
    const t = setTimeout(() => {
      const atual = Object.fromEntries(assinatura.split("|").map((id, i) => [id, i + 1]));
      const k = `lb:ranking-posicoes:v2:${chave}`;
      const d = new Date();
      const hoje = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      try {
        const salvo = localStorage.getItem(k);
        const mem = atualizarMemoria(salvo ? (JSON.parse(salvo) as MemoriaPosicoes) : null, hoje, atual);
        localStorage.setItem(k, JSON.stringify(mem));
        setBase(mem.base);
      } catch {
        setBase(atual);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [chave, assinatura]);

  return base;
}

function Gorro({ c }: { c?: ApelidoTema["chapeu"] }) {
  const estilo: CSSProperties = {
    left: `${50 + (c?.x ?? 0)}%`,
    top: `${-24 + (c?.y ?? 0)}%`,
    transform: `translateX(-50%) rotate(${c?.r ?? -10}deg) scale(${c?.s ?? 1})`,
  };
  return (
    <svg className="lbr-gorro" style={estilo} viewBox="0 0 120 88" aria-hidden>
      <path d="M16 62C20 24 52 4 82 10c16 4 26 16 30 34l-13 3c-4-9-10-15-18-17L100 66Z" fill="#d3142c" />
      <path d="M52 16c-16 10-26 26-28 46h16c2-18 6-32 12-46Z" fill="#a50f22" />
      <circle cx="108" cy="52" r="10" fill="#fff" />
      <rect x="6" y="56" width="100" height="22" rx="11" fill="#fff" />
      <rect x="10" y="70" width="92" height="6" rx="3" fill="#dfe7ee" />
    </svg>
  );
}

export function Foto({
  d,
  size,
  natal,
  conf,
  cor,
}: {
  d: VendedorComDesempenho;
  size: number;
  natal: boolean;
  conf?: ApelidoTema;
  cor: string;
}) {
  return (
    <span className="lbr-foto" style={{ width: size, height: size, ["--c" as string]: cor }}>
      <span className="lbr-foto-recorte">
        <Avatar id={d.id} nome={d.nome} size={size} className="h-full w-full" />
      </span>
      {natal && <Gorro c={conf?.chapeu} />}
    </span>
  );
}

function Variacao({ delta }: { delta: number }) {
  if (delta > 0) {
    return <span className="lbr-delta text-[#5ee592]" title={`Subiu ${delta}`}><ArrowUp className="h-3 w-3" aria-hidden />{delta}</span>;
  }
  if (delta < 0) {
    return <span className="lbr-delta text-[#ff8678]" title={`Caiu ${-delta}`}><ArrowDown className="h-3 w-3" aria-hidden />{-delta}</span>;
  }
  return null;
}

function Linha({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${data.length > 1 ? (i / (data.length - 1)) * 300 : 0},${58 - (v / max) * 48}`);
  return (
    <svg viewBox="0 0 300 64" preserveAspectRatio="none" className="h-14 w-full" role="img" aria-label="Evolução do faturamento nos últimos meses">
      <polyline points={pts.join(" ")} fill="none" stroke="var(--lbr-a)" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="lbr-linha" />
    </svg>
  );
}

export function RankingJogo({
  ranking,
  tema,
  visual,
  chavePeriodo,
  periodoLabel,
  filtro,
  campanha,
  total,
  crescimento,
  metaGlobal,
  pctGlobal,
  serie,
  perf,
}: {
  ranking: VendedorComDesempenho[];
  tema: Tema;
  visual: Visual;
  chavePeriodo: string;
  periodoLabel: string;
  filtro: ReactNode;
  campanha?: ReactNode;
  total: number;
  crescimento: number;
  metaGlobal: number;
  pctGlobal: number;
  serie: number[];
  perf: LinhaReconhecimento[];
}) {
  const natal = visual === "natal";
  const base = usePosicoesBase(chavePeriodo, ranking);
  const apelidos = tema.estilo.apelidos ?? {};
  const top10 = useMemo(() => ranking.slice(0, 10), [ranking]);
  const reconhecimentos = useMemo(() => reconhecimentosDe(ranking, perf), [ranking, perf]);
  const cores = CORES[visual];

  const apelidoDe = (id: string) => apelidos[id]?.apelido?.trim() || "";
  const delta = (d: VendedorComDesempenho, pos: number) => (d.vendido > 0 ? variacaoPosicao(base, d.id, pos) : 0);

  const Plate = ({ d, campeao }: { d: VendedorComDesempenho; campeao?: boolean }) => {
    const a = apelidoDe(d.id);
    if (!a) return null;
    return (
      <p className={cn("lbr-apelido", campeao && "lbr-apelido-campeao")}>
        <span aria-hidden>{campeao ? "👑" : iconeApelido(visual, a)}</span> {a}
      </p>
    );
  };

  const ordem: (0 | 1 | 2)[] = [1, 0, 2];

  return (
    <div className={cn("lbr-palco", natal ? "lbr-natal" : "lbr-neon")}>
      {natal ? <CenarioNatal /> : <CenarioNeon />}

      <div className="lbr-conteudo">
        <header className="lbr-topo">
          <div className="flex min-w-0 items-center gap-3">
            <Trophy className="lbr-trofeu" aria-hidden />
            <div className="min-w-0">
              <h1 className="lbr-titulo">Ranking de Vendas</h1>
              <p className="lbr-sub">{natal ? periodoLabel : "Sonhe • Planeje • Conquiste"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="lbr-filtro">{filtro}</div>
            <div className="lbr-painel lbr-kpi">
              <span className={crescimento >= 0 ? "text-[#5ee592]" : "text-[#ff8678]"} aria-hidden>
                {crescimento >= 0 ? <ArrowUp className="h-7 w-7" /> : <ArrowDown className="h-7 w-7" />}
              </span>
              <div>
                <p className="text-xl font-black tabular-nums text-[#5ee592] sm:text-2xl">{brl(total)}</p>
                <p className="text-[11px] text-white/85 tabular-nums">Meta: {brl(metaGlobal)}</p>
              </div>
              <span className={cn("lbr-pill tabular-nums", crescimento >= 0 ? "text-[#5ee592]" : "text-[#ff8678]")}>
                {crescimento >= 0 ? "+" : "-"}{pct(Math.abs(crescimento))}
              </span>
            </div>
          </div>
        </header>

        <div className="lbr-centro">
          <div className="lbr-personagem">
            {natal ? (
              <>
                <PapaiNoelGrande className="h-full w-full" />
                <span className="lbr-placa">Bora bater a meta!</span>
              </>
            ) : (
              <PersonagemNeon tipo="ela" className="h-full w-full" />
            )}
          </div>

          <section className="lbr-podio" aria-label="Pódio">
            {top10.length === 0 && <p className="lbr-painel p-8 text-center text-white">Sem consultores para ranquear ainda.</p>}
            {top10.length > 0 && ordem.map((idx) => {
              const d = top10[idx];
              if (!d) return <div key={idx} className="lbr-coluna" />;
              const campeao = idx === 0;
              return (
                <article
                  key={d.id}
                  className={cn("lbr-coluna", campeao && "lbr-coluna-1")}
                  style={{ ["--c" as string]: cores[idx], animationDelay: `${idx * 0.12}s` }}
                >
                  <div className="lbr-card">
                    {campeao && <Crown className="lbr-coroa" fill="currentColor" aria-hidden />}
                    <span className="lbr-medalha" aria-label={`${idx + 1}º lugar`}>{idx + 1}º</span>
                    <Foto d={d} size={campeao ? 148 : 104} natal={natal} conf={apelidos[d.id]} cor={cores[idx]} />
                    <h2 className="lbr-nome">{d.nome}</h2>
                    <Plate d={d} campeao={campeao} />
                    <p className="lbr-valor tabular-nums">{brl(d.vendido)}</p>
                    <dl className="lbr-stats">
                      <div><dt>Vendas</dt><dd className="tabular-nums">{d.vendas}</dd></div>
                      <div><dt>% Meta</dt><dd className="tabular-nums">{pct(d.pctMeta)}</dd></div>
                      <div className="lbr-stat-comissao"><dt>Comissão</dt><dd className="tabular-nums">{brl(d.comissao)}</dd></div>
                    </dl>
                    <div className="lbr-barra" role="progressbar" aria-label={`Meta de ${d.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Math.round(d.pctMeta), 100)}>
                      <span style={{ width: `${Math.min(d.pctMeta, 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-white/80 tabular-nums">Meta: {brl(d.metaMensal)}</p>
                    <Variacao delta={delta(d, idx + 1)} />
                  </div>
                  <div className="lbr-pedestal" aria-hidden>
                    <span className="lbr-pedestal-topo" />
                    <span className="lbr-pedestal-corpo"><b>{idx + 1}</b></span>
                    <span className="lbr-pedestal-base" />
                    {natal && campeao && <span className="lbr-laco">🎀</span>}
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="lbr-painel lbr-top10" aria-label="Top 10 vendedores">
            <h2 className="lbr-painel-titulo"><Trophy className="h-5 w-5 text-[#ffc933]" aria-hidden /> Top 10 Vendedores</h2>
            <ol>
              {top10.map((d, i) => {
                const a = apelidoDe(d.id);
                return (
                  <li key={d.id}>
                    <span className="lbr-pos tabular-nums">{i + 1}.</span>
                    <Foto d={d} size={34} natal={natal} conf={apelidos[d.id]} cor={cores[Math.min(i, 2)]} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-white">{d.nome}</span>
                      {a && <span className="block truncate text-[10px] font-semibold text-[var(--lbr-b)]">{iconeApelido(visual, a)} {a}</span>}
                    </span>
                    <Variacao delta={delta(d, i + 1)} />
                    <span className="text-right">
                      <span className="block text-[12px] font-bold text-[#5ee592] tabular-nums">{brl(d.vendido)}</span>
                      <span className="block text-[10px] text-white/80 tabular-nums">{pct(d.pctMeta)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>

        {campanha}

        <div className="lbr-rodape">
          <section className="lbr-painel p-4">
            <h2 className="lbr-painel-titulo">📊 Desempenho Geral</h2>
            <Linha data={serie} />
            <dl className="lbr-resumo">
              <div><dt>Total de Vendas</dt><dd className="text-[#5ee592] tabular-nums">{brl(total)}</dd></div>
              <div><dt>Meta</dt><dd className="tabular-nums">{brl(metaGlobal)}</dd></div>
              <div><dt>Atingimento</dt><dd className="text-[#5ee592] tabular-nums">{pct(pctGlobal)}</dd></div>
            </dl>
          </section>
          <section className="lbr-painel p-4">
            <h2 className="lbr-painel-titulo">⭐ Conquistas e Reconhecimentos</h2>
            <ul className="lbr-reconhecimentos">
              {reconhecimentos.map((r) => (
                <li key={r.chave} className={cn(!r.vencedor && "lbr-disputa")}>
                  <span className="text-xl" aria-hidden>{r.icone}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold uppercase tracking-wide text-[var(--lbr-b)]">{r.titulo}</span>
                    <span className="block truncate text-[13px] font-bold text-white">{r.vencedor?.nome ?? "Em disputa"}</span>
                    <span className="block truncate text-[10px] text-white/80">
                      {r.vencedor ? [apelidoDe(r.vencedor.id), r.detalhe].filter(Boolean).join(" · ") : r.criterio}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {!natal && <PersonagemNeon tipo="ele" className="lbr-personagem-direita" />}
      {!natal && <p className="lbr-assinatura">Faça história com a <b>LB!</b></p>}
    </div>
  );
}
