"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Palette, Save } from "lucide-react";
import { temasApi, useMetas, useReady, useTemaAtivo, useTemas, useVendas, useVendedores } from "@/lib/store";
import { SLUG_NATAL, SLUG_NEON, SLUG_PADRAO, temaVisualDoSlug, type TemaVisual } from "@/lib/tema-visual";
import { APELIDOS, sugerirApelidos } from "@/lib/apelidos-tema";
import type { ApelidoTema } from "@/lib/temas";
import { periodFromPreset } from "@/lib/period";
import { useCicloProducao } from "@/lib/use-ciclo";
import { useRankingPeriodo } from "@/lib/use-ranking";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Foto } from "@/components/ranking-jogo";
import type { VendedorComDesempenho } from "@/lib/types";

const OPCOES: { id: TemaVisual; slug: string; nome: string; descricao: string; cores: string[] }[] = [
  { id: "padrao", slug: SLUG_PADRAO, nome: "Tema padrão LB CRM", descricao: "A identidade original do sistema.", cores: ["#0a0a0f", "#6366f1", "#e8e8f0"] },
  { id: "neon", slug: SLUG_NEON, nome: "Neon City Edition", descricao: "Cidade neon, competição e energia.", cores: ["#07040f", "#ff2d9b", "#8b3dff", "#19c8ff"] },
  { id: "natal", slug: SLUG_NATAL, nome: "Natal — Christmas Edition", descricao: "Celebração, neve e espírito de equipe.", cores: ["#07130e", "#b3202f", "#1f9d55", "#f2c94c"] },
];

const AJUSTES = [
  { k: "x", rotulo: "Lado", min: -45, max: 45, passo: 1, padrao: 0 },
  { k: "y", rotulo: "Altura", min: -40, max: 70, passo: 1, padrao: 0 },
  { k: "r", rotulo: "Giro", min: -40, max: 40, passo: 1, padrao: -10 },
  { k: "s", rotulo: "Tamanho", min: 0.4, max: 1.6, passo: 0.05, padrao: 1 },
] as const;

