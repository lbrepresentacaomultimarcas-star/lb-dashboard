"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMetas, useVendas, useVendedores, vendedoresApi } from "@/lib/store";
import { desempenhoPorVendedor } from "@/lib/selectors";
import type { Vendedor } from "@/lib/types";
import { brl, pct } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/avatar";
import { AvatarUploader } from "@/components/avatar-uploader";

type FormState = {
  nome: string;
  email: string;
  metaMensal: string;
  comissaoPct: string;
  ativo: boolean;
};

const emptyForm: FormState = {
  nome: "",
  email: "",
  metaMensal: "0",
  comissaoPct: "5",
  ativo: true,
};

export default function VendedoresPage() {
  const vendedores = useVendedores();
  const vendas = useVendas();
  const metas = useMetas();
  const desempenho = desempenhoPorVendedor(vendedores, vendas, metas);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendedor | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  function abrirNovo() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function abrirEditar(v: Vendedor) {
    setEditing(v);
    setForm({
      nome: v.nome,
      email: v.email,
      metaMensal: String(v.metaMensal),
      comissaoPct: String(v.comissaoPct),
      ativo: v.ativo,
    });
    setOpen(true);
  }

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      nome: form.nome.trim(),
      email: form.email.trim(),
      metaMensal: Number(form.metaMensal) || 0,
      comissaoPct: Number(form.comissaoPct) || 0,
      ativo: form.ativo,
    };
    if (!payload.nome) return;
    setErro(null);
    setSalvando(true);
    try {
      if (editing) {
        await vendedoresApi.update(editing.id, payload);
      } else {
        await vendedoresApi.add(payload);
      }
      setOpen(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(v: Vendedor) {
    if (confirm(`Remover ${v.nome}? Suas vendas também serão apagadas.`)) {
      try {
        await vendedoresApi.remove(v.id);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Erro ao remover");
      }
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vendedores</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Gerencie a equipe e acompanhe o desempenho do mês
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4" />
          Novo vendedor
        </Button>
      </header>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3 text-right">Meta</th>
                <th className="px-5 py-3 text-right">Comissão</th>
                <th className="px-5 py-3 text-right">Vendido (mês)</th>
                <th className="px-5 py-3 text-right">% meta</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {desempenho.map((d) => (
                <tr key={d.id} className="hover:bg-[var(--color-surface-2)]/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar id={d.id} nome={d.nome} size={32} />
                      <span className="font-medium">{d.nome}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[var(--color-text-dim)]">{d.email}</td>
                  <td className="px-5 py-3 text-right">{brl(d.metaMensal)}</td>
                  <td className="px-5 py-3 text-right">{pct(d.comissaoPct)}</td>
                  <td className="px-5 py-3 text-right">{brl(d.vendido)}</td>
                  <td className="px-5 py-3 text-right">
                    <Badge
                      tone={d.pctMeta >= 100 ? "success" : d.pctMeta >= 70 ? "warn" : "danger"}
                    >
                      {pct(d.pctMeta)}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={d.ativo ? "brand" : "neutral"}>
                      {d.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => abrirEditar(d)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remover(d)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {desempenho.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[var(--color-text-dim)]">
                    Nenhum vendedor cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar vendedor" : "Novo vendedor"}
      >
        <form onSubmit={salvar} className="space-y-4">
          {editing && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
              <Label>Foto do vendedor</Label>
              <p className="mb-3 text-xs text-[var(--color-text-dim)]">
                Aparece no ranking, na tabela e em todo lugar que mostra o vendedor.
              </p>
              <AvatarUploader targetId={editing.id} nome={editing.nome} />
            </div>
          )}
          <div>
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="meta">Meta mensal (R$)</Label>
              <Input
                id="meta"
                type="number"
                min={0}
                step={100}
                value={form.metaMensal}
                onChange={(e) => setForm({ ...form, metaMensal: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="com">Comissão (%)</Label>
              <Input
                id="com"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={form.comissaoPct}
                onChange={(e) => setForm({ ...form, comissaoPct: e.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface-2)]"
            />
            Vendedor ativo
          </label>
          {erro && (
            <p className="rounded-md bg-[var(--color-danger)]/15 px-3 py-2 text-xs text-[var(--color-danger)]">
              {erro}
            </p>
          )}
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
