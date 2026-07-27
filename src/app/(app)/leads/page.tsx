"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  Flame,
  GripVertical,
  History,
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
  Star,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Truck,
  User,
  Users,
  Wallet,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { leadsApi, useLeads, useSession, useVendasAll, useVendedores, vendasApi } from "@/lib/store";
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
import { TimelineLead } from "@/components/leads/timeline-lead";

const STATUS_ORDER: LeadStatus[] = [
  "oportunidade",
  "primeiro_contato",
  "reuniao",
  "reuniao_agendada",
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
  novaObs: string;
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
  novaObs: "",
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

/** Carimbo "dd/mm/aaaa - hh:mm - Nome" pra cada observação. */
function carimbo(nome: string) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} - ${p(d.getHours())}:${p(d.getMinutes())} - ${nome}`;
}

type ObsEntry = { data: string; hora: string; nome: string; corpo: string };
/** Quebra o texto de observações na timeline de atendimento. */
function parseHistorico(texto: string): ObsEntry[] {
  const t = (texto ?? "").trim();
  if (!t) return [];
  const re = /\[(\d{2}\/\d{2}\/\d{4}) - (\d{2}:\d{2}) - ([^\]]+)\]/g;
  const matches = [...t.matchAll(re)];
  if (matches.length === 0) return [{ data: "", hora: "", nome: "", corpo: t }];
  const entries: ObsEntry[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? t.length) : t.length;
    entries.push({ data: m[1], hora: m[2], nome: m[3].trim(), corpo: t.slice(start, end).trim() });
  }
  const preamble = t.slice(0, matches[0].index ?? 0).trim();
  if (preamble) entries.push({ data: "", hora: "", nome: "", corpo: preamble });
  return entries;
}

/** Textarea que cresce com o conteúdo (até 240px, depois rola). */
function AutoTextarea({ value, onChange, className, ...rest }: React.ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);
  return <textarea ref={ref} value={value} onChange={onChange} className={className} {...rest} />;
}

function AnimatedBRL({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{brl(v)}</span>;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 0;
    const y = 30 - ((v - min) / range) * 26 - 2;
    return `${x},${y}`;
  });
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-9 w-full">
      <defs>
        <linearGradient id="pipeSpark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,30 ${pts.join(" ")} 100,30`} fill="url(#pipeSpark)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  color,
  hint,
  delay = 0,
  children,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: React.ReactNode;
  color: string;
  hint?: string;
  delay?: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="lb-fade-up group relative overflow-hidden rounded-2xl border border-white/10 p-4 backdrop-blur-xl"
      style={{
        animationDelay: `${delay}s`,
        background: "linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
        boxShadow: "0 20px 46px -22px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.12)",
      }}
    >
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-50"
        style={{ background: color }}
      />
      <span
        className="grid h-9 w-9 place-items-center rounded-xl"
        style={{ background: `${color}1f`, boxShadow: `0 0 18px -3px ${color}` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </span>
      <p className="mt-3 text-[10px] uppercase tracking-wider text-white/45">{label}</p>
      <p className="text-xl font-bold text-white tabular-nums md:text-2xl">{value}</p>
      {hint && <p className="text-[11px] text-white/40">{hint}</p>}
      {children}
    </div>
  );
}

type LeadTag = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bg: string;
};

