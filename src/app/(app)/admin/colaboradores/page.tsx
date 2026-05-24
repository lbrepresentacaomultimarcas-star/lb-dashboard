"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  Mail,
  Search,
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
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { PremiumStage } from "@/components/premium-stage";
import { AnimatedNum } from "@/components/ui/spark";

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
const selCls =
  "h-8 rounded-md border border-white/12 bg-white/5 px-2 text-xs text-white outline-none focus:border-[#3B82F6] disabled:opacity-60";

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

  const kpis = [
    { label: "Assentos restantes", value: stats.assentos, hint: `${stats.total}/20 em uso`, icon: Shield, color: "#3B82F6" },
    { label: "Colaboradores ativos", value: stats.ativos, icon: UserCheck, color: "#22C55E" },
    { label: "Sem equipe", value: stats.semEquipe, icon: Users, color: "#FACC15" },
    { label: "Inativos", value: stats.inativos, icon: UserX, color: "#f43f5e" },
    { label: "Total", value: stats.total, icon: Crown, color: "#7C3AED" },
  ];

  return (
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#2563FF" }}>
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Gestão de Colaboradores
            </h1>
            <p className="text-sm text-white/55">Gerencie e acompanhe todos os colaboradores</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Novo Colaborador
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k, i) => (
          <div key={k.label} className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4" style={{ animationDelay: `${i * 0.05}s` }}>
            <span className="lb-orb h-10 w-10" style={{ ["--orb" as string]: k.color }}>
              <k.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[11px] uppercase tracking-wider text-white/55">{k.label}</p>
            <AnimatedNum value={k.value} className="block text-2xl font-extrabold tabular-nums text-white" />
            {k.hint && <p className="text-[11px] text-white/40">{k.hint}</p>}
          </div>
        ))}
      </div>

      {erro && (
        <div className="lb-fade-up rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
          <p className="text-sm text-rose-300">{erro}</p>
        </div>
      )}

      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              placeholder="Buscar nome, email ou cargo…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-10 w-full rounded-xl border border-white/12 bg-white/[0.04] pl-9 pr-3 text-sm text-white outline-none backdrop-blur transition-all duration-200 placeholder:text-white/35 focus:border-[#3B82F6] focus:bg-[#3B82F6]/10 focus:shadow-[0_0_0_1px_rgba(59,130,246,.5),0_0_24px_-6px_rgba(59,130,246,.7)]"
            />
          </div>
        </div>
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Colaborador</th>
                <th className="px-5 py-3">Cargo</th>
                <th className="px-5 py-3">Equipe</th>
                <th className="px-5 py-3">Status</th>
                <th className="hidden px-5 py-3 lg:table-cell">Criado</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-3">
                      <div className="h-8 w-full animate-pulse rounded-lg bg-white/5" />
                    </td>
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-white/45">
                    Nenhum colaborador.
                  </td>
                </tr>
              ) : (
                filtrados.map((u) => {
                  const isMe = u.id === session?.id;
                  const equipe = equipes.find((e) => e.id === u.equipe_id);
                  const sc = u.ativo ? "#22C55E" : "rgba(255,255,255,.4)";
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-white/[0.05]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                            style={{
                              background: `linear-gradient(135deg, hsl(${(u.email.charCodeAt(0) * 7) % 360}, 60%, 50%), rgba(0,0,0,0.5))`,
                            }}
                          >
                            {u.nome.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate font-medium text-white">
                              {u.nome}
                              {isMe && (
                                <span className="rounded-full border border-[#2563FF]/50 bg-[#2563FF]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#7aa2ff]">
                                  você
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-white/45">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={u.papel}
                          onChange={(e) => mudarPapel(u.id, e.target.value as Papel)}
                          disabled={isMe}
                          className={selCls}
                        >
                          {PAPEIS.map((p) => (
                            <option key={p} value={p} className="bg-[#0b0d16]">
                              {PAPEL_INFO[p].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={u.equipe_id ?? ""}
                            onChange={(e) => mudarEquipe(u.id, e.target.value)}
                            className={selCls}
                          >
                            <option value="" className="bg-[#0b0d16]">— sem equipe —</option>
                            {equipes.map((eq) => (
                              <option key={eq.id} value={eq.id} className="bg-[#0b0d16]">
                                {eq.nome}
                              </option>
                            ))}
                          </select>
                          {equipe && (
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ background: equipe.cor ?? "#6366f1", boxShadow: `0 0 6px ${equipe.cor ?? "#6366f1"}` }}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={{ color: sc, borderColor: `${sc}66`, background: `${sc}1a` }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: sc, boxShadow: `0 0 6px ${sc}` }} />
                          {u.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="hidden px-5 py-3 text-xs text-white/45 lg:table-cell">
                        {new Date(u.criado_em).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1.5">
                          {!isMe && (
                            <>
                              <button
                                onClick={() => toggleAtivo(u)}
                                title={u.ativo ? "Desativar" : "Reativar"}
                                className="grid h-8 w-8 place-items-center rounded-lg border border-amber-400/40 bg-amber-400/15 text-amber-300 transition-transform duration-150 hover:scale-110 hover:bg-amber-400/25"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => remover(u)}
                                title="Remover"
                                className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 transition-transform duration-150 hover:scale-110 hover:bg-rose-500/25"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
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
      </div>

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
    </PremiumStage>
  );
}
