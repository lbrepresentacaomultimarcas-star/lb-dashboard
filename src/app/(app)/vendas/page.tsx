"use client";

import { useMemo, useState } from "react";
import { History, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { useAudit, useSession, useVendasAllEscopo, useVendedoresEscopo, vendasApi } from "@/lib/store";
import { brl, monthKey, monthLabel, parseNumBR, todayMonth } from "@/lib/utils";
import { VENDA_STATUS, type Venda } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Avatar } from "@/components/avatar";
import { PremiumStage } from "@/components/premium-stage";
import { notify } from "@/lib/notify";

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

/* ---- helpers de data/hora locais (a venda guarda ISO timestamptz) ---- */
function isoParaDataLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoParaHoraLocal(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function combinarDataHora(data: string, hora: string): string {
  // Interpreta no fuso LOCAL e converte pra ISO (o que os relatórios usam).
  return new Date(`${data}T${hora || "00:00"}:00`).toISOString();
}
function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---- estado do modal de edição administrativa ---- */
type EditState = {
  vendedorId: string;
  cliente: string;
  valor: string;
  status: string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm
  observacao: string;
  motivo: string;
};

export default function VendasPage() {
  const vendedores = useVendedoresEscopo();
  const vendas = useVendasAllEscopo(); // gestão vê TODAS, inclusive canceladas
  const session = useSession();
  const audit = useAudit();
  const isAdmin = session?.papel === "admin";

  const [mes, setMes] = useState(todayMonth());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(vendedores[0]?.id ?? ""));

  // Edição administrativa
  const [editando, setEditando] = useState<Venda | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [erroEdit, setErroEdit] = useState<string | null>(null);

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

  /* -------------------------- edição administrativa -------------------------- */
  function abrirEdicao(v: Venda) {
    setEditando(v);
    setErroEdit(null);
    setEdit({
      vendedorId: v.vendedorId,
      cliente: v.cliente,
      valor: v.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      status: v.status ?? "Confirmada",
      data: isoParaDataLocal(v.data),
      hora: isoParaHoraLocal(v.data),
      observacao: v.observacao ?? "",
      motivo: "",
    });
  }

  // Histórico de edições DESTA venda (admin) — do log de auditoria.
  const historicoDaVenda = useMemo(() => {
    if (!editando) return [];
    return audit
      .filter((a) => a.entidade === "venda" && a.entidadeId === editando.id && a.acao === "editar")
      .sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm));
  }, [audit, editando]);

  async function salvarEdicao(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando || !edit) return;
    if (!edit.motivo.trim()) {
      setErroEdit("Informe o motivo da alteração (fica registrado na auditoria).");
      return;
    }
    const formEl = e.currentTarget;
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const valorRaw = (new FormData(formEl).get("valorEdit") as string | null) ?? edit.valor;
    const valorNum = parseNumBR(valorRaw);
    if (!valorNum || valorNum <= 0) {
      setErroEdit("Valor inválido.");
      return;
    }

    const novaData = combinarDataHora(edit.data, edit.hora);
    const patch: Partial<Venda> = {
      vendedorId: edit.vendedorId,
      cliente: edit.cliente.trim(),
      valor: valorNum,
      status: edit.status,
      data: novaData,
      observacao: edit.observacao.trim() || undefined,
    };

    // Monta o detalhe da auditoria: só o que MUDOU, anterior → novo.
    const mudancas: string[] = [];
    if (editando.valor !== valorNum) mudancas.push(`Valor: ${brl(editando.valor)} → ${brl(valorNum)}`);
    if (editando.data !== novaData)
      mudancas.push(`Data da venda: ${fmtDataHora(editando.data)} → ${fmtDataHora(novaData)}`);
    if (editando.vendedorId !== patch.vendedorId)
      mudancas.push(`Consultor: ${nomeVendedor(editando.vendedorId)} → ${nomeVendedor(edit.vendedorId)}`);
    if (editando.cliente !== patch.cliente) mudancas.push(`Cliente: ${editando.cliente} → ${patch.cliente}`);
    if ((editando.status ?? "Confirmada") !== edit.status)
      mudancas.push(`Status: ${editando.status ?? "Confirmada"} → ${edit.status}`);
    if ((editando.observacao ?? "") !== (patch.observacao ?? "")) mudancas.push("Observação alterada");

    if (mudancas.length === 0) {
      setErroEdit("Nada foi alterado.");
      return;
    }
    const detalhes = `Venda de ${editando.cliente} · Motivo: ${edit.motivo.trim()} · ${mudancas.join(" · ")}`;

    setErroEdit(null);
    setSalvandoEdit(true);
    try {
      await vendasApi.update(editando.id, patch, detalhes);
      notify.success(
        "Venda corrigida",
        "Dashboard, ranking, financeiro, IA e relatórios já refletem a nova data.",
      );
      setEditando(null);
      setEdit(null);
    } catch (err) {
      setErroEdit(err instanceof Error ? err.message : "Erro ao salvar a correção.");
    } finally {
      setSalvandoEdit(false);
    }
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

      {isAdmin ? (
        <p className="lb-fade-up -mt-1 text-xs text-white/40">
          Como administrador, você pode corrigir data, valor e demais dados de uma venda no botão{" "}
          <Pencil className="mb-0.5 inline h-3 w-3" /> — os relatórios sempre usam a <b>data efetiva da venda</b>, e
          toda correção fica registrada na auditoria.
        </p>
      ) : null}

      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Data da venda</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Vendedor</th>
                <th className="px-5 py-3">Status</th>
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
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        (v.status ?? "Confirmada") === "Cancelada"
                          ? "bg-rose-500/15 text-rose-300"
                          : (v.status ?? "Confirmada") === "Pendente"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      {v.status ?? "Confirmada"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-emerald-400 tabular-nums">
                    {brl(v.valor)}
                  </td>
                  <td className="hidden px-5 py-3 text-white/45 md:table-cell">{v.observacao ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      {isAdmin ? (
                        <button
                          title="Editar venda"
                          onClick={() => abrirEdicao(v)}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-sky-500/40 bg-sky-500/15 text-sky-300 transition-transform duration-150 hover:scale-110 hover:bg-sky-500/25"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
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
                  <td colSpan={7} className="px-5 py-12 text-center text-white/45">
                    Nenhuma venda em {monthLabel(mes)}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------ nova venda ------------------------------ */}
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

      {/* ------------------------ edição administrativa ------------------------- */}
      <Modal
        open={!!editando && isAdmin}
        onClose={() => (salvandoEdit ? null : (setEditando(null), setEdit(null)))}
        title="Editar venda"
        subtitle="Correção administrativa — os relatórios usam a data efetiva da venda."
        icon={<Pencil className="h-5 w-5" />}
      >
        {edit && editando ? (
          <form onSubmit={salvarEdicao} className="space-y-4">
            <div>
              <Label htmlFor="e-cli">Cliente</Label>
              <Input id="e-cli" value={edit.cliente} onChange={(e) => setEdit({ ...edit, cliente: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="e-vend">Consultor</Label>
                <select
                  id="e-vend"
                  value={edit.vendedorId}
                  onChange={(e) => setEdit({ ...edit, vendedorId: e.target.value })}
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
                <Label htmlFor="e-status">Status</Label>
                <select
                  id="e-status"
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                  className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
                >
                  {VENDA_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="e-val">Valor (R$)</Label>
                <MoneyInput id="e-val" name="valorEdit" value={edit.valor} onChange={(v) => setEdit({ ...edit, valor: v })} required />
              </div>
              <div>
                <Label htmlFor="e-data">Data da venda</Label>
                <Input id="e-data" type="date" value={edit.data} onChange={(e) => setEdit({ ...edit, data: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="e-hora">Hora</Label>
                <Input id="e-hora" type="time" value={edit.hora} onChange={(e) => setEdit({ ...edit, hora: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="e-obs">Observações</Label>
              <Input id="e-obs" value={edit.observacao} onChange={(e) => setEdit({ ...edit, observacao: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="e-motivo">Motivo da alteração *</Label>
              <Input
                id="e-motivo"
                value={edit.motivo}
                onChange={(e) => setEdit({ ...edit, motivo: e.target.value })}
                placeholder="Ex.: venda foi do dia 18, registrei errado no dia 20"
                required
              />
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                Fica registrado na auditoria (quem, quando, valores e datas anterior → novo).
              </p>
            </div>

            {/* data de criação imutável */}
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/50">
              🔒 Registro criado no sistema em{" "}
              <b className="text-white/70">{editando.criadoEm ? fmtDataHora(editando.criadoEm) : "—"}</b> (imutável). A
              data acima é a <b className="text-white/70">data efetiva da venda</b>, usada por todos os relatórios.
            </div>

            {erroEdit && (
              <p className="rounded-md bg-[var(--color-danger)]/15 px-3 py-2 text-xs text-[var(--color-danger)]">{erroEdit}</p>
            )}

            {/* histórico de edições desta venda (admin) */}
            {historicoDaVenda.length > 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/50">
                  <History className="h-3.5 w-3.5" /> Auditoria desta venda
                </p>
                <div className="max-h-32 space-y-1.5 overflow-y-auto">
                  {historicoDaVenda.map((a) => (
                    <div key={a.id} className="text-[11px] leading-snug text-white/60">
                      <span className="text-white/40">{fmtDataHora(a.criadoEm)}</span>
                      {a.usuarioEmail ? <span className="text-white/40"> · {a.usuarioEmail}</span> : null}
                      <br />
                      {a.detalhes}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => (setEditando(null), setEdit(null))} disabled={salvandoEdit}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvandoEdit}>
                {salvandoEdit ? "Salvando…" : "Salvar correção"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </PremiumStage>
  );
}