export default function LeadsPage() {
  const leads = useLeads();
  const vendas = useVendasAll(); // idempotência do fechamento vê canceladas também
  const vendedores = useVendedores();
  const session = useSession();
  const gestor = temPermissao(session, "supervisor");
  const [filtroVendedor, setFiltroVendedor] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [salvando, setSalvando] = useState(false);
  const [compartilhar, setCompartilhar] = useState<Lead | null>(null);
  const [timelineDe, setTimelineDe] = useState<Lead | null>(null);
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
    const perdidos = colunas.perdido.length;
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
    return { valorTotal, totalNegocios, ganhos, perdidos, taxaConversao, ticketMedio, cicloMedio };
  }, [filtrados, colunas]);

  const analytics = useMemo(() => {
    const now = new Date();
    const buckets: number[] = [0, 0, 0, 0, 0, 0];
    const keyIdx = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keyIdx.set(`${d.getFullYear()}-${d.getMonth()}`, 5 - i);
    }
    for (const l of filtrados) {
      const d = new Date(l.criadoEm);
      const idx = keyIdx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (idx !== undefined) buckets[idx] += l.valorEstimado;
    }
    const cur = buckets[5] ?? 0;
    const prev = buckets[4] ?? 0;
    const crescimento = prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;
    return { serie: buckets, crescimento };
  }, [filtrados]);

  const maxCount = Math.max(...STATUS_ORDER.map((s) => colunas[s].length), 1);

  const historico = useMemo(() => parseHistorico(form.observacao), [form.observacao]);

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
      novaObs: "",
    });
    setOpen(true);
  }
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
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
    // Mobile-safe: força blur pra commitar último char do IME, depois lê o
    // valor monetário direto do DOM via FormData. Em iOS/Android, o setState
    // disparado pelo onBlur pode não ter flush quando o submit roda, fazendo
    // o React state ficar "" mesmo com o DOM mostrando "60.145,80".
    const formEl = e.currentTarget;
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const valorRaw =
      (new FormData(formEl).get("valor") as string | null) ?? form.valorEstimado;

    setSalvando(true);
    try {
      // Histórico de atendimento: nova observação carimbada vai pro topo.
      const historicoExistente = (form.observacao ?? "").trim();
      const nova = form.novaObs.trim();
      const entrada = nova ? `[${carimbo(session?.nome ?? "Sistema")}]\n${nova}` : "";
      const observacaoFinal = entrada
        ? historicoExistente
          ? `${entrada}\n\n${historicoExistente}`
          : entrada
        : historicoExistente;
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        telefone: form.telefone.trim(),
        valorEstimado: parseNumBR(valorRaw),
        status: form.status,
        tipo: form.tipo as LeadTipo,
        vendedorId: form.vendedorId || undefined,
        origem: form.origem.trim() || undefined,
        observacao: observacaoFinal || undefined,
      };
      // Fechar pelo FORMULÁRIO também gera venda (antes só o arrastar gerava —
      // fechamento pelo modal deixava faturamento/ranking/comissão sem a venda).
      const virouFechamento =
        payload.status === "fechamento" &&
        (!editing || editing.status !== "fechamento") &&
        (!editing || !vendaDoLeadExiste(editing.id));
      if (virouFechamento && !podeFechar(payload)) {
        setSalvando(false);
        return;
      }
      if (editing) {
        await leadsApi.update(editing.id, payload);
        if (virouFechamento && payload.vendedorId) {
          const ok = await registrarVendaDoFechamento({
            leadId: editing.id,
            nome: payload.nome,
            vendedorId: payload.vendedorId,
            valor: payload.valorEstimado,
          });
          if (ok)
            notify.success(
              "Negócio fechado! 🎉",
              "Venda gerada — financeiro, comissão e ranking atualizados.",
            );
        } else {
          notify.success("Negócio atualizado");
        }
      } else {
        const criado = await leadsApi.add(payload);
        if (virouFechamento && payload.vendedorId) {
          // Negócio criado já direto em Fechamento: registra a venda também.
          await registrarVendaDoFechamento({
            leadId: criado.id,
            nome: payload.nome,
            vendedorId: payload.vendedorId,
            valor: payload.valorEstimado,
          });
        }
        notify.success("Negócio criado", `${payload.nome} adicionado em ${LEAD_STATUS_INFO[payload.status].label}`);
      }
      setOpen(false);
    } catch (e) {
      // Observabilidade: PostgrestError do Supabase NAO e instancia de Error,
      // entao o check antigo `e instanceof Error` caia em `undefined` e o toast
      // sumia com a descricao. Aqui extraimos message/code/details/hint
      // defensivamente, alem de logar o objeto completo no console.
      console.error("[CRIAR_NEGOCIO]", JSON.stringify(e, null, 2));
      console.error("[CRIAR_NEGOCIO] (raw)", e);

      const pick = (key: string): string | undefined => {
        if (typeof e === "object" && e !== null && key in e) {
          const v = (e as Record<string, unknown>)[key];
          return v == null ? undefined : String(v);
        }
        return undefined;
      };
      const msg = e instanceof Error ? e.message : pick("message");
      const code = pick("code");
      const details = pick("details");
      const hint = pick("hint");
      const partes = [
        msg ?? "Falha desconhecida",
        code ? `code: ${code}` : null,
        details ? `details: ${details}` : null,
        hint ? `hint: ${hint}` : null,
      ].filter((p): p is string => Boolean(p));

      notify.error("Erro ao salvar", partes.join(" · "));
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
  /** Venda automática do fechamento já existe? (idempotência client-side;
   *  o índice único vendas_auto_lead_unq protege no banco também). */
  function vendaDoLeadExiste(leadId: string) {
    return vendas.some((v) => v.observacao === `Auto-gerada do lead ${leadId}`);
  }

  /** Travas do fechamento — TODO caminho que fecha negócio passa aqui ANTES
   *  de gravar o status. Sem vendedor ou sem valor não fecha (senão a venda
   *  nasce errada e nenhum indicador mexe). */
  function podeFechar(dados: { vendedorId?: string; valorEstimado: number }): boolean {
    if (!dados.vendedorId) {
      notify.error(
        "Defina o vendedor antes de fechar",
        "Use ⋮ → Compartilhar (ou o campo Vendedor do formulário) — a venda e a comissão vão pra ele.",
      );
      return false;
    }
    if (!(dados.valorEstimado > 0)) {
      notify.error(
        "Informe o valor do negócio antes de fechar",
        "É esse valor que vira a venda — com R$ 0 o faturamento, o ranking e a comissão não mudam.",
      );
      return false;
    }
    return true;
  }

  /** Fechamento gera venda automática (o ranking/faturamento leem da tabela
   *  `vendas`, não de `leads`). Retorna true se a venda ficou garantida. */
  async function registrarVendaDoFechamento(dados: {
    leadId: string;
    nome: string;
    vendedorId: string;
    valor: number;
  }): Promise<boolean> {
    if (vendaDoLeadExiste(dados.leadId)) {
      notify.info("Venda deste negócio já estava registrada", "Nada foi duplicado.");
      return true;
    }
    try {
      await vendasApi.add({
        vendedorId: dados.vendedorId,
        cliente: dados.nome,
        valor: dados.valor,
        data: new Date().toISOString(),
        observacao: `Auto-gerada do lead ${dados.leadId}`,
      });
      return true;
    } catch (err) {
      // Índice único do banco devolve 23505 quando a venda já existe
      // (reimportação/concorrência) — isso é sucesso, não erro.
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code === "23505") {
        notify.info("Venda deste negócio já estava registrada", "Nada foi duplicado.");
        return true;
      }
      // Lead já foi fechado (status persistiu), mas a venda falhou.
      // Avisa o user pra lançar manual via /vendas, não esconde o erro.
      notify.error(
        "Negócio fechado, mas a venda não foi registrada",
        err instanceof Error
          ? `${err.message}. Lança manual em /vendas.`
          : "Lança a venda manual em /vendas pra subir no ranking.",
      );
      return false;
    }
  }

  async function mudarStatus(l: Lead, status: LeadStatus) {
    // Travas ANTES de gravar: fechamento sem vendedor/valor não acontece.
    if (status === "fechamento" && !podeFechar(l)) return;
    try {
      await leadsApi.update(l.id, { status });
      if (status === "fechamento" && l.vendedorId) {
        const ok = await registrarVendaDoFechamento({
          leadId: l.id,
          nome: l.nome,
          vendedorId: l.vendedorId,
          valor: l.valorEstimado,
        });
        if (ok)
          notify.success(
            "Negócio fechado! 🎉",
            "Venda gerada — financeiro, comissão e ranking atualizados.",
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
      {/* névoa suave */}
      <div className="lb-fog pointer-events-none absolute left-1/4 top-24 h-40 w-1/2 rounded-[50%] opacity-60 blur-3xl" style={{ background: "radial-gradient(ellipse at center, rgba(99,102,241,0.12), transparent 70%)" }} />
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
        style={{ background: "radial-gradient(ellipse at 50% 28%, transparent 44%, rgba(0,0,0,0.5) 100%)" }}
      />

      <div className="relative space-y-6">
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

        {/* ===================== KPIs PREMIUM (TOPO) ===================== */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={Wallet} label="Valor estimado" color="#34d399" delay={0} value={<AnimatedBRL value={metrics.valorTotal} />}>
            <div className="mt-1.5 -mb-1">
              <Sparkline data={analytics.serie} color="#34d399" />
            </div>
          </Kpi>
          <Kpi
            icon={TrendingUp}
            label="Taxa de conversão"
            color="#22d3ee"
            delay={0.06}
            value={pct(metrics.taxaConversao)}
            hint={`${metrics.ganhos} ganhos · ${metrics.totalNegocios} no funil`}
          />
          <Kpi
            icon={Receipt}
            label="Ticket médio"
            color="#fbbf24"
            delay={0.12}
            value={<AnimatedBRL value={metrics.ticketMedio} />}
            hint="por negócio"
          />
          <Kpi
            icon={Activity}
            label="Crescimento"
            color="#a78bfa"
            delay={0.18}
            hint="valor criado vs mês anterior"
            value={
              <span className={cn("inline-flex items-center gap-1", analytics.crescimento >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {analytics.crescimento >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                {pct(Math.abs(analytics.crescimento))}
              </span>
            }
          />
        </div>

        {/* ===================== KANBAN ===================== */}
        <div className="relative">
          {/* luz ambiente atrás das colunas */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 75% 55% at 50% 0%, rgba(99,102,241,0.14), transparent 72%)" }}
          />
          {/* reflexo no chão */}
          <div className="pointer-events-none absolute inset-x-8 -bottom-3 h-12 rounded-[50%] bg-indigo-500/10 blur-2xl" />

          <div className="overflow-x-auto pb-2">
            <div className="grid grid-flow-col gap-6" style={{ gridAutoColumns: "minmax(296px, 1fr)" }}>
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
                    className="lb-fade-up relative flex min-h-[460px] flex-col rounded-2xl border transition-shadow duration-300"
                    style={{
                      animationDelay: `${ci * 0.05}s`,
                      background: `linear-gradient(180deg, ${tone.color}14, rgba(255,255,255,0.018))`,
                      backdropFilter: "blur(14px)",
                      WebkitBackdropFilter: "blur(14px)",
                      borderColor: isOver ? tone.color : `${tone.color}3a`,
                      boxShadow: isOver
                        ? `0 0 54px -6px ${tone.color}, inset 0 1px 0 rgba(255,255,255,.08)`
                        : `0 26px 60px -24px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.05)`,
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
                      <div className="flex shrink-0 items-center gap-1">
                        {s === "perdido" && (
                          <Link
                            href="/recuperacao"
                            title="Abrir a Central de Recuperação de Leads"
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-400/20"
                          >
                            <FileText className="h-3.5 w-3.5" /> Recuperação
                          </Link>
                        )}
                        <button
                          onClick={() => abrirNovo(s)}
                          className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                          title="Adicionar nesta etapa"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* corpo da coluna */}
                    <div className="flex-1 space-y-3 overflow-y-auto p-3">
                      {items.map((l, i) => {
                        const vendedor = vendedores.find((v) => v.id === l.vendedorId);
                        const wa = waLink(l.telefone);
                        const tel = telLink(l.telefone);
                        const TipoIcon = l.tipo ? TIPO_ICON[l.tipo] : Building2;
                        const tipoLabel = l.tipo ? LEAD_TIPO_INFO[l.tipo].label : "Negócio";
                        const fechado = l.status === "fechamento";

                        // indicadores premium
                        const diasUlt = (Date.now() - new Date(l.atualizadoEm ?? l.criadoEm).getTime()) / 86_400_000;
                        const ativo = l.status !== "perdido" && l.status !== "fechamento";
                        const altoTicket = l.valorEstimado >= Math.max(150_000, metrics.ticketMedio * 1.6);
                        const quente = ativo && diasUlt <= 2;
                        const prioridade = ativo && altoTicket && (l.status === "reuniao" || l.status === "acompanhamento");
                        const fechamentoProx = l.status === "acompanhamento";
                        const tags: LeadTag[] = [];
                        if (quente) tags.push({ icon: Flame, label: "Quente", color: "#fda4af", bg: "rgba(244,63,94,.16)" });
                        if (altoTicket) tags.push({ icon: Star, label: "Alto ticket", color: "#fcd34d", bg: "rgba(245,158,11,.16)" });
                        if (prioridade) tags.push({ icon: Zap, label: "Prioridade", color: "#c4b5fd", bg: "rgba(139,92,246,.16)" });
                        if (fechamentoProx) tags.push({ icon: Target, label: "Fechar", color: "#6ee7b7", bg: "rgba(16,185,129,.16)" });

                        return (
                          <div key={l.id} className="lb-fade-up" style={{ animationDelay: `${i * 0.04}s` }}>
                            <div className="lb-bob-sm" style={{ animationDelay: `${(i % 5) * 0.6}s` }}>
                              <div
                                data-lead-card
                                className={cn(
                                  "lb-podium-card group relative rounded-xl border py-3.5 pl-4 pr-3.5 transition-all",
                                  dragId === l.id ? "opacity-40" : "",
                                )}
                                style={{
                                  background:
                                    "linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 55%, rgba(255,255,255,0.06))",
                                  borderColor: fechado ? "rgba(34,197,94,.42)" : "rgba(255,255,255,.13)",
                                  boxShadow: fechado
                                    ? "0 22px 42px -20px rgba(0,0,0,.85), 0 0 26px -10px rgba(34,197,94,.6), inset 0 1px 0 rgba(255,255,255,.16), inset 0 0 26px rgba(255,255,255,.04)"
                                    : "0 22px 42px -20px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.16), inset 0 0 26px rgba(255,255,255,.04)",
                                }}
                              >
                                {/* reflexo holográfico (clipa só o card, não corta o dropdown) */}
                                <span className="lb-holo pointer-events-none absolute inset-0 rounded-xl" aria-hidden />
                                {/* brilho interno no topo */}
                                <span
                                  className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-xl"
                                  style={{ background: "linear-gradient(180deg, rgba(255,255,255,.10), transparent)" }}
                                  aria-hidden
                                />
                                {/* glow aumentando no hover */}
                                <span
                                  className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                                  style={{ background: `radial-gradient(120% 80% at 50% 0%, ${tone.color}26, transparent 70%)`, boxShadow: `inset 0 0 30px -6px ${tone.color}` }}
                                  aria-hidden
                                />
                                {/* acento de status (cor da etapa) */}
                                <span
                                  className="pointer-events-none absolute inset-y-2 left-0 w-1 rounded-full"
                                  style={{ background: tone.color, boxShadow: `0 0 10px ${tone.color}` }}
                                />

                                {/* topo: grip + tipo + tempo */}
                                <div className="relative mb-1.5 flex items-start justify-between gap-1">
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
                                    <TipoIcon className="h-3.5 w-3.5 shrink-0 text-white/45" />
                                    <span className="min-w-0 truncate text-[10px] uppercase tracking-wider text-white/50">
                                      {tipoLabel}
                                    </span>
                                    {fechado && (
                                      <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                                        ✓ Venda
                                      </span>
                                    )}
                                  </div>
                                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-white/40">
                                    {timeAgo(l.criadoEm)}
                                  </span>
                                </div>

                                {/* nome + origem */}
                                <button
                                  type="button"
                                  onClick={() => abrirEditar(l)}
                                  className="relative block w-full text-left"
                                >
                                  <p className="truncate text-sm font-semibold text-white hover:underline">
                                    {l.nome}
                                  </p>
                                </button>
                                {l.origem && (
                                  <span
                                    className="relative mt-1 block max-w-full truncate rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/55"
                                    style={{ width: "fit-content" }}
                                  >
                                    {l.origem}
                                  </span>
                                )}

                                {/* indicadores premium */}
                                {tags.length > 0 && (
                                  <div className="relative mt-1.5 flex flex-wrap items-center gap-1">
                                    {tags.map((t) => (
                                      <span
                                        key={t.label}
                                        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                                        style={{ background: t.bg, color: t.color }}
                                      >
                                        <t.icon className="h-2.5 w-2.5" /> {t.label}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {l.telefone && (
                                  <div className="relative mt-1.5 flex items-center gap-1.5 text-xs text-white/55">
                                    <Phone className="h-3 w-3 shrink-0 text-emerald-400" />
                                    <span className="min-w-0 truncate">{l.telefone}</span>
                                  </div>
                                )}

                                {/* vendedor (avatar + badge) */}
                                <div className="relative mt-2 flex items-center justify-between gap-2">
                                  {vendedor ? (
                                    <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-0.5 pl-0.5 pr-2">
                                      <Avatar id={vendedor.id} nome={vendedor.nome} size={20} />
                                      <span className="min-w-0 truncate text-xs font-medium text-white">
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
                                <div className="relative mt-2.5 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                                  <div className="flex min-w-0 flex-1 items-center gap-1">
                                    {tel && (
                                      <a
                                        href={tel}
                                        className="shrink-0 rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-emerald-300"
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
                                        className="shrink-0 rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-emerald-300"
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
                                          <DropdownItem
                                            icon={<History className="h-4 w-4" />}
                                            onClick={() => {
                                              setTimelineDe(l);
                                              close();
                                            }}
                                          >
                                            Linha do tempo
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
                                      className="ml-1 min-w-0 max-w-[104px] flex-1 truncate rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] text-white/60"
                                      title="Mover etapa"
                                    >
                                      {STATUS_ORDER.map((st) => (
                                        <option key={st} value={st} className="bg-[#0b0d16] text-white">
                                          {LEAD_STATUS_INFO[st].label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-white tabular-nums">
                                    {brl(l.valorEstimado)}
                                  </span>
                                </div>
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
        </div>

        {/* ===================== FUNIL (RODAPÉ) ===================== */}
        <div className="lb-glass lb-fade-up rounded-2xl p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-300" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Funil de conversão</h2>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-white/55">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-pink-300" /> Ciclo médio {metrics.cicloMedio.toFixed(0)}d
              </span>
              <span className="text-emerald-300">{metrics.ganhos} ganhos</span>
              <span className="text-rose-300">{metrics.perdidos} perdidos</span>
            </div>
          </div>
          <div className="flex items-end gap-2">
            {STATUS_ORDER.map((s) => {
              const tone = STATUS_TONE[s];
              const c = colunas[s].length;
              const h = (c / maxCount) * 100;
              return (
                <div key={s} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-20 w-full items-end">
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
                name="valor"
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
            <Label htmlFor="obs">{editing ? "Adicionar observação" : "Observação"}</Label>
            <AutoTextarea
              id="obs"
              value={form.novaObs}
              onChange={(e) => setForm({ ...form, novaObs: e.target.value })}
              placeholder={
                editing
                  ? "Nova observação… vai pro topo do histórico com data, hora e seu nome."
                  : "Primeira observação do atendimento…"
              }
              className="min-h-[76px] w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm leading-relaxed outline-none focus:border-[var(--color-brand)]"
            />
            <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
              <Clock className="h-3 w-3" />
              Carimbada automaticamente com data, hora e {session?.nome ?? "seu nome"}.
            </p>

            {historico.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                  <History className="h-3.5 w-3.5" /> Histórico de atendimento
                </p>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {historico.map((h, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-2.5"
                      style={
                        i === 0
                          ? { borderColor: "var(--color-brand)", boxShadow: "inset 2px 0 0 var(--color-brand)" }
                          : undefined
                      }
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                        {h.data ? (
                          <>
                            <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text)]">
                              <CalendarClock className="h-3 w-3 text-[var(--color-brand)]" />
                              {h.data} · {h.hora}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[var(--color-text-dim)]">
                              <User className="h-3 w-3" /> {h.nome}
                            </span>
                          </>
                        ) : (
                          <span className="italic text-[var(--color-text-dim)]">Observação anterior</span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--color-text)]">
                        {h.corpo}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

      <TimelineLead lead={timelineDe} onClose={() => setTimelineDe(null)} />
    </div>
  );
}
