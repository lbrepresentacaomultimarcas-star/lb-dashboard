"use client";

/*
 * ADMINISTRATIVO → EVENTO EM DESTAQUE.
 *
 * Cadastro simples: um formulário e a lista. Eventos encerrados ficam na
 * lista e viram o histórico — nada é apagado só por ter terminado.
 *
 * A gravação vai por `/api/admin/eventos`, com chave de serviço: a tabela tem
 * RLS ligada e nenhuma policy de escrita, então o navegador lê e o servidor
 * grava. A conferência de "é admin?" mora num lugar só.
 */

import { useEffect, useState } from "react";
import { CalendarClock, Flame, ImageUp, Loader2, Trash2 } from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import { RoleGuard } from "@/components/role-guard";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { fromDb, type EventoDestaque } from "@/lib/eventos";
import { brl, formatNumBR, parseNumBR } from "@/lib/utils";

const VAZIO: Partial<EventoDestaque> = {
  nome: "",
  inicio: new Date().toISOString().slice(0, 10),
  fim: new Date().toISOString().slice(0, 10),
  metaLb: 0,
  ativo: true,
};

export default function EventosPage() {
  return (
    <RoleGuard minimo="admin">
      <EventosConteudo />
    </RoleGuard>
  );
}

function EventosConteudo() {
  const [lista, setLista] = useState<EventoDestaque[]>([]);
  const [form, setForm] = useState<Partial<EventoDestaque>>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(false);
  // Texto cru dos campos de dinheiro: o número só é calculado na saída, senão
  // o ponto e a vírgula somem enquanto se digita.
  const [textoLb, setTextoLb] = useState("");
  const [textoGeral, setTextoGeral] = useState("");

  async function carregar() {
    try {
      const r = await fetch("/api/admin/eventos");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setLista((j.eventos ?? []).map(fromDb));
    } catch (e) {
      notify.error("Erro ao carregar", e instanceof Error ? e.message : undefined);
    }
  }
  useEffect(() => {
    // adiado um tique: o React 19 recusa setState no corpo do efeito, e
    // `carregar` mexe no estado assim que a resposta chega.
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, []);

  function editar(e: EventoDestaque) {
    setForm(e);
    setTextoLb(e.metaLb ? formatNumBR(e.metaLb) : "");
    setTextoGeral(e.metaGeral ? formatNumBR(e.metaGeral) : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function enviarCapa(file: File) {
    setSubindo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/admin/eventos", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setForm((f) => ({ ...f, capaUrl: j.url }));
      notify.success("Capa enviada");
    } catch (e) {
      notify.error("Não consegui enviar", e instanceof Error ? e.message : undefined);
    } finally {
      setSubindo(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch("/api/admin/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          metaLb: parseNumBR(textoLb) || 0,
          metaGeral: parseNumBR(textoGeral) || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify.success(form.id ? "Evento atualizado" : "Evento criado");
      setForm(VAZIO);
      setTextoLb("");
      setTextoGeral("");
      await carregar();
    } catch (e) {
      notify.error("Não consegui salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  async function remover(e: EventoDestaque) {
    if (!confirm(`Remover "${e.nome}"? O histórico dele some junto.`)) return;
    try {
      const r = await fetch(`/api/admin/eventos?id=${e.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify.success("Removido");
      await carregar();
    } catch (err) {
      notify.error("Erro", err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <PremiumStage>
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-gold,#d4a72c)]/15 text-[var(--color-gold,#d4a72c)]">
            <Flame className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Evento em destaque</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Campanhas e gincanas que aparecem no topo do Dashboard do time.
            </p>
          </div>
        </header>

        {/* ------------------------- formulário ------------------------- */}
        <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div>
            <Label>Nome do evento</Label>
            <Input
              value={form.nome ?? ""}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Gincana Elas x Eles"
            />
          </div>

          <div>
            <Label>Capa</Label>
            {form.capaUrl && (
              /* eslint-disable-next-line @next/next/no-img-element -- arte do
                 admin, hospedada no Storage; o otimizador exigiria configurar
                 o host e a arte muda a cada campanha. */
              <img
                src={form.capaUrl}
                alt="Capa do evento"
                className="mb-2 max-h-48 w-full rounded-lg border border-[var(--color-border)] object-cover"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--color-surface-2)]">
                {subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                {form.capaUrl ? "Trocar imagem" : "Enviar imagem"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void enviarCapa(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {form.capaUrl && (
                <button
                  onClick={() => setForm({ ...form, capaUrl: undefined })}
                  className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-danger)]"
                >
                  Remover imagem
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              JPG, PNG ou WEBP, até 8 MB. Ela aparece grande no Dashboard — use uma arte larga.
            </p>
          </div>

          <div>
            <Label>Frase principal</Label>
            <Input
              value={form.frase ?? ""}
              onChange={(e) => setForm({ ...form, frase: e.target.value })}
              placeholder="Rumo ao R$ 1 milhão"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Início</Label>
              <Input
                type="date"
                value={form.inicio ?? ""}
                onChange={(e) => setForm({ ...form, inicio: e.target.value })}
              />
            </div>
            <div>
              <Label>Término</Label>
              <Input
                type="date"
                value={form.fim ?? ""}
                onChange={(e) => setForm({ ...form, fim: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Meta da LB (a nossa)</Label>
              <Input
                inputMode="decimal"
                value={textoLb}
                onChange={(e) => setTextoLb(e.target.value)}
                placeholder="1.000.000"
              />
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                É esta que aparece em destaque para o time.
              </p>
            </div>
            <div>
              <Label>Meta geral do evento (opcional)</Label>
              <Input
                inputMode="decimal"
                value={textoGeral}
                onChange={(e) => setTextoGeral(e.target.value)}
                placeholder="8.000.000"
              />
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                Só como contexto, em letra pequena.
              </p>
            </div>
          </div>

          <div>
            <Label>Mensagem de incentivo</Label>
            <textarea
              rows={3}
              value={form.mensagem ?? ""}
              onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
              placeholder={"NO MÍNIMO R$ 1 MILHÃO!\nSE NÃO BATER, NÃO TEM FESTA!\nBORA, BORA! 🚀🔥"}
              className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40"
            />
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Input
              value={form.descricao ?? ""}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ativo ?? false}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              className="h-4 w-4 accent-[var(--color-brand)]"
            />
            <span>
              Ativo — aparece no Dashboard
              <span className="block text-[11px] text-[var(--color-muted)]">
                Ligar este desliga os outros: um desafio por vez, senão o time vê uma meta hoje e
                outra amanhã.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            {form.id && (
              <Button variant="secondary" onClick={() => { setForm(VAZIO); setTextoLb(""); setTextoGeral(""); }}>
                Novo evento
              </Button>
            )}
            <Button onClick={() => void salvar()} disabled={salvando || !form.nome?.trim()}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
              {form.id ? "Salvar alterações" : "Criar evento"}
            </Button>
          </div>
        </section>

        {/* --------------------------- histórico --------------------------- */}
        {lista.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
              Eventos cadastrados
            </h2>
            <div className="space-y-2">
              {lista.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      {e.nome}
                      {e.ativo && (
                        <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                          ativo
                        </span>
                      )}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
                      <CalendarClock className="h-3 w-3" />
                      {new Date(`${e.inicio}T12:00:00`).toLocaleDateString("pt-BR")} →{" "}
                      {new Date(`${e.fim}T12:00:00`).toLocaleDateString("pt-BR")} · Meta LB{" "}
                      {brl(e.metaLb)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => editar(e)}>
                      Editar
                    </Button>
                    <button
                      onClick={() => void remover(e)}
                      title="Remover"
                      className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PremiumStage>
  );
}