export default function PersonalizacaoVisualPage() {
  const ready = useReady();
  const temas = useTemas();
  const ativo = useTemaAtivo();
  const vendedores = useVendedores();
  const vendas = useVendas();
  const metas = useMetas();
  const { config, feriados } = useCicloProducao();
  const periodo = useMemo(() => periodFromPreset("mes-atual", new Date(), config, feriados), [config, feriados]);
  const desempenho = useRankingPeriodo(periodo, vendedores, vendas, metas, config, feriados);

  const visualAtivo = temaVisualDoSlug(ativo.slug);
  const [aplicando, setAplicando] = useState<TemaVisual | null>(null);
  const [aba, setAba] = useState<"neon" | "natal">(visualAtivo === "neon" ? "neon" : "natal");
  const [rascunhos, setRascunhos] = useState<Record<string, Record<string, ApelidoTema>>>({});
  const [salvando, setSalvando] = useState(false);

  const slugAba = aba === "natal" ? SLUG_NATAL : SLUG_NEON;
  const temaAba = temas.find((t) => t.slug === slugAba);
  const apelidos = rascunhos[slugAba] ?? temaAba?.estilo.apelidos ?? {};
  const ativos = useMemo(() => vendedores.filter((v) => v.ativo), [vendedores]);
  const porId = useMemo(() => new Map(desempenho.map((d) => [d.id, d])), [desempenho]);

  async function escolher(op: (typeof OPCOES)[number]) {
    if (op.id === visualAtivo && ativo.slug === op.slug) return;
    setAplicando(op.id);
    try {
      await temasApi.ativarPorSlug(op.slug);
      notify.success(`${op.nome} aplicado para todos os usuários`);
    } catch (e) {
      notify.error("Não foi possível trocar o tema", e instanceof Error ? e.message : undefined);
    } finally {
      setAplicando(null);
    }
  }

  const editar = useCallback(
    (id: string, patch: ApelidoTema) => {
      setRascunhos((r) => {
        const atual = r[slugAba] ?? temaAba?.estilo.apelidos ?? {};
        return { ...r, [slugAba]: { ...atual, [id]: { ...atual[id], ...patch } } };
      });
    },
    [slugAba, temaAba],
  );

  async function salvar() {
    setSalvando(true);
    try {
      const t = await temasApi.garantir(slugAba);
      await temasApi.update(t.id, { estilo: { ...t.estilo, apelidos } });
      setRascunhos((r) => {
        const resto = { ...r };
        delete resto[slugAba];
        return resto;
      });
      notify.success("Apelidos salvos");
    } catch (e) {
      notify.error("Não foi possível salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center gap-3">
        <Palette className="h-7 w-7 text-[var(--color-brand)]" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold">Personalização Visual</h1>
          <p className="text-sm text-[var(--color-text-dim)]">O tema escolhido vale para todos os usuários. Nenhum dado ou regra comercial é alterado.</p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Tema global">
        {OPCOES.map((op) => {
          const selecionado = visualAtivo === op.id;
          return (
            <button
              key={op.id}
              type="button"
              role="radio"
              aria-checked={selecionado}
              disabled={!ready || aplicando !== null}
              onClick={() => void escolher(op)}
              className={cn(
                "rounded-xl border bg-[var(--color-surface)] p-4 text-left transition-colors disabled:cursor-wait",
                selecionado ? "border-[var(--color-brand)] ring-2 ring-[var(--color-brand)]/40" : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]",
              )}
            >
              <div className="mb-3 flex h-16 overflow-hidden rounded-lg" aria-hidden>
                {op.cores.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
              </div>
              <span className="flex items-center justify-between gap-2 font-semibold">
                {op.nome}
                {selecionado && <Check className="h-4 w-4 shrink-0 text-[var(--color-success)]" aria-hidden />}
              </span>
              <span className="mt-1 block text-xs text-[var(--color-text-dim)]">
                {aplicando === op.id ? "Aplicando…" : selecionado ? "Ativo agora" : op.descricao}
              </span>
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Apelidos dos consultores</h2>
            <p className="text-xs text-[var(--color-text-dim)]">
              Nada aparece no ranking sem aprovação. Marque as opções que o consultor pode escolher em Meu Perfil. O nome verdadeiro não muda.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-[var(--color-surface-2)] p-1">
            {(["natal", "neon"] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={aba === a}
                onClick={() => setAba(a)}
                className={cn("rounded-md px-3 py-1 text-sm font-medium", aba === a ? "bg-[var(--color-brand)] text-white" : "text-[var(--color-text-dim)]")}
              >
                {a === "natal" ? "Natal" : "Neon City"}
              </button>
            ))}
          </div>
        </div>

        <datalist id="lista-apelidos">
          {APELIDOS[aba].map((a) => <option key={a.nome} value={a.nome} />)}
        </datalist>

        <ul className="space-y-3">
          {ativos.map((v) => {
            const conf = apelidos[v.id] ?? {};
            const d = porId.get(v.id);
            const sugestoes = sugerirApelidos(aba, { pctMeta: d?.pctMeta, vendas: d?.vendas, preferencia: conf.preferencia });
            const opcoes = conf.opcoes ?? [];
            const alternar = (nome: string) =>
              editar(v.id, { opcoes: opcoes.includes(nome) ? opcoes.filter((o) => o !== nome) : [...opcoes, nome] });
            const fotoDados = { id: v.id, nome: v.nome } as VendedorComDesempenho;
            return (
              <li key={v.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                <div className="grid gap-3 md:grid-cols-[110px_minmax(0,1fr)]">
                  <div className="flex justify-center pt-5">
                    <Foto d={fotoDados} size={84} natal={aba === "natal"} conf={conf} cor="#ffc933" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{v.nome}</span>
                      {conf.preferencia && <span className="text-xs text-[var(--color-text-dim)]">Preferência: “{conf.preferencia}”</span>}
                    </div>
                    <Input
                      aria-label={`Apelido aprovado de ${v.nome}`}
                      list="lista-apelidos"
                      maxLength={32}
                      value={conf.apelido ?? ""}
                      placeholder="Sem apelido aprovado"
                      onChange={(e) => editar(v.id, { apelido: e.target.value })}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-[var(--color-text-dim)]">Sugestões:</span>
                      {sugestoes.map((s) => (
                        <button key={s} type="button" onClick={() => editar(v.id, { apelido: s })} className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs hover:bg-[var(--color-surface)]">
                          {s}
                        </button>
                      ))}
                    </div>
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-[var(--color-text-dim)]">
                        Opções autorizadas ({opcoes.length}){aba === "natal" ? " e ajuste do gorro" : ""}
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {APELIDOS[aba].map((a) => (
                          <button
                            key={a.nome}
                            type="button"
                            aria-pressed={opcoes.includes(a.nome)}
                            onClick={() => alternar(a.nome)}
                            className={cn("rounded-full border px-2 py-0.5 text-xs", opcoes.includes(a.nome) ? "border-[var(--color-success)] text-[var(--color-success)]" : "border-[var(--color-border)] text-[var(--color-text-dim)]")}
                          >
                            {opcoes.includes(a.nome) ? "✓ " : ""}{a.nome}
                          </button>
                        ))}
                      </div>
                      {aba === "natal" && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {AJUSTES.map((a) => (
                            <label key={a.k} className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
                              <span className="w-14">{a.rotulo}</span>
                              <input
                                type="range"
                                className="min-w-0 flex-1"
                                min={a.min}
                                max={a.max}
                                step={a.passo}
                                value={conf.chapeu?.[a.k] ?? a.padrao}
                                onChange={(e) => editar(v.id, { chapeu: { ...conf.chapeu, [a.k]: Number(e.target.value) } })}
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </details>
                  </div>
                </div>
              </li>
            );
          })}
          {ativos.length === 0 && <li className="py-6 text-center text-sm text-[var(--color-text-dim)]">Nenhum consultor ativo.</li>}
        </ul>

        <div className="mt-4 flex justify-end">
          <Button onClick={() => void salvar()} disabled={salvando || !rascunhos[slugAba]}>
            <Save className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar apelidos"}
          </Button>
        </div>
      </section>
    </div>
  );
}
