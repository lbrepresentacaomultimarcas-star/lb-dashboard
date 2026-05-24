"use client";

import { useState } from "react";
import { Mail, Pencil, Phone, Plus, Search, Trash2, UserCircle, Users } from "lucide-react";
import { clientesApi, useClientes } from "@/lib/store";
import type { Cliente } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { Avatar } from "@/components/avatar";
import { PremiumStage } from "@/components/premium-stage";
import { notify } from "@/lib/notify";

type FormState = {
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  notas: string;
};
const empty: FormState = { nome: "", email: "", telefone: "", empresa: "", notas: "" };

export default function ClientesPage() {
  const clientes = useClientes();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");

  const filtrados = clientes.filter((c) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      c.nome.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.empresa.toLowerCase().includes(q)
    );
  });

  function abrirNovo() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function abrirEditar(c: Cliente) {
    setEditing(c);
    setForm({
      nome: c.nome,
      email: c.email,
      telefone: c.telefone,
      empresa: c.empresa,
      notas: c.notas ?? "",
    });
    setOpen(true);
  }
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        telefone: form.telefone.trim(),
        empresa: form.empresa.trim(),
        notas: form.notas.trim() || undefined,
      };
      if (editing) {
        await clientesApi.update(editing.id, payload);
        notify.success("Cliente atualizado");
      } else {
        await clientesApi.add(payload);
        notify.success("Cliente cadastrado");
      }
      setOpen(false);
    } catch (e) {
      notify.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }
  async function remover(c: Cliente) {
    if (!confirm(`Remover ${c.nome}?`)) return;
    try {
      await clientesApi.remove(c.id);
      notify.success("Cliente removido");
    } catch (e) {
      notify.error("Erro ao remover", e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#06b6d4" }}>
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Clientes
            </h1>
            <p className="text-sm text-white/55">
              {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"} cadastrados
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              placeholder="Buscar nome, email ou empresa…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-10 w-56 rounded-xl border border-white/12 bg-white/[0.04] pl-9 pr-3 text-sm text-white outline-none backdrop-blur transition-all duration-200 placeholder:text-white/35 focus:border-[#3B82F6] focus:bg-[#3B82F6]/10 focus:shadow-[0_0_0_1px_rgba(59,130,246,.5),0_0_24px_-6px_rgba(59,130,246,.7)]"
            />
          </div>
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4" />
            Novo cliente
          </Button>
        </div>
      </header>

      {filtrados.length === 0 ? (
        <div className="lb-card-premium lb-fade-up rounded-2xl">
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <span className="lb-orb mb-3 h-12 w-12" style={{ ["--orb" as string]: "#06b6d4" }}>
              <UserCircle className="h-6 w-6" />
            </span>
            <p className="text-base font-bold text-white">
              {busca ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            </p>
            {!busca && (
              <Button onClick={abrirNovo} className="mt-4">
                <Plus className="h-4 w-4" />
                Cadastrar primeiro cliente
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((c, i) => (
            <div
              key={c.id}
              className="lb-card-premium lb-fade-up rounded-2xl p-4"
              style={{ animationDelay: `${(i % 9) * 0.04}s` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar id={c.id} nome={c.nome} size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{c.nome}</p>
                    <p className="truncate text-xs text-white/45">{c.empresa || "—"}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => abrirEditar(c)}
                    title="Editar"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[#3B82F6]/40 bg-[#3B82F6]/15 text-[#7aa2ff] transition-transform duration-150 hover:scale-110 hover:bg-[#3B82F6]/25"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remover(c)}
                    title="Excluir"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 transition-transform duration-150 hover:scale-110 hover:bg-rose-500/25"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-white/55">
                {c.email && (
                  <p className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3 shrink-0 text-sky-300" />
                    <span className="min-w-0 truncate">{c.email}</span>
                  </p>
                )}
                {c.telefone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0 text-emerald-300" />
                    <span className="truncate">{c.telefone}</span>
                  </p>
                )}
                {c.notas && <p className="mt-2 line-clamp-2 italic text-white/70">{c.notas}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar cliente" : "Novo cliente"}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome / Razão social</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="tel">Telefone</Label>
              <Input
                id="tel"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="emp">Empresa</Label>
            <Input
              id="emp"
              value={form.empresa}
              onChange={(e) => setForm({ ...form, empresa: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="notas">Notas</Label>
            <textarea
              id="notas"
              rows={3}
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : editing ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </form>
      </Modal>
    </PremiumStage>
  );
}
