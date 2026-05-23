"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  CalendarClock,
  Car,
  CheckCircle2,
  Clock,
  Construction,
  FileText,
  GripVertical,
  Home,
  MessageCircle,
  MoreVertical,
  Mountain,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Share2,
  Sparkles,
  Trash2,
  TrendingUp,
  Trophy,
  Truck,
  Users,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { leadsApi, useLeads, useSession, useVendedores } from "@/lib/store";
import { temPermissao } from "@/lib/permissions";
import { Avatar } from "@/components/avatar";
import {
  LEAD_STATUS_INFO,
  LEAD_TIPO_INFO,
  type Lead,
  type LeadStatus,
  type LeadTipo,
} from "@/lib/types";
import { brl, cn, formatNumBR, parseNumBR, pct } from "@/lib/utils";
import { useCountUp } from "@/lib/use-count-up";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";

const STATUS_ORDER: LeadStatus[] = [
  "oportunidade",
  "primeiro_contato",
  "reuniao_agendada",
  "reuniao",
  "acompanhamento",
  "fechamento",
  "perdido",
];

type StageTone = {
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
};
const STATUS_TONE: Record<LeadStatus, StageTone> = {
  oportunidade: { color: "#6366f1", icon: Sparkles },
  primeiro_contato: { color: "#0ea5e9", icon: Phone },
  reuniao_agendada: { color: "#06b6d4", icon: CalendarClock },
  reuniao: { color: "#f59e0b", icon: Users },
  acompanhamento: { color: "#f97316", icon: Activity },
  fechamento: { color: "#22c55e", icon: Trophy },
  perdido: { color: "#f43f5e", icon: XCircle },
};

const TIPO_ORDER: LeadTipo[] = [
  "imovel",
  "carro",
  "moto",
  "caminhao",
  "terreno",
  "maquinario",
  "servico",
];
const TIPO_ICON: Record<LeadTipo, React.ComponentType<{ className?: string }>> = {
  imovel: Home,
  carro: Car,
  moto: Sparkles, // sem ícone de moto específico no lucide, usa Sparkles como placeholder
  caminhao: Truck,
  terreno: Mountain,
  maquinario: Construction,
  servico: Wrench,
};

type FormState = {
  nome: string;
  telefone: string;
  tipo: LeadTipo | "";
  valorEstimado: string;
  status: LeadStatus;
  vendedorId: string;
  email: string;
  origem: string;
  observacao: string;
};

const empty: FormState = {
  nome: "",
  telefone: "",
  tipo: "",
  valorEstimado: "",
  status: "oportunidade",
  vendedorId: "",
  email: "",
  origem: "",
  observacao: "",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}m`;
  return `${Math.floor(months / 12)}a`;
}

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}
function waLink(telefone: string) {
  const d = onlyDigits(telefone);
  if (!d) return null;
  const numero = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${numero}`;
}
function telLink(telefone: string) {
  const d = onlyDigits(telefone);
  return d ? `tel:+${d.startsWith("55") ? d : "55" + d}` : null;
}

