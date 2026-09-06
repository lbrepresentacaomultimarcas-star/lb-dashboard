"use client";

import { useEffect, useMemo, useState } from "react";
import { Crown, Pencil, Plus, Search, Trash2, Users, UsersRound } from "lucide-react";
import { PAPEL_INFO, type Papel } from "@/lib/types";
import { notify } from "@/lib/notify";
import { useRefreshTick } from "@/lib/refresh";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { Avatar } from "@/components/avatar";
import { PremiumStage } from "@/components/premium-stage";
import { AnimatedNum } from "@/components/ui/spark";

type DbEquipe = {
  id: string;
  nome: string;
  cor: string | null;
  lider_id: string | null;
  supervisor_id: string | null;
  representante_id: string | null;
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

/** Cor neon do papel pra badges. */
function papelTone(p: Papel): string {
  switch (p) {
    case "admin":
      return "#FACC15";
    case "coordenador":
      return "#7C3AED";
    case "supervisor":
      return "#3B82F6";
    default:
      return "#22C55E";
  }
}

function PapelBadge({ papel }: { papel: Papel }) {
  const tc = papelTone(papel);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={{
        color: tc,
        borderColor: `${tc}55`,
        background: `${tc}1a`,
        boxShadow: papel === "admin" ? "0 0 12px -3px #FACC15" : undefined,
      }}
    >
      {papel === "admin" && <Crown className="h-2.5 w-2.5" />}
      {PAPEL_INFO[papel].label}
    </span>
  );
}

/**
 * Um degrau da cadeia de comando.
 *
 * Só oferece quem tem o cargo daquele degrau. Mas quem JÁ ESTÁ apontado
 * continua na lista mesmo depois de mudar de cargo, marcado como "cargo
 * mudou" — some-lo em silêncio faria o organograma parecer certo enquanto
 * o campo estaria, na prática, vazio. Quem promoveu precisa ver que ficou
 * uma ponta solta para arrumar.
 */
function CampoChefia({
  id, rotulo, vazio, valor, onChange, elegivel, users,
}: {
  id: string;
  rotulo: string;
  vazio: string;
  valor: string;
  onChange: (v: string) => void;
  elegivel: (u: DbProfile) => boolean;
  users: DbProfile[];
}) {
  const aptos = users.filter(elegivel);
  const atual = users.find((u) => u.id === valor);
  const saiuDoCargo = !!atual && !elegivel(atual);

  return (
    <div>
      <Label htmlFor={id}>{rotulo}</Label>
      <select
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
      >
        <option value="">{vazio}</option>
        {saiuDoCargo && atual && (
          <option value={atual.id}>
            {atual.nome} — agora {PAPEL_INFO[atual.papel].label}
          </option>
        )}
        {aptos.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nome} — {PAPEL_INFO[u.papel].label}
          </option>
        ))}
      </select>
      {saiuDoCargo && atual && (
        <p className="mt-1 text-[11px] text-amber-300">
          {atual.nome} mudou de cargo e não ocupa mais esta função. Escolha outra pessoa.
        </p>
      )}
      {!saiuDoCargo && aptos.length === 0 && (
        <p className="mt-1 text-[11px] text-[var(--color-muted)]">
          Ninguém com esse cargo ainda. Defina o cargo em Administrativo → Colaboradores.
        </p>
      )}
    </div>
  );
}

