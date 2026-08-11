"use client";

import { useState } from "react";
import { Crown, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useMetasEscopo, useVendasEscopo, useVendedoresEscopo, vendedoresApi } from "@/lib/store";
import { desempenhoPorVendedor } from "@/lib/selectors";
import type { Vendedor } from "@/lib/types";
import { brl, parseNumBR, pct } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { Avatar } from "@/components/avatar";
import { AvatarUploader } from "@/components/avatar-uploader";
import { PremiumStage } from "@/components/premium-stage";
import { AcessoConsultor } from "@/components/acesso-consultor";

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

/** Cor dinâmica do % da meta: 0–20 vermelho, 20–50 amarelo, 50+ verde. */
function pctColor(p: number) {
  if (p >= 50) return "#22C55E";
  if (p >= 20) return "#FACC15";
  return "#f43f5e";
}

export default function VendedoresPage() {
  const vendedores = useVendedoresEscopo();
  const vendas = useVendasEscopo();
  const metas = useMetasEscopo();
  const desempenho = desempenhoPorVendedor(vendedores, vendas, metas);
  const melhor = desempenho.length ? desempenho.reduce((a, b) => (b.vendido > a.vendido ? b : a)) : null;
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
      metaMensal: parseNumBR(form.metaMensal),
      comissaoPct: parseNumBR(form.comissaoPct),
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
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#2563FF" }}>
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Vendedores
            </h1>
            <p className="text-sm text-white/55">Gerencie a equipe e acompanhe o desempenho do mês</p>
          </div>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4" />
          Novo vendedor
        </Button>
      </header>

      {/* Melhor vendedor — destaque dourado */}
      {melhor && melhor.vendido > 0 && (
        <div
          className="lb-fade-up relative overflow-hidden rounded-2xl border p-4"
          style={{
            borderColor: "rgba(250,204,21,.5)",
            background: "linear-gradient(120deg, rgba(250,204,21,.14), rgba(10,14,35,.72))",
            boxShadow: "0 0 32px -8px rgba(250,204,21,.5), inset 0 1px 0 rgba(255,255,255,.1)",
          }}
        >
          <div
            className="lb-pulse-glow pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(250,204,21,.4), transparent 70%)" }}
          />
          <div className="relative flex items-center gap-3">
            <span
              className="inline-grid shrink-0 place-items-center rounded-full p-0.5"
              style={{ boxShadow: "0 0 0 2px #FACC15, 0 0 16px -2px #FACC15" }}
            >
              <Avatar id={melhor.id} nome={melhor.nome} size={48} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-amber-300/80">Melhor vendedor do mês</p>
              <p className="truncate text-lg font-extrabold text-white">{melhor.nome}</p>
              <p className="text-sm text-white/60">
                {brl(melhor.vendido)} · {pct(melhor.pctMeta)} da meta
              </p>
            </div>
            <Crown className="ml-auto h-7 w-7 shrink-0 text-amber-300" style={{ filter: "drop-shadow(0 0 8px rgba(250,204,21,.8))" }} />
          </div>
        </div>
      )}

      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Nome</th>
                <th className="hidden px-5 py-3 lg:table-cell">Email</th>
                <th className="hidden px-5 py-3 text-right sm:table-cell">Meta</th>
                <th className="hidden px-5 py-3 text-right md:table-cell">Comissão</th>
                <th className="px-5 py-3 text-right">Vendido (mês)</th>
                <th className="px-5 py-3 text-right">% meta</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {desempenho.map((d) => {
                const best = d.id === melhor?.id && d.vendido > 0;
                const pc = pctColor(d.pctMeta);
                const sc = d.ativo ? "#22C55E" : "#f43f5e";
                return (
                  <tr
                    key={d.id}
                    className={best ? "bg-amber-400/[0.06] transition-colors" : "transition-colors hover:bg-white/[0.05]"}
                    style={best ? { boxShadow: "inset 3px 0 0 #FACC15" } : undefined}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar id={d.id} nome={d.nome} size={32} />
                        <span className="min-w-0 truncate font-medium text-white">{d.nome}</span>
                        {best && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
                      </div>
                    </td>
                    <td className="hidden px-5 py-3 text-white/45 lg:table-cell">{d.email || "—"}</td>
                    <td className="hidden px-5 py-3 text-right text-white/70 tabular-nums sm:table-cell">{brl(d.metaMensal)}</td>
                    <td className="hidden px-5 py-3 text-right text-white/70 tabular-nums md:table-cell">{pct(d.comissaoPct)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-white tabular-nums">{brl(d.vendido)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-white/10 sm:block">
                          <div
                            className="h-full rounded-full transition-[width] duration-700"
                            style={{ width: `${Math.min(d.pctMeta, 100)}%`, background: pc, boxShadow: `0 0 10px ${pc}` }}
                          />
                        </div>
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums"
                          style={{ color: pc, borderColor: `${pc}66`, background: `${pc}1f`, boxShadow: `0 0 12px -4px ${pc}` }}
                        >
                          {pct(d.pctMeta)}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                        style={{ color: sc, borderColor: `${sc}66`, background: `${sc}1a`, boxShadow: `0 0 12px -4px ${sc}` }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: sc, boxShadow: `0 0 6px ${sc}` }} />
                        {d.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => abrirEditar(d)}
                          title="Editar"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-[#3B82F6]/40 bg-[#3B82F6]/15 text-[#7aa2ff] transition-transform duration-150 hover:scale-110 hover:bg-[#3B82F6]/25"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remover(d)}
                          title="Excluir"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 transition-transform duration-150 hover:scale-110 hover:bg-rose-500/25"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {desempenho.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-white/45">
                    Nenhum vendedor cadastrado. Clique em “Novo vendedor”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                type="text"
                inputMode="decimal"
                placeholder="50.000,00"
                value={form.metaMensal}
                onChange={(e) => setForm({ ...form, metaMensal: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="com">Comissão (%)</Label>
              <Input
                id="com"
                type="text"
                inputMode="decimal"
                placeholder="ex: 2,5"
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

          {/* Gerenciamento de credenciais — só na EDIÇÃO e só para admin
              (o próprio componente se esconde de quem não é admin). */}
          {editing ? <AcessoConsultor vendedorId={editing.id} vendedorNome={editing.nome} /> : null}

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
    </PremiumStage>
  );
}