function AnimatedBRL({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{brl(v)}</span>;
}

function Metric({
  icon: Icon,
  label,
  value,
  color = "#a5b4fc",
  glow = false,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: React.ReactNode;
  color?: string;
  glow?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{ background: `${color}1f`, boxShadow: glow ? `0 0 18px -2px ${color}` : undefined }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-white/45">{label}</p>
        <p className="truncate text-base font-bold text-white tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const leads = useLeads();
  const vendedores = useVendedores();
  const session = useSession();
  const gestor = temPermissao(session, "supervisor");
  const [filtroVendedor, setFiltroVendedor] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [salvando, setSalvando] = useState(false);
  const [compartilhar, setCompartilhar] = useState<Lead | null>(null);
  const [novoVendedorId, setNovoVendedorId] = useState("");
  // drag & drop entre etapas
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<LeadStatus | null>(null);

  const filtrados = useMemo(
    () =>
      filtroVendedor === "todos"
        ? leads
        : filtroVendedor === "sem-vendedor"
          ? leads.filter((l) => !l.vendedorId)
          : leads.filter((l) => l.vendedorId === filtroVendedor),
    [leads, filtroVendedor],
  );

  const colunas = useMemo(() => {
    const grupos: Record<LeadStatus, Lead[]> = {
      oportunidade: [],
      primeiro_contato: [],
      reuniao_agendada: [],
      reuniao: [],
      acompanhamento: [],
      fechamento: [],
      perdido: [],
    };
    for (const l of filtrados) grupos[l.status].push(l);
    return grupos;
  }, [filtrados]);

  const totais = useMemo(
    () =>
      STATUS_ORDER.reduce(
        (acc, s) => ({
          ...acc,
          [s]: colunas[s].reduce((a, l) => a + l.valorEstimado, 0),
        }),
        {} as Record<LeadStatus, number>,
      ),
    [colunas],
  );

  const metrics = useMemo(() => {
    const valorTotal = filtrados.reduce((a, l) => a + l.valorEstimado, 0);
    const totalNegocios = filtrados.length;
    const ganhos = colunas.fechamento.length;
    const taxaConversao = totalNegocios > 0 ? (ganhos / totalNegocios) * 100 : 0;
    const ticketMedio = totalNegocios > 0 ? valorTotal / totalNegocios : 0;
    const fechados = colunas.fechamento;
    const cicloMedio =
      fechados.length > 0
        ? fechados.reduce((a, l) => {
            const ini = new Date(l.criadoEm).getTime();
            const fim = new Date(l.atualizadoEm ?? l.criadoEm).getTime();
            return a + Math.max(0, (fim - ini) / 86_400_000);
          }, 0) / fechados.length
        : 0;
    return { valorTotal, totalNegocios, ganhos, taxaConversao, ticketMedio, cicloMedio };
  }, [filtrados, colunas]);

  const maxCount = Math.max(...STATUS_ORDER.map((s) => colunas[s].length), 1);

  function abrirNovo(status?: LeadStatus) {
    setEditing(null);
    // Vendedor: já vincula a si mesmo. Gestor: escolhe no dropdown.
    setForm({
      ...empty,
      status: status ?? "oportunidade",
      vendedorId: !gestor && session?.vendedorId ? session.vendedorId : "",
    });
    setOpen(true);
  }
  function abrirEditar(l: Lead) {
    setEditing(l);
    setForm({
      nome: l.nome,
      telefone: l.telefone,
      tipo: l.tipo ?? "",
      valorEstimado: formatNumBR(l.valorEstimado),
      status: l.status,
      vendedorId: l.vendedorId ?? "",
      email: l.email,
      origem: l.origem ?? "",
      observacao: l.observacao ?? "",
    });
    setOpen(true);
  }
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      notify.error("Informe o nome do contato");
      return;
    }
    if (!form.telefone.trim()) {
      notify.error("Informe o telefone do contato");
      return;
    }
    if (!form.tipo) {
      notify.error("Selecione o tipo de negócio");
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        telefone: form.telefone.trim(),
        valorEstimado: parseNumBR(form.valorEstimado),
        status: form.status,
        tipo: form.tipo as LeadTipo,
        vendedorId: form.vendedorId || undefined,
        origem: form.origem.trim() || undefined,
        observacao: form.observacao.trim() || undefined,
      };
      if (editing) {
        await leadsApi.update(editing.id, payload);
        notify.success("Negócio atualizado");
      } else {
        await leadsApi.add(payload);
        notify.success("Negócio criado", `${payload.nome} adicionado em ${LEAD_STATUS_INFO[payload.status].label}`);
      }
      setOpen(false);
    } catch (e) {
      notify.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }
  async function remover(l: Lead) {
    if (!confirm(`Remover ${l.nome}?`)) return;
    try {
      await leadsApi.remove(l.id);
      notify.success("Removido");
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }
  async function mudarStatus(l: Lead, status: LeadStatus) {
    // Pra fechar (gerar venda) o lead PRECISA de vendedor definido
    if (status === "fechamento" && !l.vendedorId) {
      notify.error(
        "Defina o vendedor antes de fechar",
        "Use ⋮ → Compartilhar pra atribuir um vendedor — a comissão vai pra ele.",
      );
      return;
    }
    try {
      await leadsApi.update(l.id, { status });
      if (status === "fechamento") {
        notify.success(
          "Negócio fechado! 🎉",
          "Venda gerada automaticamente — financeiro, comissão e ranking atualizados.",
        );
      } else {
        notify.success(`Movido para ${LEAD_STATUS_INFO[status].label}`);
      }
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }

  function soltarNaColuna(s: LeadStatus) {
    const id = dragId;
    setOverCol(null);
    setDragId(null);
    if (!id) return;
    const l = leads.find((x) => x.id === id);
    if (l && l.status !== s) mudarStatus(l, s);
  }

  function abrirCompartilhar(l: Lead) {
    setCompartilhar(l);
    setNovoVendedorId(l.vendedorId ?? "");
  }
  async function confirmarCompartilhar() {
    if (!compartilhar) return;
    if (!novoVendedorId) {
      notify.error("Selecione um vendedor");
      return;
    }
    if (novoVendedorId === compartilhar.vendedorId) {
      notify.info("Já é o vendedor responsável");
      return;
    }
    try {
      await leadsApi.update(compartilhar.id, { vendedorId: novoVendedorId });
      const novo = vendedores.find((v) => v.id === novoVendedorId);
      notify.success(`Negócio transferido para ${novo?.nome ?? "vendedor"}`);
      setCompartilhar(null);
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <div
      className="-m-4 md:-m-6 relative min-h-[calc(100vh-4rem)] overflow-hidden p-4 md:p-6 pb-24 md:pb-6"
      style={{
        background:
          "radial-gradient(ellipse at 20% 0%, rgba(99,102,241,0.16), transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(168,85,247,0.14), transparent 55%), #06070d",
      }}
    >
      {/* estrelas */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 60% 70%, #fff, transparent), radial-gradient(1.5px 1.5px at 80% 20%, rgba(255,255,255,.7), transparent), radial-gradient(1px 1px at 40% 80%, #fff, transparent), radial-gradient(2px 2px at 10% 60%, rgba(255,255,255,.8), transparent)",
          backgroundSize: "300px 300px, 400px 400px, 500px 500px, 350px 350px, 450px 450px",
        }}
      />
      {/* blobs de luz */}
      <div className="lb-drift pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.32), transparent 70%)" }} />
      <div className="lb-drift pointer-events-none absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.28), transparent 70%)", animationDelay: "5s" }} />
      {/* grid futurista (reflexo no chão) */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64 opacity-20"
        style={{
          backgroundImage: "linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to top, #000, transparent)",
          WebkitMaskImage: "linear-gradient(to top, #000, transparent)",
          transform: "perspective(420px) rotateX(60deg)",
          transformOrigin: "bottom",
        }}
      />
      {/* partículas de luz subindo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="lb-rise absolute rounded-full"
            style={{
              left: `${(i * 7.1 + 4) % 100}%`,
              bottom: `${(i % 5) * 9}%`,
              width: i % 3 === 0 ? 4 : 2,
              height: i % 3 === 0 ? 4 : 2,
              background: i % 2 === 0 ? "rgba(129,140,248,.8)" : "rgba(168,85,247,.8)",
              boxShadow: i % 2 === 0 ? "0 0 8px rgba(129,140,248,.7)" : "0 0 8px rgba(168,85,247,.7)",
              animationDuration: `${8 + (i % 5) * 1.7}s`,
              animationDelay: `${(i % 7) * 0.9}s`,
            }}
          />
        ))}
      </div>
      {/* vinheta — mais contraste */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 30%, transparent 42%, rgba(0,0,0,0.5) 100%)" }}
      />

      <div className="relative space-y-5">
        {/* ===================== HEADER PREMIUM ===================== */}
        <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="grid h-11 w-11 place-items-center rounded-xl"
              style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)", boxShadow: "0 0 26px -4px rgba(129,140,248,.8)" }}
            >
              <Briefcase className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Pipeline de Negócios</h1>
              <p className="text-sm text-white/55">
                {metrics.totalNegocios} negócios · <span className="text-emerald-400">{brl(metrics.valorTotal)}</span> estimado
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {gestor && (
              <select
                value={filtroVendedor}
                onChange={(e) => setFiltroVendedor(e.target.value)}
                className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white backdrop-blur"
              >
                <option className="bg-[#0b0d16]" value="todos">Todos vendedores</option>
                <option className="bg-[#0b0d16]" value="sem-vendedor">Sem vendedor</option>
                {vendedores.map((v) => (
                  <option className="bg-[#0b0d16]" key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </select>
            )}
            <Button onClick={() => abrirNovo()}>
              <Plus className="h-4 w-4" />
              Criar negócio
            </Button>
          </div>
        </header>

        {/* ===================== KANBAN ===================== */}
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-flow-col gap-4" style={{ gridAutoColumns: "minmax(280px, 1fr)" }}>
            {STATUS_ORDER.map((s, ci) => {
              const info = LEAD_STATUS_INFO[s];
              const tone = STATUS_TONE[s];
              const StageIcon = tone.icon;
              const items = colunas[s];
              const isOver = overCol === s;
              return (
                <div
                  key={s}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overCol !== s) setOverCol(s);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    soltarNaColuna(s);
                  }}
                  className="lb-fade-up relative flex min-h-[440px] flex-col rounded-2xl border transition-shadow duration-300"
                  style={{
                    animationDelay: `${ci * 0.05}s`,
                    background: `linear-gradient(180deg, ${tone.color}14, rgba(255,255,255,0.018))`,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    borderColor: isOver ? tone.color : `${tone.color}3a`,
                    boxShadow: isOver
                      ? `0 0 50px -6px ${tone.color}, inset 0 1px 0 rgba(255,255,255,.08)`
                      : `0 10px 40px -16px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.05)`,
                  }}
                >
                  {/* borda luminosa superior */}
                  <div
                    className="pointer-events-none absolute inset-x-3 top-0 h-px"
                    style={{ background: `linear-gradient(90deg, transparent, ${tone.color}, transparent)`, boxShadow: `0 0 8px ${tone.color}` }}
                  />

                  {/* header da coluna */}
                  <div
                    className="flex items-center justify-between gap-2 rounded-t-2xl border-b px-3 py-3"
                    style={{ borderColor: `${tone.color}26`, background: `linear-gradient(180deg, ${tone.color}26, transparent)` }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                        style={{ background: `${tone.color}26`, boxShadow: `0 0 16px -2px ${tone.color}` }}
                      >
                        <StageIcon className="h-4 w-4" style={{ color: tone.color }} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold uppercase tracking-wider text-white">
                          {info.label}
                          <span className="ml-1 text-white/45">({items.length})</span>
                        </p>
                        <p className="text-[10px] text-white/55 tabular-nums">{brl(totais[s])}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => abrirNovo(s)}
                      className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                      title="Adicionar nesta etapa"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* corpo da coluna */}
                  <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
                    {items.map((l, i) => {
                      const vendedor = vendedores.find((v) => v.id === l.vendedorId);
                      const wa = waLink(l.telefone);
                      const tel = telLink(l.telefone);
                      const TipoIcon = l.tipo ? TIPO_ICON[l.tipo] : Building2;
                      const tipoLabel = l.tipo ? LEAD_TIPO_INFO[l.tipo].label : "Negócio";
                      const fechado = l.status === "fechamento";
                      return (
                        <div key={l.id} className="lb-fade-up" style={{ animationDelay: `${i * 0.04}s` }}>
                          <div
                            data-lead-card
                            className={cn(
                              "lb-podium-card group relative rounded-xl border py-3 pl-4 pr-3 transition-all",
                              dragId === l.id ? "opacity-40" : "",
                            )}
                            style={{
                              background: "linear-gradient(160deg, rgba(255,255,255,0.075), rgba(255,255,255,0.02))",
                              borderColor: fechado ? "rgba(34,197,94,.45)" : "rgba(255,255,255,.1)",
                              boxShadow: fechado
                                ? "0 10px 26px -12px rgba(0,0,0,.7), 0 0 22px -8px rgba(34,197,94,.6), inset 0 1px 0 rgba(255,255,255,.08)"
                                : "0 10px 26px -12px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.08)",
                            }}
                          >
                            {/* reflexo holográfico (clipa só o card, não corta o dropdown) */}
                            <span className="lb-holo pointer-events-none absolute inset-0 rounded-xl" aria-hidden />
                            {/* acento de status (cor da etapa) */}
                            <span
                              className="pointer-events-none absolute inset-y-2 left-0 w-1 rounded-full"
                              style={{ background: tone.color, boxShadow: `0 0 10px ${tone.color}` }}
                            />

                            {/* topo: grip + tipo + tempo */}
                            <div className="mb-1.5 flex items-start justify-between gap-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", l.id);
                                    const card = e.currentTarget.closest("[data-lead-card]");
                                    if (card) e.dataTransfer.setDragImage(card as Element, 24, 24);
                                    setDragId(l.id);
                                  }}
                                  onDragEnd={() => {
                                    setDragId(null);
                                    setOverCol(null);
                                  }}
                                  className="-ml-1 shrink-0 cursor-grab rounded p-0.5 text-white/25 transition-colors hover:text-white/70 active:cursor-grabbing"
                                  title="Arraste para mover de etapa"
                                  aria-label="Mover negócio"
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </button>
                                <TipoIcon className="h-3.5 w-3.5 text-white/45" />
                                <span className="truncate text-[10px] uppercase tracking-wider text-white/50">
                                  {tipoLabel}
                                </span>
                                {fechado && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                                    ✓ Venda
                                  </span>
                                )}
                              </div>
                              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-white/40">
                                {timeAgo(l.criadoEm)}
                              </span>
                            </div>

                            {/* nome + origem (badge) */}
                            <button
                              type="button"
                              onClick={() => abrirEditar(l)}
                              className="block w-full text-left"
                            >
                              <p className="truncate text-sm font-semibold text-white hover:underline">
                                {l.nome}
                              </p>
                            </button>
                            {l.origem && (
                              <span className="mt-1 inline-flex max-w-full items-center truncate rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/55">
                                {l.origem}
                              </span>
                            )}

                            {l.telefone && (
                              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-white/55">
                                <Phone className="h-3 w-3 text-emerald-400" />
                                <span className="truncate">{l.telefone}</span>
                              </div>
                            )}

                            {/* vendedor (avatar + badge) */}
                            <div className="mt-2 flex items-center justify-between gap-2">
                              {vendedor ? (
                                <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-0.5 pl-0.5 pr-2">
                                  <Avatar id={vendedor.id} nome={vendedor.nome} size={20} />
                                  <span className="truncate text-xs font-medium text-white">
                                    {vendedor.nome}
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                                  Sem vendedor
                                </span>
                              )}
                              {l.atualizadoEm && (
                                <span className="shrink-0 text-[10px] text-white/35">
                                  {timeAgo(l.atualizadoEm)}
                                </span>
                              )}
                            </div>

                            {/* rodapé: ações + valor */}
                            <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2.5">
                              <div className="flex items-center gap-1">
                                {tel && (
                                  <a
                                    href={tel}
                                    className="rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-emerald-300"
                                    title="Ligar"
                                  >
                                    <Phone className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                {wa && (
                                  <a
                                    href={wa}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-emerald-300"
                                    title="WhatsApp"
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                <Dropdown
                                  trigger={<MoreVertical className="h-3.5 w-3.5" />}
                                  align="start"
                                  width={260}
                                  header={
                                    <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs">
                                      <p className="font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                                        Ações
                                      </p>
                                      <p className="mt-0.5 truncate text-[var(--color-text)]">
                                        {l.nome}
                                        {l.tipo && ` · ${LEAD_TIPO_INFO[l.tipo].label}`}
                                        {l.valorEstimado > 0 && ` · ${brl(l.valorEstimado)}`}
                                      </p>
                                    </div>
                                  }
                                >
                                  {(close) => (
                                    <>
                                      <DropdownItem
                                        icon={<Pencil className="h-4 w-4" />}
                                        onClick={() => {
                                          abrirEditar(l);
                                          close();
                                        }}
                                      >
                                        Editar
                                      </DropdownItem>
                                      {wa && (
                                        <DropdownItem
                                          icon={<MessageCircle className="h-4 w-4 text-[var(--color-success)]" />}
                                          hint={l.telefone}
                                          onClick={() => {
                                            window.open(wa, "_blank");
                                            close();
                                          }}
                                        >
                                          WhatsApp
                                        </DropdownItem>
                                      )}
                                      {tel && (
                                        <DropdownItem
                                          icon={<Phone className="h-4 w-4 text-[var(--color-success)]" />}
                                          hint={l.telefone}
                                          onClick={() => {
                                            window.location.href = tel;
                                            close();
                                          }}
                                        >
                                          Telefone
                                        </DropdownItem>
                                      )}
                                      <DropdownItem
                                        icon={<FileText className="h-4 w-4" />}
                                        disabled
                                        hint="em breve"
                                      >
                                        Gerar Proposta
                                      </DropdownItem>
                                      <DropdownItem
                                        icon={<Share2 className="h-4 w-4" />}
                                        onClick={() => {
                                          abrirCompartilhar(l);
                                          close();
                                        }}
                                      >
                                        Compartilhar
                                      </DropdownItem>
                                      <DropdownSeparator />
                                      <DropdownItem
                                        icon={<XCircle className="h-4 w-4" />}
                                        danger
                                        disabled={l.status === "perdido"}
                                        onClick={() => {
                                          mudarStatus(l, "perdido");
                                          close();
                                        }}
                                      >
                                        Perdeu
                                      </DropdownItem>
                                      <DropdownItem
                                        icon={<CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />}
                                        disabled={l.status === "fechamento"}
                                        onClick={() => {
                                          mudarStatus(l, "fechamento");
                                          close();
                                        }}
                                      >
                                        Ganhou
                                      </DropdownItem>
                                      <DropdownSeparator />
                                      <DropdownItem
                                        icon={<Trash2 className="h-4 w-4" />}
                                        danger
                                        onClick={() => {
                                          remover(l);
                                          close();
                                        }}
                                      >
                                        Excluir
                                      </DropdownItem>
                                    </>
                                  )}
                                </Dropdown>
                                <select
                                  value={l.status}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => mudarStatus(l, e.target.value as LeadStatus)}
                                  className="ml-1 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] text-white/60"
                                  title="Mover etapa"
                                >
                                  {STATUS_ORDER.map((st) => (
                                    <option key={st} value={st} className="bg-[#0b0d16] text-white">
                                      {LEAD_STATUS_INFO[st].label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <span className="text-xs font-semibold text-white tabular-nums">
                                {brl(l.valorEstimado)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {items.length === 0 && (
                      <div
                        className={cn(
                          "m-1 flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-center text-xs transition-colors",
                          isOver ? "border-white/30 text-white/60" : "border-white/10 text-white/35",
                        )}
                      >
                        <Sparkles className="h-4 w-4 opacity-40" />
                        <span>Arraste um card aqui</span>
                        <button
                          onClick={() => abrirNovo(s)}
                          className="font-medium text-indigo-300 hover:underline"
                        >
                          Adicionar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===================== PAINEL INFERIOR ===================== */}
        <div className="lb-glass lb-fade-up rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-300" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Resumo do pipeline</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric icon={Briefcase} label="Negócios" value={metrics.totalNegocios} color="#818cf8" />
            <Metric icon={Wallet} label="Valor estimado" value={<AnimatedBRL value={metrics.valorTotal} />} color="#34d399" glow />
            <Metric icon={TrendingUp} label="Conversão" value={pct(metrics.taxaConversao)} color="#22d3ee" />
            <Metric icon={Receipt} label="Ticket médio" value={<AnimatedBRL value={metrics.ticketMedio} />} color="#fbbf24" />
            <Metric icon={Clock} label="Ciclo médio" value={`${metrics.cicloMedio.toFixed(0)}d`} color="#f472b6" />
          </div>

          {/* mini gráfico futurista — distribuição por etapa */}
          <div className="mt-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-white/45">Distribuição por etapa</p>
            <div className="flex items-end gap-2">
              {STATUS_ORDER.map((s) => {
                const tone = STATUS_TONE[s];
                const c = colunas[s].length;
                const h = (c / maxCount) * 100;
                return (
                  <div key={s} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-14 w-full items-end">
                      <div
                        className="w-full rounded-t-md transition-[height] duration-700"
                        style={{
                          height: `${Math.max(h, 4)}%`,
                          background: `linear-gradient(180deg, ${tone.color}, ${tone.color}55)`,
                          boxShadow: `0 0 14px -2px ${tone.color}`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold tabular-nums text-white/70">{c}</span>
                    <span className="hidden truncate text-[8px] uppercase tracking-wide text-white/35 sm:block">
                      {LEAD_STATUS_INFO[s].label.slice(0, 4)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar Negócio" : "Criar Negócio"}
        subtitle="Informações do Contato e do Negócio"
        icon={<Briefcase className="h-5 w-5" />}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="nome">
                Nome do Contato <span className="text-[var(--color-danger)]">*</span>
              </Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="tel">
                Telefone de Contato <span className="text-[var(--color-danger)]">*</span>
              </Label>
              <Input
                id="tel"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(79) 99999-0000"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="tipo">
                Tipo de Negócio <span className="text-[var(--color-danger)]">*</span>
              </Label>
              <select
                id="tipo"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as LeadTipo | "" })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
                required
              >
                <option value="">Selecione o Tipo</option>
                {TIPO_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {LEAD_TIPO_INFO[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="val">Valor do Crédito (opcional)</Label>
              <MoneyInput
                id="val"
                value={form.valorEstimado}
                onChange={(v) => setForm({ ...form, valorEstimado: v })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="st">Etapa</Label>
              <select
                id="st"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_INFO[s].label}
                  </option>
                ))}
              </select>
            </div>
            {gestor ? (
              <div>
                <Label htmlFor="vd">Vendedor responsável</Label>
                <select
                  id="vd"
                  value={form.vendedorId}
                  onChange={(e) => setForm({ ...form, vendedorId: e.target.value })}
                  className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
                >
                  <option value="">— sem vendedor —</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <Label>Vendedor responsável</Label>
                <div className="flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-3 text-sm text-[var(--color-text-dim)]">
                  {vendedores.find((v) => v.id === form.vendedorId)?.nome ??
                    session?.nome ??
                    "Você"}{" "}
                  (você)
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="email">Email (opcional)</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="or">Origem (opcional)</Label>
              <Input
                id="or"
                value={form.origem}
                onChange={(e) => setForm({ ...form, origem: e.target.value })}
                placeholder="Indicação, site, anúncio…"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="obs">Observação</Label>
            <textarea
              id="obs"
              rows={3}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : editing ? "Salvar" : "Criar negócio"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!compartilhar}
        onClose={() => setCompartilhar(null)}
        title="Compartilhar negócio"
        subtitle={compartilhar ? `Transferir "${compartilhar.nome}" para outro vendedor` : ""}
        icon={<Share2 className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="vd-compartilhar">Novo vendedor responsável</Label>
            <select
              id="vd-compartilhar"
              value={novoVendedorId}
              onChange={(e) => setNovoVendedorId(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
            >
              <option value="">— selecione —</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                  {v.id === compartilhar?.vendedorId ? " (atual)" : ""}
                </option>
              ))}
            </select>
          </div>
          {compartilhar?.vendedorId && (
            <p className="rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text-dim)]">
              Atualmente com:{" "}
              <span className="font-medium text-[var(--color-text)]">
                {vendedores.find((v) => v.id === compartilhar.vendedorId)?.nome ?? "—"}
              </span>
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCompartilhar(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarCompartilhar}>
              Transferir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
