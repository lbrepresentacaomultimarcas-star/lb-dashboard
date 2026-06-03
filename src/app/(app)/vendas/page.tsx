"use client";

import { useMemo, useState } from "react";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { useVendas, useVendedores, vendasApi } from "@/lib/store";
import { brl, monthKey, monthLabel, parseNumBR, todayMonth } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Avatar } from "@/components/avatar";
import { PremiumStage } from "@/components/premium-stage";

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

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.vendedorId || !form.cliente) return;

    // Mobile-safe: força blur pra commitar último char do IME, depois lê o
    // valor monetário direto do DOM via FormData. Sem isso, em iOS/Android
    // o React state pode ficar "" mesmo com o DOM mostrando "60.145,80".
    const formEl = e.currentTarget;
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const valorRaw = (new FormData(formEl).get("valor") as string | null) ?? form.valor;
    const valorNum = parseNumBR(valorRaw);
    if (!valorNum) return;

    setErro(null);
    setSalvando(true);
    try {
      await vendasApi.add({
        vendedorId: form.vendedorId,
        cliente: form.cliente.trim(),
        valor: valorNum,
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
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#22C55E" }}>
            <Receipt className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Vendas
            </h1>
            <p className="text-sm text-white/55">
              {filtradas.length} vendas em {monthLabel(mes)} — total{" "}
              <span className="font-semibold text-emerald-400">{brl(totalMes)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none backdrop-blur focus:border-[#3B82F6]"
          >
            {mesesDisponiveis.map((m) => (
              <option key={m} value={m} className="bg-[#0b0d16]">
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

      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Vendedor</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="hidden px-5 py-3 md:table-cell">Observação</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtradas.map((v) => (
                <tr key={v.id} className="transition-colors hover:bg-white/[0.05]">
                  <td className="px-5 py-3 text-white/55">
                    {new Date(v.data).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3 font-medium text-white">{v.cliente}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar id={v.vendedorId} nome={nomeVendedor(v.vendedorId)} size={24} />
                      <span className="min-w-0 truncate text-white/80">{nomeVendedor(v.vendedorId)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-emerald-400 tabular-nums">
                    {brl(v.valor)}
                  </td>
                  <td className="hidden px-5 py-3 text-white/45 md:table-cell">{v.observacao ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <button
                        title="Remover"
                        onClick={async () => {
                          if (!confirm("Remover esta venda?")) return;
                          try {
                            await vendasApi.remove(v.id);
                          } catch (e) {
                            alert(e instanceof Error ? e.message : "Erro ao remover");
                          }
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 transition-transform duration-150 hover:scale-110 hover:bg-rose-500/25"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-white/45">
                    Nenhuma venda em {monthLabel(mes)}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
              <MoneyInput
                id="val"
                name="valor"
                value={form.valor}
                onChange={(v) => setForm({ ...form, valor: v })}
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
    </PremiumStage>
  );
}
