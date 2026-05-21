"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { clientesApi, useClientes } from "@/lib/store";
import type { Cliente } from "@/lib/types";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
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
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"} cadastrados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar nome, email ou empresa…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-64"
          />
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4" />
            Novo cliente
          </Button>
        </div>
      </header>

      {filtrados.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="mb-3 h-10 w-10 text-[var(--color-text-dim)]" />
            <CardTitle>
              {busca ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            </CardTitle>
            {!busca && (
              <Button onClick={abrirNovo} className="mt-4">
                <Plus className="h-4 w-4" />
                Cadastrar primeiro cliente
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((c) => (
            <Card key={c.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.nome}</p>
                  <p className="truncate text-xs text-[var(--color-text-dim)]">{c.empresa}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => abrirEditar(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remover(c)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-[var(--color-text-dim)]">
                {c.email && <p>{c.email}</p>}
                {c.telefone && <p>{c.telefone}</p>}
                {c.notas && (
                  <p className="mt-2 line-clamp-2 italic text-[var(--color-text)]">{c.notas}</p>
                )}
              </div>
            </Card>
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
    </div>
  );
}