export default function EquipesPage() {
  const [equipes, setEquipes] = useState<DbEquipe[]>([]);
  const [users, setUsers] = useState<DbProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DbEquipe | null>(null);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nome: "", cor: CORES[0], liderId: "", supervisorId: "", representanteId: "" });
  const refreshTick = useRefreshTick();

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
  }, [refreshTick]);

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
    setForm({ nome: "", cor: CORES[Math.floor(Math.random() * CORES.length)], liderId: "", supervisorId: "", representanteId: "" });
    setOpen(true);
  }
  function abrirEditar(e: DbEquipe) {
    setEditing(e);
    setForm({ nome: e.nome, cor: e.cor ?? CORES[0], liderId: e.lider_id ?? "", supervisorId: e.supervisor_id ?? "", representanteId: e.representante_id ?? "" });
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
        supervisorId: form.supervisorId || null,
        representanteId: form.representanteId || null,
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

  const kpis = [
    { label: "Equipes", value: stats.equipes, icon: UsersRound, color: "#2563FF" },
    { label: "Total de Membros", value: stats.totalMembros, icon: Users, color: "#22C55E" },
    { label: "Sem Equipe", value: stats.semEquipe, icon: Users, color: "#f43f5e" },
    { label: "Líderes Disponíveis", value: stats.lideres, icon: Crown, color: "#FACC15" },
  ];

  return (
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#7C3AED" }}>
            <UsersRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Gerenciamento de Equipes
            </h1>
            <p className="text-sm text-white/55">Gerencie suas equipes de vendas</p>
          </div>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4" />
          Nova Equipe
        </Button>
      </header>

      {/* KPIs com contadores animados + ícone neon flutuando */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <span className="lb-orb lb-float h-10 w-10" style={{ ["--orb" as string]: k.color }}>
              <k.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[11px] uppercase tracking-wider text-white/55">{k.label}</p>
            <AnimatedNum value={k.value} className="block text-2xl font-extrabold tabular-nums text-white" />
          </div>
        ))}
      </div>

      {/* Busca glass premium */}
      <div className="lb-fade-up relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <input
          placeholder="Buscar equipes…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] pl-10 pr-3 text-sm text-white outline-none backdrop-blur transition-all duration-200 placeholder:text-white/35 focus:border-[#3B82F6] focus:bg-[#3B82F6]/10 focus:shadow-[0_0_0_1px_rgba(59,130,246,.5),0_0_24px_-6px_rgba(59,130,246,.7)]"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="lb-card-premium h-48 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="lb-card-premium lb-fade-up rounded-2xl">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="lb-orb mb-3 h-12 w-12" style={{ ["--orb" as string]: "#7C3AED" }}>
              <UsersRound className="h-6 w-6" />
            </span>
            <p className="text-base font-bold text-white">
              {busca ? "Nenhuma equipe encontrada" : "Nenhuma equipe ainda"}
            </p>
            {!busca && (
              <Button onClick={abrirNovo} className="mt-4">
                <Plus className="h-4 w-4" />
                Criar primeira equipe
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((e, i) => {
            const lider = users.find((u) => u.id === e.lider_id);
            const membros = users.filter((u) => u.equipe_id === e.id);
            const cor = e.cor ?? "#6366f1";
            return (
              <div
                key={e.id}
                className="lb-card-premium lb-fade-up relative overflow-hidden rounded-2xl p-5"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {/* glow ambiente da cor da equipe */}
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-40 blur-2xl"
                  style={{ background: cor }}
                />
                {/* linha luminosa superior */}
                <div
                  className="pointer-events-none absolute inset-x-4 top-0 h-px"
                  style={{ background: `linear-gradient(90deg,transparent,${cor},transparent)`, boxShadow: `0 0 8px ${cor}` }}
                />

                <div className="relative">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white"
                        style={{ background: cor, boxShadow: `0 0 20px -4px ${cor}` }}
                      >
                        <UsersRound className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-white">{e.nome}</p>
                        <p className="text-xs text-white/50">
                          {membros.length} {membros.length === 1 ? "membro" : "membros"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => abrirEditar(e)}
                        title="Editar"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[#3B82F6]/40 bg-[#3B82F6]/15 text-[#7aa2ff] transition-transform duration-150 hover:scale-110 hover:bg-[#3B82F6]/25"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => remover(e)}
                        title="Excluir"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 transition-transform duration-150 hover:scale-110 hover:bg-rose-500/25"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {lider && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                      <span
                        className="inline-grid shrink-0 place-items-center rounded-full p-0.5"
                        style={{ boxShadow: "0 0 0 2px #FACC15, 0 0 12px -2px #FACC15" }}
                      >
                        <Avatar id={lider.id} nome={lider.nome} size={26} />
                      </span>
                      <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">{lider.nome}</span>
                      <PapelBadge papel={lider.papel} />
                    </div>
                  )}

                  {membros.length > 0 ? (
                    <div className="lb-scroll max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {membros.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/[0.05]"
                        >
                          <Avatar id={m.id} nome={m.nome} size={24} />
                          <span className="min-w-0 flex-1 truncate text-xs text-white/80">{m.nome}</span>
                          <PapelBadge papel={m.papel} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-white/40">Sem membros. Atribua em Colaboradores.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar Equipe" : "Nova Equipe"}
        subtitle="Defina nome, cor, supervisor e líder"
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
          {/* CADEIA DE COMANDO
              Representante → Supervisor → Líder → Vendedores.

              Cada campo lista SÓ quem tem aquele cargo. Antes os três
              ofereciam a mesma lista frouxa (admin, representante, supervisor
              e líder em todos), então dava para pôr um líder no lugar do
              supervisor e o organograma virava ficção.

              A elegibilidade sai do cargo ATUAL: promoveu alguém de Líder
              para Supervisor, ele sai de uma lista e entra na outra sozinho.

              ISTO É ORGANOGRAMA, NÃO PERMISSÃO — quem manda no que a pessoa
              pode fazer continua sendo o cargo dela, não este campo. */}
          <div className="space-y-3 rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Cadeia de comando
            </p>
            <CampoChefia
              id="representante"
              rotulo="Administrativo / Representante"
              vazio="— sem representante —"
              valor={form.representanteId}
              onChange={(v) => setForm({ ...form, representanteId: v })}
              elegivel={(u) => u.papel === "admin" || u.papel === "coordenador"}
              users={users}
            />
            <CampoChefia
              id="supervisor"
              rotulo="Supervisor"
              vazio="— sem supervisor —"
              valor={form.supervisorId}
              onChange={(v) => setForm({ ...form, supervisorId: v })}
              elegivel={(u) => u.papel === "supervisor"}
              users={users}
            />
            <CampoChefia
              id="lider"
              rotulo="Líder"
              vazio="— sem líder —"
              valor={form.liderId}
              onChange={(v) => setForm({ ...form, liderId: v })}
              elegivel={(u) => u.papel === "lider"}
              users={users}
            />
            <p className="text-[11px] text-[var(--color-text-dim)]">
              Os vendedores da equipe entram pelo cadastro de cada colaborador, em Administrativo →
              Colaboradores.
            </p>
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
    </PremiumStage>
  );
}
