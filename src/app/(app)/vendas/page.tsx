"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useVendas, useVendedores, vendasApi } from "@/lib/store";
import { brl, monthKey, monthLabel, todayMonth } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";

type FormState = {
  vendedorId: string;
  cliente: string;
  valor: string;
  data: string;
  observacao: string;
};

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = (vendedorId = ""): FormState => ({
  vendedorId,
  cliente: "",
  valor: "",
  data: hojeIso(),
  observacao: "",
});

export default function VendasPage() {
  const vendedores = useVendedores();
  const vendas = useVendas();
  const [mes, setMes] = useState(todayMonth());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(vendedores[0]?.id ?? ""));

  const mesesDisponiveis = useMemo(() => {
    const set = new Set(vendas.map((v) => monthKey(v.data)));
    set.add(todayMonth());
    return Array.from(set).sort().reverse();
  }, [vendas]);

  const filtradas = useMemo(
    () =>
      vendas
        .filter((v) => monthKey(v.data) === mes)
        .sort((a, b) => +new Date(b.data) - +new Date(a.data)),
    [vendas, mes],
  );

  const totalMes = filtradas.reduce((acc, v) => acc + v.valor, 0);

  function abrirNova() {
    setForm(emptyForm(vendedores[0]?.id ?? ""));
    setOpen(true);
  }

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vendedorId || !form.cliente || !form.valor) return;
    setErro(null);
    setSalvando(true);
    try {
      await vendasApi.add({
        vendedorId: form.vendedorId,
        cliente: form.cliente.trim(),
        valor: Number(form.valor),
        data: new Date(form.data).toISOString(),
        observacao: form.observacao.trim() || undefined,
      });
      setOpen(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao registrar");
    } finally {
      setSalvando(false);
    }
  }

  function nomeVendedor(id: string) {
    return vendedores.find((v) => v.id === id)?.nome ?? "—";
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vendas</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            {filtradas.length} vendas em {monthLabel(mes)} — total {brl(totalMes)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
          >
            {mesesDisponiveis.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <Button onClick={abrirNova} disabled={vendedores.length === 0}>
            <Plus className="h-4 w-4" />
            Nova venda
          </Button>
        </div>
      </header>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Vendedor</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3">Observação</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtradas.map((v) => (
                <tr key={v.id} className="hover:bg-[var(--color-surface-2)]/40">
                  <td className="px-5 py-3 text-[var(--color-text-dim)]">
                    {new Date(v.data).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3 font-medium">{v.cliente}</td>
                  <td className="px-5 py-3">{nomeVendedor(v.vendedorId)}</td>
                  <td className="px-5 py-3 text-right text-[var(--color-success)]">
                    {brl(v.valor)}
                  </td>
                  <td className="px-5 py-3 text-[var(--color-text-dim)]">
                    {v.observacao ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (!confirm("Remover esta venda?")) return;
                        try {
                          await vendasApi.remove(v.id);
                        } catch (e) {
                          alert(e instanceof Error ? e.message : "Erro ao remover");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[var(--color-text-dim)]">
                    Nenhuma venda em {monthLabel(mes)}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Nova venda">
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <Label htmlFor="vend">Vendedor</Label>
            <select
              id="vend"
              value={form.vendedorId}
              onChange={(e) => setForm({ ...form, vendedorId: e.target.value })}
              className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              required
            >
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="cli">Cliente</Label>
            <Input
              id="cli"
              value={form.cliente}
              onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="val">Valor (R$)</Label>
              <Input
                id="val"
                type="number"
                min={0}
                step={0.01}
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="dt">Data</Label>
              <Input
                id="dt"
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="obs">Observação (opcional)</Label>
            <Input
              id="obs"
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>
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
              {salvando ? "Salvando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
