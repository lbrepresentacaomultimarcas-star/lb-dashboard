"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, CheckCircle2, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { PremiumStage } from "@/components/premium-stage";
import { AnimatedNum } from "@/components/ui/spark";

type DbProducao = {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  ativa: boolean;
  criado_em: string;
};

function fmtData(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}
function diasEntre(inicio: string, fim: string) {
  const a = new Date(inicio + "T00:00:00").getTime();
  const b = new Date(fim + "T00:00:00").getTime();
  return Math.max(Math.ceil((b - a) / (1000 * 60 * 60 * 24)), 0);
}
function diasDecorridos(inicio: string) {
  const a = new Date(inicio + "T00:00:00").getTime();
  return Math.max(Math.floor((Date.now() - a) / (1000 * 60 * 60 * 24)), 0);
}
function diasRestantes(fim: string) {
  const b = new Date(fim + "T23:59:59").getTime();
  return Math.max(Math.ceil((b - Date.now()) / (1000 * 60 * 60 * 24)), 0);
}

export default function ProducoesPage() {
  const [producoes, setProducoes] = useState<DbProducao[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DbProducao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    dataInicio: "",
    dataFim: "",
    ativa: false,
  });

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/producoes");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setProducoes(j.producoes ?? []);
    } catch (e) {
      notify.error("Erro ao carregar", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, []);

  const ativa = useMemo(() => producoes.find((p) => p.ativa) ?? null, [producoes]);

  function abrirNovo() {
    setEditing(null);
    const hoje = new Date().toISOString().slice(0, 10);
    const proxMes = new Date();
    proxMes.setMonth(proxMes.getMonth() + 1);
    setForm({
      nome: "",
      dataInicio: hoje,
      dataFim: proxMes.toISOString().slice(0, 10),
      ativa: producoes.length === 0,
    });
    setOpen(true);
  }
  function abrirEditar(p: DbProducao) {
    setEditing(p);
    setForm({
      nome: p.nome,
      dataInicio: p.data_inicio,
      dataFim: p.data_fim,
      ativa: p.ativa,
    });
    setOpen(true);
  }
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSalvando(true);
    try {
      const body = JSON.stringify({
        ...(editing ? { id: editing.id } : {}),
        nome: form.nome.trim(),
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        ativa: form.ativa,
      });
      const r = await fetch("/api/admin/producoes", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify.success(editing ? "Produção atualizada" : "Produção criada");
      setOpen(false);
      carregar();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }
  async function ativar(p: DbProducao) {
    try {
      const r = await fetch("/api/admin/producoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, ativa: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify.success(`Produção "${p.nome}" ativada`);
      carregar();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }
  async function remover(p: DbProducao) {
    if (!confirm(`Remover produção "${p.nome}"?`)) return;
    try {
      const r = await fetch(`/api/admin/producoes?id=${p.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify.success("Removida");
      carregar();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#7C3AED" }}>
            <CalendarRange className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Gerenciamento de Produções
            </h1>
            <p className="text-sm text-white/55">Produções e campanhas da empresa</p>
          </div>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4" />
          Adicionar Produção
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4">
          <span className="lb-orb h-10 w-10" style={{ ["--orb" as string]: "#3B82F6" }}>
            <CalendarRange className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[11px] uppercase tracking-wider text-white/55">Total produções</p>
          <AnimatedNum value={producoes.length} className="block text-2xl font-extrabold tabular-nums text-white" />
        </div>
        <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4" style={{ animationDelay: "0.06s" }}>
          <span className="lb-orb h-10 w-10" style={{ ["--orb" as string]: "#22C55E" }}>
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[11px] uppercase tracking-wider text-white/55">Produção ativa</p>
          <p className="truncate text-xl font-extrabold text-white">{ativa ? ativa.nome : "—"}</p>
          <p className="text-[11px] text-white/40">
            {ativa ? `${fmtData(ativa.data_inicio)} → ${fmtData(ativa.data_fim)}` : "Nenhuma"}
          </p>
        </div>
        <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4" style={{ animationDelay: "0.12s" }}>
          <span className="lb-orb h-10 w-10" style={{ ["--orb" as string]: "#06b6d4" }}>
            <Clock className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[11px] uppercase tracking-wider text-white/55">Dias decorridos</p>
          <p className="text-2xl font-extrabold tabular-nums text-white">{ativa ? `${diasDecorridos(ativa.data_inicio)}` : "—"}</p>
        </div>
        <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4" style={{ animationDelay: "0.18s" }}>
          <span className="lb-orb h-10 w-10" style={{ ["--orb" as string]: "#FACC15" }}>
            <Clock className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[11px] uppercase tracking-wider text-white/55">Dias restantes</p>
          <p className="text-2xl font-extrabold tabular-nums text-white">{ativa ? `${diasRestantes(ativa.data_fim)}` : "—"}</p>
        </div>
      </div>

      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Produções</h2>
        </div>
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Produção</th>
                <th className="hidden px-5 py-3 sm:table-cell">Início</th>
                <th className="hidden px-5 py-3 sm:table-cell">Término</th>
                <th className="hidden px-5 py-3 md:table-cell">Duração</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                [0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-3">
                      <div className="h-8 w-full animate-pulse rounded-lg bg-white/5" />
                    </td>
                  </tr>
                ))
              ) : producoes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-white/45">
                    Nenhuma produção. Crie a primeira pra organizar suas campanhas.
                  </td>
                </tr>
              ) : (
                producoes.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-white/[0.05]">
                    <td className="px-5 py-3 font-medium text-white">{p.nome}</td>
                    <td className="hidden px-5 py-3 text-white/55 sm:table-cell">{fmtData(p.data_inicio)}</td>
                    <td className="hidden px-5 py-3 text-white/55 sm:table-cell">{fmtData(p.data_fim)}</td>
                    <td className="hidden px-5 py-3 text-white/55 md:table-cell">
                      {diasEntre(p.data_inicio, p.data_fim)} dias
                    </td>
                    <td className="px-5 py-3">
                      {p.ativa ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={{ color: "#22C55E", borderColor: "#22C55E66", background: "#22C55E1a", boxShadow: "0 0 12px -4px #22C55E" }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
                          Ativa
                        </span>
                      ) : (
                        <button
                          onClick={() => ativar(p)}
                          className="rounded-full border border-[#3B82F6]/40 bg-[#3B82F6]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#7aa2ff] transition-colors hover:bg-[#3B82F6]/25"
                        >
                          Ativar
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => abrirEditar(p)}
                          title="Editar"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-[#3B82F6]/40 bg-[#3B82F6]/15 text-[#7aa2ff] transition-transform duration-150 hover:scale-110 hover:bg-[#3B82F6]/25"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remover(p)}
                          title="Excluir"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 transition-transform duration-150 hover:scale-110 hover:bg-rose-500/25"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar Produção" : "Nova Produção"}
        subtitle="Defina um ciclo/campanha pra rastrear metas e desempenho"
        icon={<CalendarRange className="h-5 w-5" />}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome da produção</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: LB REPRE, Campanha Maio…"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ini">Data de início</Label>
              <Input
                id="ini"
                type="date"
                value={form.dataInicio}
                onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="fim">Data de término</Label>
              <Input
                id="fim"
                type="date"
                value={form.dataFim}
                onChange={(e) => setForm({ ...form, dataFim: e.target.value })}
                required
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ativa}
              onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--color-border)]"
            />
            Definir como ativa (desativa as outras)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </div>
        </form>
      </Modal>
    </PremiumStage>
  );
}
