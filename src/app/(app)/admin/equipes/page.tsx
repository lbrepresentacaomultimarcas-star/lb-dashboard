"use client";

import { useEffect, useMemo, useState } from "react";
import { Crown, Pencil, Plus, Trash2, Users, UsersRound } from "lucide-react";
import { PAPEL_INFO, type Papel } from "@/lib/types";
import { notify } from "@/lib/notify";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";

type DbEquipe = {
  id: string;
  nome: string;
  cor: string | null;
  lider_id: string | null;
  criado_em: string;
};
type DbProfile = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  equipe_id: string | null;
  ativo: boolean;
};

const CORES = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#ec4899", "#84cc16"];

export default function EquipesPage() {
  const [equipes, setEquipes] = useState<DbEquipe[]>([]);
  const [users, setUsers] = useState<DbProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DbEquipe | null>(null);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nome: "", cor: CORES[0], liderId: "" });

  async function carregar() {
    setLoading(true);
    try {
      const [e, u] = await Promise.all([
        fetch("/api/admin/equipes").then((r) => r.json()),
        fetch("/api/admin/users").then((r) => r.json()),
      ]);
      setEquipes(e.equipes ?? []);
      setUsers(u.users ?? []);
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

  const stats = useMemo(() => {
    const totalMembros = users.filter((u) => u.equipe_id).length;
    const semEquipe = users.filter((u) => !u.equipe_id).length;
    const lideres = users.filter(
      (u) => u.papel === "coordenador" || u.papel === "supervisor",
    ).length;
    return { equipes: equipes.length, totalMembros, semEquipe, lideres };
  }, [equipes, users]);

  const filtradas = useMemo(() => {
    if (!busca) return equipes;
    const q = busca.toLowerCase();
    return equipes.filter((e) => e.nome.toLowerCase().includes(q));
  }, [equipes, busca]);

  function abrirNovo() {
    setEditing(null);
    setForm({ nome: "", cor: CORES[Math.floor(Math.random() * CORES.length)], liderId: "" });
    setOpen(true);
  }
  function abrirEditar(e: DbEquipe) {
    setEditing(e);
    setForm({ nome: e.nome, cor: e.cor ?? CORES[0], liderId: e.lider_id ?? "" });
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
        cor: form.cor,
        liderId: form.liderId || null,
      });
      const r = await fetch("/api/admin/equipes", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify.success(editing ? "Equipe atualizada" : "Equipe criada");
      setOpen(false);
      carregar();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }
  async function remover(e: DbEquipe) {
    if (!confirm(`Remover equipe "${e.nome}"? Os membros ficarão sem equipe.`)) return;
    try {
      const r = await fetch(`/api/admin/equipes?id=${e.id}`, { method: "DELETE" });
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
          <h1 className="text-2xl font-semibold">Gerenciamento de Equipes</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Gerencie suas equipes de vendas
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4" />
          Nova Equipe
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Equipes"
          value={String(stats.equipes)}
          icon={UsersRound}
          tone="brand"
        />
        <StatCard
          title="Total de Membros"
          value={String(stats.totalMembros)}
          icon={Users}
          tone="success"
        />
        <StatCard
          title="Sem Equipe"
          value={String(stats.semEquipe)}
          icon={Users}
          tone="danger"
        />
        <StatCard
          title="Líderes Disponíveis"
          value={String(stats.lideres)}
          hint="coordenadores + supervisores"
          icon={Crown}
          tone="warn"
        />
      </div>

      <Card>
        <Input
          placeholder="Buscar equipes ou líderes…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </Card>

      {loading ? (
        <Card>
          <p className="py-8 text-center text-[var(--color-text-dim)]">Carregando…</p>
        </Card>
      ) : filtradas.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <UsersRound className="mb-3 h-10 w-10 text-[var(--color-text-dim)]" />
            <CardTitle>
              {busca ? "Nenhuma equipe encontrada" : "Nenhuma equipe ainda"}
            </CardTitle>
            {!busca && (
              <Button onClick={abrirNovo} className="mt-4">
                <Plus className="h-4 w-4" />
                Criar primeira equipe
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((e) => {
            const lider = users.find((u) => u.id === e.lider_id);
            const membros = users.filter((u) => u.equipe_id === e.id);
            return (
              <Card key={e.id}>
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-10 w-10 place-items-center rounded-lg text-white"
                      style={{ background: e.cor ?? "#6366f1" }}
                    >
                      <UsersRound className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{e.nome}</p>
                      <p className="text-xs text-[var(--color-text-dim)]">
                        {membros.length} {membros.length === 1 ? "membro" : "membros"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(e)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remover(e)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {lider && (
                  <div className="mb-3 flex items-center gap-2 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-xs">
                    <Crown className="h-3.5 w-3.5 text-[var(--color-warn)]" />
                    <span className="font-medium">{lider.nome}</span>
                    <Badge tone={PAPEL_INFO[lider.papel].tone}>
                      {PAPEL_INFO[lider.papel].label}
                    </Badge>
                  </div>
                )}

                {membros.length > 0 ? (
                  <div className="space-y-1">
                    {membros.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between text-xs text-[var(--color-text-dim)]"
                      >
                        <span className="truncate">{m.nome}</span>
                        <Badge tone={PAPEL_INFO[m.papel].tone}>
                          {PAPEL_INFO[m.papel].label}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-dim)]">
                    Sem membros. Atribua em Colaboradores.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar Equipe" : "Nova Equipe"}
        subtitle="Defina nome, cor e líder"
        icon={<UsersRound className="h-5 w-5" />}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome da equipe</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Time Norte, Time Carros…"
              required
            />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, cor: c })}
                  className={`h-8 w-8 rounded-full transition-all ${
                    form.cor === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--color-surface)]" : ""
                  }`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="lider">Líder (opcional)</Label>
            <select
              id="lider"
              value={form.liderId}
              onChange={(e) => setForm({ ...form, liderId: e.target.value })}
              className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
            >
              <option value="">— sem líder —</option>
              {users
                .filter((u) => u.papel === "admin" || u.papel === "coordenador" || u.papel === "supervisor")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} — {PAPEL_INFO[u.papel].label}
                  </option>
                ))}
            </select>
          </div>
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
