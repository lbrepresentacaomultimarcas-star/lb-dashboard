"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  Mail,
  Shield,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { useSession } from "@/lib/store";
import { PAPEL_INFO, type Papel } from "@/lib/types";
import { notify } from "@/lib/notify";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";

type DbProfile = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  vendedor_id: string | null;
  equipe_id: string | null;
  ativo: boolean;
  criado_em: string;
};
type DbEquipe = { id: string; nome: string; cor: string | null };

const PAPEIS: Papel[] = ["admin", "coordenador", "supervisor", "vendedor"];

export default function ColaboradoresPage() {
  const session = useSession();
  const [users, setUsers] = useState<DbProfile[]>([]);
  const [equipes, setEquipes] = useState<DbEquipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [metodo, setMetodo] = useState<"senha" | "email">("senha");
  const [form, setForm] = useState({
    nome: "",
    email: "",
    senha: "",
    papel: "vendedor" as Papel,
    equipeId: "",
  });

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const [u, e] = await Promise.all([
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/admin/equipes").then((r) => r.json()),
      ]);
      if (u.error) throw new Error(u.error);
      setUsers(u.users);
      setEquipes(e.equipes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, []);

  const stats = useMemo(() => {
    const ativos = users.filter((u) => u.ativo).length;
    const inativos = users.filter((u) => !u.ativo).length;
    const semEquipe = users.filter((u) => !u.equipe_id).length;
    const limiteAssentos = 20;
    return {
      ativos,
      inativos,
      semEquipe,
      assentos: Math.max(limiteAssentos - users.length, 0),
      total: users.length,
    };
  }, [users]);

  const filtrados = useMemo(() => {
    if (!busca) return users;
    const q = busca.toLowerCase();
    return users.filter(
      (u) =>
        u.nome.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        PAPEL_INFO[u.papel].label.toLowerCase().includes(q),
    );
  }, [users, busca]);

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          email: form.email,
          papel: form.papel,
          equipeId: form.equipeId || null,
          ...(metodo === "senha" ? { senha: form.senha } : { enviarEmail: true }),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha");
      notify.success(
        "Colaborador adicionado",
        metodo === "email"
          ? `Email enviado para ${form.email}`
          : `${form.email} pode entrar com a senha definida`,
      );
      setOpen(false);
      setForm({ nome: "", email: "", senha: "", papel: "vendedor", equipeId: "" });
      carregar();
    } catch (e) {
      notify.error("Erro ao convidar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  async function mudarPapel(userId: string, papel: Papel) {
    try {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, papel }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify.success("Promoção aplicada", `Agora é ${PAPEL_INFO[papel].label}`);
      carregar();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }
  async function mudarEquipe(userId: string, equipeId: string) {
    try {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, equipeId: equipeId || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify.success("Equipe atualizada");
      carregar();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }
  async function toggleAtivo(u: DbProfile) {
    try {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, ativo: !u.ativo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify.success(u.ativo ? "Desativado" : "Ativado");
      carregar();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }
  async function remover(u: DbProfile) {
    if (!confirm(`Remover ${u.email} permanentemente? Essa ação não pode ser desfeita.`)) return;
    try {
      const r = await fetch(`/api/admin/users?userId=${u.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify.success("Removido");
      carregar();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Gestão de Colaboradores</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Gerencie e acompanhe todos os colaboradores ativos
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Novo Colaborador
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Assentos Restantes"
          value={String(stats.assentos)}
          hint={`${stats.total}/20 em uso`}
          icon={Shield}
          tone="brand"
        />
        <StatCard
          title="Colaboradores Ativos"
          value={String(stats.ativos)}
          icon={UserCheck}
          tone="success"
        />
        <StatCard
          title="Sem Equipe"
          value={String(stats.semEquipe)}
          icon={Users}
          tone="warn"
        />
        <StatCard
          title="Inativos"
          value={String(stats.inativos)}
          icon={UserX}
          tone="danger"
        />
        <StatCard
          title="Total"
          value={String(stats.total)}
          icon={Crown}
          tone="neutral"
        />
      </div>

      {erro && (
        <Card className="border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10">
          <p className="text-sm text-[var(--color-danger)]">{erro}</p>
        </Card>
      )}

      <Card className="p-0">
        <div className="border-b border-[var(--color-border)] p-4">
          <Input
            placeholder="Buscar nome, email ou cargo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-md"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                <th className="px-5 py-3">Colaborador</th>
                <th className="px-5 py-3">Cargo</th>
                <th className="px-5 py-3">Equipe</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Criado</th>
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
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[var(--color-text-dim)]">
                    Nenhum colaborador.
                  </td>
                </tr>
              ) : (
                filtrados.map((u) => {
                  const isMe = u.id === session?.id;
                  const equipe = equipes.find((e) => e.id === u.equipe_id);
                  return (
                    <tr key={u.id} className="hover:bg-[var(--color-surface-2)]/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white"
                            style={{
                              background: `linear-gradient(135deg, hsl(${(u.email.charCodeAt(0) * 7) % 360}, 60%, 50%), rgba(0,0,0,0.5))`,
                            }}
                          >
                            {u.nome.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {u.nome}
                              {isMe && (
                                <Badge tone="brand" className="ml-2">
                                  você
                                </Badge>
                              )}
                            </p>
                            <p className="truncate text-xs text-[var(--color-text-dim)]">
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={u.papel}
                          onChange={(e) => mudarPapel(u.id, e.target.value as Papel)}
                          disabled={isMe}
                          className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-xs disabled:opacity-60"
                        >
                          {PAPEIS.map((p) => (
                            <option key={p} value={p}>
                              {PAPEL_INFO[p].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={u.equipe_id ?? ""}
                          onChange={(e) => mudarEquipe(u.id, e.target.value)}
                          className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-xs"
                        >
                          <option value="">— sem equipe —</option>
                          {equipes.map((eq) => (
                            <option key={eq.id} value={eq.id}>
                              {eq.nome}
                            </option>
                          ))}
                        </select>
                        {equipe && (
                          <span
                            className="ml-2 inline-block h-2 w-2 rounded-full align-middle"
                            style={{ background: equipe.cor ?? "#6366f1" }}
                          />
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={u.ativo ? "success" : "neutral"}>
                          {u.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--color-text-dim)]">
                        {new Date(u.criado_em).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {!isMe && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleAtivo(u)}
                                title={u.ativo ? "Desativar" : "Reativar"}
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => remover(u)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo Colaborador"
        subtitle="Convide alguém pra acessar o sistema"
        icon={<UserPlus className="h-5 w-5" />}
      >
        <form onSubmit={convidar} className="space-y-4">
          <div className="flex gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
            <button
              type="button"
              onClick={() => setMetodo("senha")}
              className={`flex-1 rounded-md px-3 py-2 text-sm transition-colors ${
                metodo === "senha"
                  ? "bg-[var(--color-brand)] text-white"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              }`}
            >
              Criar com senha
            </button>
            <button
              type="button"
              onClick={() => setMetodo("email")}
              className={`flex-1 rounded-md px-3 py-2 text-sm transition-colors ${
                metodo === "email"
                  ? "bg-[var(--color-brand)] text-white"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              }`}
            >
              <Mail className="mr-1 inline h-3.5 w-3.5" />
              Enviar convite por email
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                required
              />
            </div>
          </div>

          {metodo === "senha" && (
            <div>
              <Label htmlFor="senha">Senha inicial</Label>
              <Input
                id="senha"
                type="text"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
              <p className="mt-1 text-xs text-[var(--color-text-dim)]">
                Você passa a senha pro colaborador, ele entra direto.
              </p>
            </div>
          )}
          {metodo === "email" && (
            <p className="rounded-md bg-[var(--color-brand)]/10 px-3 py-2 text-xs text-[var(--color-text-dim)]">
              <Mail className="mr-1 inline h-3.5 w-3.5" />
              O colaborador recebe um link no email pra definir a própria senha.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="papel">Cargo</Label>
              <select
                id="papel"
                value={form.papel}
                onChange={(e) => setForm({ ...form, papel: e.target.value as Papel })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {PAPEL_INFO[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="eq">Equipe (opcional)</Label>
              <select
                id="eq"
                value={form.equipeId}
                onChange={(e) => setForm({ ...form, equipeId: e.target.value })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                <option value="">— sem equipe —</option>
                {equipes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Enviando…" : metodo === "email" ? "Enviar convite" : "Criar colaborador"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
