"use client";

import { useMemo, useState } from "react";
import { Check, Palette, Save } from "lucide-react";
import { temasApi, useReady, useTemaAtivo, useTemas, useVendedores } from "@/lib/store";
import { SLUG_NATAL, SLUG_NEON, SLUG_PADRAO, temaVisualDoSlug, type TemaVisual } from "@/lib/tema-visual";
import type { ApelidoTema } from "@/lib/temas";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/avatar";
import { nomePersonagem, Personagem, PERSONAGENS, personagemPadrao } from "@/components/personagens-natal";

const OPCOES: { id: TemaVisual; slug: string; nome: string; descricao: string; cores: string[] }[] = [
  { id: "padrao", slug: SLUG_PADRAO, nome: "Tema padrão LB CRM", descricao: "A identidade original do sistema.", cores: ["#0a0a0f", "#6366f1", "#e8e8f0"] },
  { id: "neon", slug: SLUG_NEON, nome: "Neon City Edition", descricao: "Cidade neon, competição e energia.", cores: ["#07040f", "#ff2d9b", "#8b3dff", "#19c8ff"] },
  { id: "natal", slug: SLUG_NATAL, nome: "Natal — Christmas Edition", descricao: "Celebração, neve e espírito de equipe.", cores: ["#07130e", "#b3202f", "#1f9d55", "#f2c94c"] },
];

export default function PersonalizacaoVisualPage() {
  const ready = useReady();
  const temas = useTemas();
  const ativo = useTemaAtivo();
  const vendedores = useVendedores();
  const visualAtivo = temaVisualDoSlug(ativo.slug);
  const [aplicando, setAplicando] = useState<TemaVisual | null>(null);
  const [abaApelidos, setAbaApelidos] = useState<"neon" | "natal">("natal");
  const [rascunhos, setRascunhos] = useState<Record<string, Record<string, ApelidoTema>>>({});
  const [salvando, setSalvando] = useState(false);

  const slugAba = abaApelidos === "natal" ? SLUG_NATAL : SLUG_NEON;
  const temaAba = temas.find((t) => t.slug === slugAba);
  const apelidos = rascunhos[slugAba] ?? temaAba?.estilo.apelidos ?? {};
  const ativos = useMemo(() => vendedores.filter((v) => v.ativo), [vendedores]);

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

  function editar(id: string, patch: ApelidoTema) {
    setRascunhos((r) => ({ ...r, [slugAba]: { ...apelidos, [id]: { ...apelidos[id], ...patch } } }));
  }

  async function salvarApelidos() {
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
            <p className="text-xs text-[var(--color-text-dim)]">Aparecem só no ranking do tema. O nome verdadeiro não muda.</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-[var(--color-surface-2)] p-1">
            {(["natal", "neon"] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={abaApelidos === a}
                onClick={() => setAbaApelidos(a)}
                className={cn("rounded-md px-3 py-1 text-sm font-medium", abaApelidos === a ? "bg-[var(--color-brand)] text-white" : "text-[var(--color-text-dim)]")}
              >
                {a === "natal" ? "Natal" : "Neon City"}
              </button>
            ))}
          </div>
        </div>

        <ul className="divide-y divide-[var(--color-border)]">
          {ativos.map((v) => {
            const conf = apelidos[v.id] ?? {};
            const personagem = conf.personagem ?? personagemPadrao(v.id);
            return (
              <li key={v.id} className="grid items-center gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {abaApelidos === "natal" ? <Personagem tipo={personagem} size={38} /> : <Avatar id={v.id} nome={v.nome} size={38} />}
                  <span className="truncate text-sm font-medium">{v.nome}</span>
                </div>
                <Input
                  aria-label={`Apelido de ${v.nome}`}
                  maxLength={32}
                  value={conf.apelido ?? ""}
                  placeholder={abaApelidos === "natal" ? nomePersonagem(personagem) : "Título automático pelo nível"}
                  onChange={(e) => editar(v.id, { apelido: e.target.value })}
                />
                {abaApelidos === "natal" ? (
                  <select
                    aria-label={`Personagem de ${v.nome}`}
                    value={personagem}
                    onChange={(e) => editar(v.id, { personagem: e.target.value })}
                    className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)]"
                  >
                    {PERSONAGENS.map((p) => <option key={p.tipo} value={p.tipo}>{p.nome}</option>)}
                  </select>
                ) : <span className="hidden sm:block" />}
              </li>
            );
          })}
          {ativos.length === 0 && <li className="py-6 text-center text-sm text-[var(--color-text-dim)]">Nenhum consultor ativo.</li>}
        </ul>

        <div className="mt-4 flex justify-end">
          <Button onClick={() => void salvarApelidos()} disabled={salvando || !rascunhos[slugAba]}>
            <Save className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar apelidos"}
          </Button>
        </div>
      </section>
    </div>
  );
}
