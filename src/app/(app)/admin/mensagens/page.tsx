"use client";

import { useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  MessageSquareText,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  CATEGORIA_MENSAGEM_INFO,
  CATEGORIA_ORDEM,
  VARIAVEIS_MENSAGEM,
  type CategoriaMensagem,
  type MensagemPronta,
} from "@/lib/types";
import { mensagensProntasApi, useMensagensProntas } from "@/lib/store";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PremiumStage } from "@/components/premium-stage";

/**
 * Administrativo → Mensagens Prontas (etapa "Não responde").
 *
 * O admin monta a biblioteca de argumentos que o consultor usa no Pipeline.
 * Tudo é dado — criar, editar, ativar/desativar e reordenar NÃO exige deploy.
 */

type FormT = {
  titulo: string;
  categoria: CategoriaMensagem;
  texto: string;
  ordem: number;
  ativo: boolean;
};

const vazio: FormT = {
  titulo: "",
  categoria: "chamar_atencao",
  texto: "",
  ordem: 1,
  ativo: true,
};

export default function MensagensProntasPage() {
  const biblioteca = useMensagensProntas();
  const [editando, setEditando] = useState<MensagemPronta | null>(null);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState<FormT>(vazio);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState<CategoriaMensagem | "todas">("todas");

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, MensagemPronta[]>();
    for (const m of biblioteca) {
      const lista = mapa.get(m.categoria) ?? [];
      lista.push(m);
      mapa.set(m.categoria, lista);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo));
    }
    return mapa;
  }, [biblioteca]);

  const categoriasVisiveis = useMemo(() => {
    const todas = [
      ...CATEGORIA_ORDEM,
      ...[...porCategoria.keys()].filter(
        (c) => !CATEGORIA_ORDEM.includes(c as CategoriaMensagem),
      ),
    ] as CategoriaMensagem[];
    return filtro === "todas" ? todas : todas.filter((c) => c === filtro);
  }, [porCategoria, filtro]);

  function abrirNova(categoria?: CategoriaMensagem) {
    const cat = categoria ?? "chamar_atencao";
    const existentes = porCategoria.get(cat) ?? [];
    setForm({ ...vazio, categoria: cat, ordem: existentes.length + 1 });
    setEditando(null);
    setCriando(true);
  }

  function abrirEdicao(m: MensagemPronta) {
    setForm({
      titulo: m.titulo,
      categoria: m.categoria as CategoriaMensagem,
      texto: m.texto,
      ordem: m.ordem,
      ativo: m.ativo,
    });
    setEditando(m);
    setCriando(false);
  }

  function fechar() {
    setCriando(false);
    setEditando(null);
    setForm(vazio);
  }

  async function salvar() {
    if (!form.titulo.trim()) {
      notify.error("Dê um título para a mensagem");
      return;
    }
    if (!form.texto.trim()) {
      notify.error("Escreva o texto da mensagem");
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        await mensagensProntasApi.update(editando.id, {
          titulo: form.titulo.trim(),
          categoria: form.categoria,
          texto: form.texto.trim(),
          ordem: form.ordem,
          ativo: form.ativo,
        });
        notify.success("Mensagem atualizada");
      } else {
        await mensagensProntasApi.add({
          titulo: form.titulo.trim(),
          categoria: form.categoria,
          texto: form.texto.trim(),
          ordem: form.ordem,
          ativo: form.ativo,
        });
        notify.success("Mensagem criada");
      }
      fechar();
    } catch (e) {
      notify.error("Não consegui salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(m: MensagemPronta) {
    try {
      await mensagensProntasApi.update(m.id, { ativo: !m.ativo });
      notify.success(m.ativo ? "Mensagem desativada" : "Mensagem ativada");
    } catch (e) {
      notify.error("Não consegui alterar", e instanceof Error ? e.message : undefined);
    }
  }

  async function excluir(m: MensagemPronta) {
    if (!confirm(`Excluir a mensagem "${m.titulo}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await mensagensProntasApi.remove(m.id);
      notify.success("Mensagem excluída");
    } catch (e) {
      notify.error("Não consegui excluir", e instanceof Error ? e.message : undefined);
    }
  }

  const abertoForm = criando || editando !== null;
  const ativas = biblioteca.filter((m) => m.ativo).length;

  return (
    <PremiumStage>
      <div className="relative space-y-5">
        {/* cabeçalho */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-brand)]/15 text-[var(--color-brand)]">
              <MessageSquareText className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Mensagens Prontas</h1>
              <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">
                Biblioteca de argumentos da etapa <strong>Não Responde</strong> ·{" "}
                {biblioteca.length} cadastrada{biblioteca.length === 1 ? "" : "s"}, {ativas} ativa
                {ativas === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <Button onClick={() => abrirNova()}>
            <Plus className="h-4 w-4" /> Nova mensagem
          </Button>
        </div>

        {/* variáveis disponíveis */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            Variáveis — o sistema troca sozinho na hora do envio
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {VARIAVEIS_MENSAGEM.map((v) => (
              <span
                key={v.chave}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px]"
              >
                <code className="font-mono font-semibold text-[var(--color-brand)]">{v.chave}</code>
                <span className="text-[var(--color-text-dim)]">{v.descricao}</span>
              </span>
            ))}
          </div>
        </div>

        {/* filtro por categoria */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFiltro("todas")}
            className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={{
              borderColor: filtro === "todas" ? "var(--color-brand)" : "var(--color-border)",
              background: filtro === "todas" ? "rgba(37,99,255,.12)" : "transparent",
              color: filtro === "todas" ? "var(--color-brand)" : "var(--color-text-dim)",
            }}
          >
            Todas
          </button>
          {CATEGORIA_ORDEM.map((c) => {
            const info = CATEGORIA_MENSAGEM_INFO[c];
            const sel = filtro === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setFiltro(c)}
                className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={{
                  borderColor: sel ? `${info.cor}80` : "var(--color-border)",
                  background: sel ? `${info.cor}1f` : "transparent",
                  color: sel ? info.cor : "var(--color-text-dim)",
                }}
              >
                {info.emoji} {info.label}
              </button>
            );
          })}
        </div>

        {/* formulário */}
        {abertoForm && (
          <div className="rounded-xl border border-[var(--color-brand)]/40 bg-[var(--color-surface)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider">
                {editando ? "Editar mensagem" : "Nova mensagem"}
              </h2>
              <button
                onClick={fechar}
                className="rounded-md p-1 text-[var(--color-text-dim)] transition-colors hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="titulo">Título (só o consultor vê na lista)</Label>
                <Input
                  id="titulo"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Ex.: Retomada direta"
                />
              </div>
              <div>
                <Label htmlFor="categoria">Categoria</Label>
                <select
                  id="categoria"
                  value={form.categoria}
                  onChange={(e) =>
                    setForm({ ...form, categoria: e.target.value as CategoriaMensagem })
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
                >
                  {CATEGORIA_ORDEM.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIA_MENSAGEM_INFO[c].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <Label htmlFor="texto">Texto da mensagem</Label>
              <textarea
                id="texto"
                value={form.texto}
                onChange={(e) => setForm({ ...form, texto: e.target.value })}
                rows={5}
                placeholder="Oi {{nome}}, aqui é o {{consultor}} da {{empresa}}…"
                className="mt-1 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm leading-relaxed outline-none focus:border-[var(--color-brand)]"
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ordem">Ordem dentro da categoria</Label>
                <Input
                  id="ordem"
                  type="number"
                  min={1}
                  value={form.ordem}
                  onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) || 1 })}
                />
              </div>
              <label className="flex cursor-pointer items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  className="h-4 w-4 accent-[var(--color-brand)]"
                />
                Disponível para os consultores
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={fechar}>
                Cancelar
              </Button>
              <Button disabled={salvando} onClick={() => void salvar()}>
                <Save className="h-4 w-4" /> {editando ? "Salvar alterações" : "Criar mensagem"}
              </Button>
            </div>
          </div>
        )}

        {/* lista agrupada por categoria */}
        <div className="space-y-4">
          {categoriasVisiveis.map((c) => {
            const info = CATEGORIA_MENSAGEM_INFO[c];
            const itens = porCategoria.get(c) ?? [];
            if (itens.length === 0 && filtro === "todas") return null;
            return (
              <section key={c}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2
                    className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                    style={{ color: info?.cor ?? "var(--color-text-dim)" }}
                  >
                    {info ? `${info.emoji} ${info.label}` : c}
                    <span className="text-[var(--color-text-dim)]">({itens.length})</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => abrirNova(c)}
                    className="text-[11px] font-semibold text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-brand)]"
                  >
                    + adicionar aqui
                  </button>
                </div>

                {itens.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-center text-[11px] text-[var(--color-text-dim)]">
                    Nenhuma mensagem nesta categoria.
                  </p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {itens.map((m) => (
                      <article
                        key={m.id}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3"
                        style={{ opacity: m.ativo ? 1 : 0.55 }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{m.titulo}</p>
                            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
                              ordem {m.ordem} · {m.ativo ? "ativa" : "desativada"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              onClick={() => void alternar(m)}
                              title={m.ativo ? "Desativar" : "Ativar"}
                              aria-label={m.ativo ? "Desativar" : "Ativar"}
                              className="rounded-md p-1.5 text-[var(--color-text-dim)] transition-colors hover:bg-white/10 hover:text-[var(--color-text)]"
                            >
                              {m.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => abrirEdicao(m)}
                              title="Editar"
                              aria-label="Editar"
                              className="rounded-md p-1.5 text-[var(--color-text-dim)] transition-colors hover:bg-white/10 hover:text-[var(--color-text)]"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => void excluir(m)}
                              title="Excluir"
                              aria-label="Excluir"
                              className="rounded-md p-1.5 text-[var(--color-text-dim)] transition-colors hover:bg-red-500/15 hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--color-text-dim)]">
                          {m.texto}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {biblioteca.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-dim)]">
            A biblioteca ainda está vazia. Clique em <strong>Nova mensagem</strong> para começar —
            ou rode a migration, que já traz 20 modelos prontos.
          </p>
        )}
      </div>
    </PremiumStage>
  );
}
