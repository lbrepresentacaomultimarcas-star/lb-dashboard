"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, CheckCircle2, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";

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
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Gerenciamento de Produções</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Produções e campanhas da empresa
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4" />
          Adicionar Produção
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Produções"
          value={String(producoes.length)}
          icon={CalendarRange}
          tone="brand"
        />
        <StatCard
          title="Produção Ativa"
          value={ativa ? ativa.nome : "—"}
          hint={ativa ? `${fmtData(ativa.data_inicio)} → ${fmtData(ativa.data_fim)}` : "Nenhuma"}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          title="Dias Decorridos"
          value={ativa ? `${diasDecorridos(ativa.data_inicio)} dias` : "—"}
          icon={Clock}
          tone="neutral"
        />
        <StatCard
          title="Dias Restantes"
          value={ativa ? `${diasRestantes(ativa.data_fim)} dias` : "—"}
          icon={Clock}
          tone="warn"
        />
      </div>

      <Card className="p-0">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-brand)]/10 px-5 py-3">
          <CardTitle>Produções</CardTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                <th className="px-5 py-3">Produção</th>
                <th className="px-5 py-3">Data de Início</th>
                <th className="px-5 py-3">Data de Término</th>
                <th className="px-5 py-3">Duração</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[var(--color-text-dim)]">
                    Carregando…
                  </td>
                </tr>
              ) : producoes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[var(--color-text-dim)]">
                    Nenhuma produção. Crie a primeira pra organizar suas campanhas.
                  </td>
                </tr>
              ) : (
                producoes.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--color-surface-2)]/40">
                    <td className="px-5 py-3 font-medium">{p.nome}</td>
                    <td className="px-5 py-3 text-[var(--color-text-dim)]">
                      {fmtData(p.data_inicio)}
                    </td>
                    <td className="px-5 py-3 text-[var(--color-text-dim)]">
                      {fmtData(p.data_fim)}
                    </td>
                    <td className="px-5 py-3 text-[var(--color-text-dim)]">
                      {diasEntre(p.data_inicio, p.data_fim)} dias
                    </td>
                    <td className="px-5 py-3">
                      {p.ativa ? (
                        <Badge tone="success">Ativa</Badge>
                      ) : (
                        <button
                          onClick={() => ativar(p)}
                          className="text-xs text-[var(--color-brand)] hover:underline"
                        >
                          Ativar
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditar(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remover(p)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
    </div>
  );
}
