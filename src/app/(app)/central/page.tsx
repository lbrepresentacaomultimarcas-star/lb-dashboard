"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Clock,
  FileText,
  FileSpreadsheet,
  Inbox,
  MessageCircle,
  Phone,
  PhoneCall,
  Plus,
  Search,
  Trash2,
  Send,
  Upload,
  UserRound,
  XCircle,
  ChevronDown,
  Repeat,
} from "lucide-react";
import { centralLeadsApi, useCentralLeads, useEscopo, useSession, useVendedores } from "@/lib/store";
import { ehAdmin } from "@/lib/permissions";
import {
  CENTRAL_STATUS_INFO,
  LEAD_STATUS_INFO,
  LEAD_TIPO_INFO,
  MOTIVOS_PERDA_CENTRAL,
  PRIORIDADE_INFO,
  STATUS_ORDER,
  type CentralLead,
  type CentralLeadEvento,
  type CentralLeadStatus,
  type LeadStatus,
  type Prioridade,
} from "@/lib/types";
import { notify } from "@/lib/notify";
import { PremiumStage } from "@/components/premium-stage";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

// ---------- helpers ----------
const soDigitos = (t?: string) => (t ?? "").replace(/\D/g, "");
const waLink = (t?: string) => {
  const d = soDigitos(t);
  return d ? `https://wa.me/${d.length <= 11 ? "55" + d : d}` : undefined;
};
const telLink = (t?: string) => {
  const d = soDigitos(t);
  return d ? `tel:${d}` : undefined;
};
const fmtData = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const fmtHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDataHora = (iso?: string) => (iso ? `${fmtData(iso)} ${fmtHora(iso)}` : "—");

function tempoDesde(iso?: string): string {
  if (!iso) return "";
  const ms = new Date().getTime() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "há poucos minutos";
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

const TONE: Record<string, string> = {
  neutral: "#94a3b8",
  brand: "#3b82f6",
  warn: "#f59e0b",
  success: "#22c55e",
  danger: "#ef4444",
};
const PRODUTOS = Object.values(LEAD_TIPO_INFO).map((t) => t.label);

function StatusBadge({ status }: { status: CentralLeadStatus }) {
  const info = CENTRAL_STATUS_INFO[status];
  const c = TONE[info.tone];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: c, borderColor: `${c}55`, background: `${c}1a` }}
    >
      {info.label}
    </span>
  );
}
/**
 * Prazo declarado PELO CLIENTE — não confundir com prioridade.
 * Prioridade é classificação do CRM; isto é o que a pessoa respondeu.
 * O texto sai como veio; a cor é só leitura rápida.
 */
function PrazoBadge({ prazo }: { prazo: string }) {
  const t = prazo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const cor = /quanto antes|agora|imediat/.test(t)
    ? { bg: "rgba(239,68,68,.16)", fg: "#fca5a5" }
    : /30\s*dias|proximo\s*mes/.test(t)
      ? { bg: "rgba(245,158,11,.16)", fg: "#fcd34d" }
      : /pesquisan|pesquisa|sem previsao/.test(t)
        ? { bg: "rgba(148,163,184,.18)", fg: "#cbd5e1" }
        : { bg: "rgba(59,130,246,.16)", fg: "#93c5fd" };
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
      style={{ background: cor.bg, color: cor.fg }}
      title={`Prazo informado pelo cliente: ${prazo}`}
    >
      <Clock className="h-3 w-3 shrink-0" />
      <span className="min-w-0 truncate">{prazo}</span>
    </span>
  );
}

function PrioridadeBadge({ p }: { p: Prioridade }) {
  const info = PRIORIDADE_INFO[p];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: info.cor, background: `${info.cor}1f`, boxShadow: `0 0 12px -4px ${info.cor}` }}
    >
      {info.label}
    </span>
  );
}

type ImportRow = { nome: string; telefone?: string; produto?: string; origem?: string; prioridade?: Prioridade };

/** Nome de coluna sem acento/pontuação, em minúsculo — o CSV da Meta vem com
 *  cabeçalhos como "full_name", "phone_number" e a pergunta que você escreveu. */
const chaveCol = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * Mapeia uma linha (objeto do xlsx/csv) → ImportRow.
 *
 * Entende tanto o formato "à mão" (nome/telefone/produto/origem) quanto o
 * **CSV do formulário instantâneo da Meta**, que traz full_name, phone_number,
 * email, a pergunta de interesse escrita por você e as colunas de campanha.
 * Assim o arquivo baixado do Gerenciador de Leads entra direto, sem renomear
 * coluna nenhuma.
 */
function mapObjRow(o: Record<string, unknown>): ImportRow {
  const entradas = Object.keys(o).map((k) => [chaveCol(k), String(o[k] ?? "").trim()] as const);
  const val = (...keys: string[]) => entradas.find(([k]) => keys.includes(k))?.[1] || "";
  /** primeira coluna cujo nome CONTÉM algum dos termos (p/ perguntas livres) */
  const valContem = (...termos: string[]) =>
    entradas.find(([k, v]) => v && termos.some((t) => k.includes(t)))?.[1] || "";

  const nome =
    val("nome", "cliente", "name", "full_name", "nome_completo") ||
    [val("first_name", "primeiro_nome"), val("last_name", "sobrenome")].filter(Boolean).join(" ").trim();

  // origem: se a Meta informar a rede/campanha, monta uma origem legível
  const plataforma = val("platform", "plataforma");
  const campanha = val("campaign_name", "campanha");
  const anuncio = val("ad_name", "anuncio");
  const rede = plataforma === "ig" ? "Instagram" : plataforma === "fb" ? "Facebook" : "";
  const origemMeta = rede || campanha || anuncio ? `Meta Ads${rede ? ` · ${rede}` : ""}` : "";

  return {
    nome,
    telefone: val("telefone", "fone", "celular", "whatsapp", "phone", "phone_number", "numero_de_telefone"),
    produto:
      val("produto", "interesse", "produto_de_interesse") ||
      valContem("interesse", "produto", "procura"),
    origem: val("origem", "fonte", "source") || origemMeta,
  };
}

/**
 * Filtro em menu de verdade, no DOM.
 *
 * Antes era <select> nativo. O popup dele é desenhado pelo sistema, fora do
 * nosso CSS: não herda o fundo escuro do card, mas herda a cor do texto — que
 * aqui é branca. Dava opções brancas sobre popup claro, invisíveis.
 *
 * Em DOM o menu usa os tokens do tema (fundo opaco, texto legível) e funciona
 * igual nos dois temas, sem depender de como o sistema pinta controle nativo.
 */
function FiltroSelect<T extends string>({
  valor,
  opcoes,
  onChange,
  largura = 230,
  titulo,
}: {
  valor: T;
  opcoes: { valor: T; rotulo: string }[];
  onChange: (v: T) => void;
  largura?: number;
  titulo?: string;
}) {
  const atual = opcoes.find((o) => o.valor === valor)?.rotulo ?? opcoes[0]?.rotulo ?? "";
  return (
    <Dropdown
      align="start"
      width={largura}
      rotulo={titulo ?? atual}
      triggerClassName="flex h-11 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-white transition-colors hover:bg-white/[0.08]"
      trigger={
        <>
          <span className="max-w-[190px] truncate">{atual}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        </>
      }
    >
      {(close) =>
        opcoes.map((o) => (
          <DropdownItem
            key={o.valor}
            onClick={() => {
              onChange(o.valor);
              close();
            }}
          >
            <span className={o.valor === valor ? "font-semibold text-[var(--color-brand)]" : undefined}>
              {o.rotulo}
            </span>
          </DropdownItem>
        ))
      }
    </Dropdown>
  );
}

export default function CentralLeadsPage() {
  const leads = useCentralLeads();
  const session = useSession();
  const escopo = useEscopo();
  const vendedores = useVendedores();
  const admin = ehAdmin(session);
  const veConsultor = escopo.verTudo || escopo.ehGestorEquipe;
  const nomeVend = (id?: string) => vendedores.find((v) => v.id === id)?.nome ?? "Sem consultor";
  const vendedoresAtivos = useMemo(() => vendedores.filter((v) => v.ativo), [vendedores]);

  const [busca, setBusca] = useState("");
  /** "" = fila atual (comportamento de sempre). "AAAA-MM" = histórico do mês. */
  const [mesRef, setMesRef] = useState("");
  const [leadsDoMes, setLeadsDoMes] = useState<CentralLead[] | null>(null);
  const [carregandoMes, setCarregandoMes] = useState(false);
  const [soTestes, setSoTestes] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [fPrioridade, setFPrioridade] = useState<Prioridade | "todas">("todas");
  const [fStatus, setFStatus] = useState<CentralLeadStatus | "todos">("todos");
  /**
   * Abas da visão administrativa: "o que ainda preciso enviar" contra "o que já
   * enviei e para quem". Só separa o que a tela mostra — não mexe em status,
   * distribuição nem em nada do fluxo.
   */
  const [aba, setAba] = useState<"novos" | "enviados">("novos");
  /** "" = todos os consultores. Só vale na aba ENVIADOS. */
  const [fConsultor, setFConsultor] = useState("");
  /** Lead em redistribuição — null quando o modal está fechado. */
  const [redist, setRedist] = useState<CentralLead | null>(null);
  const [redistPara, setRedistPara] = useState("");
  const [redistMotivo, setRedistMotivo] = useState("");
  const [redistOutro, setRedistOutro] = useState("");
  const [redistSalvando, setRedistSalvando] = useState(false);

  // fluxo do consultor
  const [acao, setAcao] = useState<{ lead: CentralLead; tipo: "atendeu" | "naoatendeu" | "perdido" } | null>(null);
  const [obs, setObs] = useState("");
  const [motivo, setMotivo] = useState<string>(MOTIVOS_PERDA_CENTRAL[0]);
  const [motivoOutro, setMotivoOutro] = useState("");
  const [etapa, setEtapa] = useState<LeadStatus | "">(""); // etapa escolhida no ATENDER
  const [salvando, setSalvando] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [timelineDe, setTimelineDe] = useState<CentralLead | null>(null);
  const [eventos, setEventos] = useState<CentralLeadEvento[] | null>(null);

  // admin: distribuição + cadastro + importação
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [distVend, setDistVend] = useState("");
  const [qtd, setQtd] = useState(20);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novo, setNovo] = useState({ nome: "", telefone: "", produto: "", origem: "Tráfego Pago", prioridade: "normal" as Prioridade });
  const [importOpen, setImportOpen] = useState(false);
  const [colar, setColar] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Últimos 24 meses para o seletor, do mais recente para o mais antigo. */
  const mesesDisponiveis = useMemo(() => {
    const hoje = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return { ym, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  }, []);

  const periodoLabel = useMemo(() => {
    if (!mesRef) return "Fila atual";
    return mesesDisponiveis.find((m) => m.ym === mesRef)?.label ?? mesRef;
  }, [mesRef, mesesDisponiveis]);

  // busca o mês escolhido no banco (inclui encerrados, que não ficam na fila)
  useEffect(() => {
    let vivo = true;
    // tudo dentro do timeout: o React 19 não aceita setState solto no efeito
    const id = setTimeout(() => {
      if (!vivo) return;
      if (!mesRef) {
        setLeadsDoMes(null);
        setCarregandoMes(false);
        return;
      }
      setCarregandoMes(true);
      const [ano, mes] = mesRef.split("-").map(Number);
      const de = new Date(ano, mes - 1, 1).toISOString();
      const ate = new Date(ano, mes, 1).toISOString();
      void centralLeadsApi
        .doPeriodo(de, ate)
        .then((r) => {
          if (vivo) setLeadsDoMes(r);
        })
        .finally(() => {
          if (vivo) setCarregandoMes(false);
        });
    }, 0);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [mesRef]);

  /** Fonte da lista: fila atual OU o mês escolhido. */
  const base = useMemo(() => (mesRef ? (leadsDoMes ?? []) : leads), [mesRef, leadsDoMes, leads]);

  const naoDistribuidos = useMemo(() => leads.filter((l) => l.status === "novo"), [leads]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return base
      .filter((l) => (soTestes ? l.teste === true : true))
      .filter((l) => (fPrioridade === "todas" ? true : l.prioridade === fPrioridade))
      .filter((l) => (fStatus === "todos" ? true : l.status === fStatus))
      // lead com status "novo" é o que ainda não foi para nenhum consultor
      .filter((l) => (!admin ? true : aba === "novos" ? l.status === "novo" : l.status !== "novo"))
      // barra de consultores: só faz sentido sobre os que já foram enviados
      .filter((l) => (!admin || aba !== "enviados" || !fConsultor ? true : l.vendedorId === fConsultor))
      .filter((l) => {
        if (!q) return true;
        return (
          l.nome.toLowerCase().includes(q) ||
          (l.telefone ?? "").toLowerCase().includes(q) ||
          (l.produto ?? "").toLowerCase().includes(q) ||
          (l.subproduto ?? "").toLowerCase().includes(q) ||
          (l.faixaCredito ?? "").toLowerCase().includes(q) ||
          (l.origem ?? "").toLowerCase().includes(q) ||
          (vendedores.find((v) => v.id === l.vendedorId)?.nome ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const pa = PRIORIDADE_INFO[a.prioridade].ordem - PRIORIDADE_INFO[b.prioridade].ordem;
        if (pa !== 0) return pa;
        return new Date(b.recebidoEm).getTime() - new Date(a.recebidoEm).getTime();
      });
  }, [base, busca, fPrioridade, fStatus, soTestes, vendedores, admin, aba, fConsultor]);

  /**
   * Quantos leads cada consultor tem agora entre os ENVIADOS.
   * Conta sobre a população da aba, não sobre a lista já filtrada — senão o
   * número mudaria conforme a busca e deixaria de responder "quanto cada um tem".
   */
  const porConsultor = useMemo(() => {
    const enviados = base
      .filter((l) => (soTestes ? l.teste === true : true))
      .filter((l) => l.status !== "novo");
    const mapa = new Map<string, number>();
    for (const l of enviados) {
      const k = l.vendedorId ?? "";
      mapa.set(k, (mapa.get(k) ?? 0) + 1);
    }
    const lista = [...mapa.entries()]
      .map(([id, total]) => ({ id, nome: id ? nomeVend(id) : "Sem consultor", total }))
      .sort((a, b) => b.total - a.total);
    return { total: enviados.length, lista };
    // nomeVend depende de `vendedores`, que já está nas dependências
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, soTestes, vendedores]);

  const MOTIVOS_REDIST = ["Consultor faltou", "Ausência", "Folga", "Reorganização", "Outro"];

  function abrirRedist(l: CentralLead) {
    setRedist(l);
    setRedistPara("");
    setRedistMotivo("");
    setRedistOutro("");
  }

  async function confirmarRedist() {
    if (!redist || !redistPara) return;
    const motivo = redistMotivo === "Outro" ? redistOutro.trim() : redistMotivo;
    setRedistSalvando(true);
    try {
      await centralLeadsApi.redistribuir(redist.id, redistPara, motivo || undefined);
      notify.success(`Lead passou para ${nomeVend(redistPara)}.`);
      setRedist(null);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não consegui redistribuir.");
    } finally {
      setRedistSalvando(false);
    }
  }

  /** Contadores das abas — seguem a mesma fonte e o mesmo filtro de teste. */
  const contagemAbas = useMemo(() => {
    const arr = base.filter((l) => (soTestes ? l.teste === true : true));
    return {
      novos: arr.filter((l) => l.status === "novo").length,
      enviados: arr.filter((l) => l.status !== "novo").length,
    };
  }, [base, soTestes]);

  const kpis = useMemo(() => {
    const aguardando = leads.filter((l) => l.status === "aguardando").length;
    const aguardResp = leads.filter((l) => l.status === "aguardando_resposta").length;
    return { aguardando, aguardResp, novos: naoDistribuidos.length };
  }, [leads, naoDistribuidos]);

  async function excluir(l: CentralLead) {
    if (
      !confirm(
        `Remover "${l.nome}" da Central?

O lead sai da fila e das métricas, mas continua guardado no banco — dá para auditar depois.`,
      )
    )
      return;
    setExcluindo(true);
    try {
      await centralLeadsApi.excluir([l.id], { motivo: l.teste ? "Lead de teste" : "Removido pelo admin" });
      if (mesRef) setLeadsDoMes((v) => (v ?? []).filter((x) => x.id !== l.id));
      notify.success("Lead removido da Central");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não consegui remover");
    } finally {
      setExcluindo(false);
    }
  }

  async function excluirSelecionados() {
    const ids = [...sel];
    if (!confirm(`Remover ${ids.length} lead(s) da Central?

Eles saem da fila e das métricas, mas continuam guardados no banco.`))
      return;
    setExcluindo(true);
    try {
      const n = await centralLeadsApi.excluir(ids, { motivo: "Removidos pelo admin" });
      if (mesRef) setLeadsDoMes((v) => (v ?? []).filter((x) => !ids.includes(x.id)));
      setSel(new Set());
      notify.success(`${n} lead(s) removido(s)`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não consegui remover");
    } finally {
      setExcluindo(false);
    }
  }

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  function toggleSel(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function abrirAcao(lead: CentralLead, tipo: "atendeu" | "naoatendeu" | "perdido") {
    setAcao({ lead, tipo });
    setObs("");
    setMotivo(MOTIVOS_PERDA_CENTRAL[0]);
    setMotivoOutro("");
    setEtapa(""); // consultor escolhe a etapa — nunca assume
  }

  async function confirmarAcao(e: React.FormEvent) {
    e.preventDefault();
    if (!acao) return;
    if (acao.tipo === "atendeu" && !etapa) return; // etapa é obrigatória
    setSalvando(true);
    try {
      if (acao.tipo === "atendeu") {
        await centralLeadsApi.atendeu(acao.lead.id, obs, etapa as LeadStatus);
        notify.success("Enviado ao Pipeline", LEAD_STATUS_INFO[etapa as LeadStatus].label);
      } else if (acao.tipo === "naoatendeu") {
        await centralLeadsApi.naoAtendeu(acao.lead.id, obs);
        notify.success("Registrado", "Não atendeu");
      } else {
        const m = motivo === "Outros" ? motivoOutro.trim() || "Outros" : motivo;
        await centralLeadsApi.perder(acao.lead.id, m);
        notify.success("Lead marcado como perdido");
      }
      setAcao(null);
    } catch (err) {
      notify.error("Erro", err instanceof Error ? err.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  async function abrirTimeline(lead: CentralLead) {
    setTimelineDe(lead);
    setEventos(null);
    setEventos(await centralLeadsApi.historico(lead.id));
  }

  // --- admin: distribuição ---
  async function distribuir(ids: string[]) {
    if (!distVend) {
      notify.error("Escolha um consultor");
      return;
    }
    if (ids.length === 0) {
      notify.error("Nenhum lead para distribuir");
      return;
    }
    setSalvando(true);
    try {
      await centralLeadsApi.distribuir(ids, distVend);
      notify.success(`${ids.length} lead(s) distribuído(s)`, nomeVend(distVend));
      setSel(new Set());
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }
  function distribuirMaisAntigos() {
    const ids = [...naoDistribuidos]
      .sort((a, b) => new Date(a.recebidoEm).getTime() - new Date(b.recebidoEm).getTime())
      .slice(0, Math.max(0, qtd))
      .map((l) => l.id);
    void distribuir(ids);
  }

  // --- admin: cadastro manual ---
  async function salvarNovo(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.nome.trim()) return;
    setSalvando(true);
    try {
      await centralLeadsApi.add({
        nome: novo.nome.trim(),
        telefone: novo.telefone.trim() || undefined,
        produto: novo.produto.trim() || undefined,
        origem: novo.origem.trim() || undefined,
        prioridade: novo.prioridade,
      });
      notify.success("Lead adicionado à Central");
      setNovoOpen(false);
      setNovo({ nome: "", telefone: "", produto: "", origem: "Tráfego Pago", prioridade: "normal" });
    } catch (err) {
      notify.error("Erro", err instanceof Error ? err.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  // --- admin: importação ---
  async function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const rows = raw.map(mapObjRow).filter((r) => r.nome);
      setImportRows(rows);
      notify.success(`${rows.length} linha(s) lidas`);
    } catch (err) {
      notify.error("Não consegui ler o arquivo", err instanceof Error ? err.message : undefined);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function lerColado() {
    const rows: ImportRow[] = colar
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const c = line.split(/\t|;|,/).map((x) => x.trim());
        return { nome: c[0] ?? "", telefone: c[1], produto: c[2], origem: c[3] };
      })
      .filter((r) => r.nome);
    setImportRows(rows);
    notify.success(`${rows.length} linha(s) reconhecidas`);
  }
  async function confirmarImport() {
    if (importRows.length === 0) return;
    setSalvando(true);
    try {
      const n = await centralLeadsApi.importar(importRows);
      notify.success(`${n} lead(s) importado(s)`);
      setImportOpen(false);
      setImportRows([]);
      setColar("");
    } catch (err) {
      notify.error("Erro na importação", err instanceof Error ? err.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  const temAlertas = kpis.aguardResp > 0 || kpis.aguardando > 0;

  return (
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#2563FF" }}>
            <Inbox className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Central de Leads
            </h1>
            <p className="text-sm text-white/70">
              {admin ? "Distribua e acompanhe os leads da equipe" : "Seus leads para atender"}
            </p>
          </div>
        </div>
        {admin && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Importar
            </Button>
            <Button onClick={() => setNovoOpen(true)}>
              <Plus className="h-4 w-4" /> Novo lead
            </Button>
          </div>
        )}
      </header>

      {/* Painel de distribuição (admin) */}
      {admin && (
        <div className="lb-card-premium lb-fade-up rounded-2xl p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="distVend">Distribuir para o consultor</Label>
              <select
                id="distVend"
                value={distVend}
                onChange={(e) => setDistVend(e.target.value)}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                <option value="">— escolha —</option>
                {vendedoresAtivos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <Label htmlFor="qtd">Qtd.</Label>
              <Input id="qtd" type="number" min={1} value={qtd} onChange={(e) => setQtd(Number(e.target.value) || 0)} />
            </div>
            <Button variant="secondary" disabled={salvando || naoDistribuidos.length === 0} onClick={distribuirMaisAntigos}>
              <Send className="h-4 w-4" /> {qtd} mais antigos
            </Button>
            <Button disabled={salvando || sel.size === 0} onClick={() => distribuir([...sel])}>
              <Send className="h-4 w-4" /> Selecionados ({sel.size})
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-white/70">
            {naoDistribuidos.length} lead(s) aguardando distribuição · marque os cards para escolher manualmente.
          </p>
        </div>
      )}

      {/* Lembrete/alerta */}
      {temAlertas && !admin && (
        <div
          className="lb-fade-up flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm"
          style={{ boxShadow: "0 0 30px -12px #f59e0b" }}
        >
          <span className="flex items-center gap-2 font-semibold text-amber-200">
            <Clock className="h-4 w-4" />
            {kpis.aguardando > 0 && <>Você tem {kpis.aguardando} lead(s) aguardando ligação.</>}
          </span>
          {kpis.aguardResp > 0 && <span className="text-amber-100/80">{kpis.aguardResp} aguardando retorno após mensagem.</span>}
        </div>
      )}

      {/* Abas: o que falta enviar × o que já foi */}
      {admin && (
        <div className="lb-fade-up flex flex-wrap gap-2" role="tablist" aria-label="Situação dos leads">
          {([
            { id: "novos", rotulo: "NOVOS", total: contagemAbas.novos, cor: "#2563FF" },
            { id: "enviados", rotulo: "ENVIADOS", total: contagemAbas.enviados, cor: "#10B981" },
          ] as const).map((t) => {
            const ativa = aba === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => {
                  setAba(t.id);
                  // seleção some junto: marcado numa aba não faz sentido na outra
                  setSel(new Set());
                  setFConsultor("");
                }}
                className="flex h-12 items-center gap-2 rounded-xl border px-4 text-sm font-bold uppercase tracking-wider transition-colors"
                style={{
                  borderColor: ativa ? t.cor : "rgba(255,255,255,.14)",
                  background: ativa ? `${t.cor}22` : "rgba(255,255,255,.04)",
                  color: ativa ? t.cor : "rgba(255,255,255,.75)",
                }}
              >
                {t.rotulo}
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                  style={{ background: ativa ? `${t.cor}33` : "rgba(255,255,255,.10)" }}
                >
                  {t.total}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Barra de consultores — bater o olho e saber quanto cada um tem */}
      {admin && aba === "enviados" && porConsultor.lista.length > 0 && (
        <div className="lb-fade-up flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-white/60">
            Consultores
          </span>
          {[{ id: "", nome: "Todos", total: porConsultor.total }, ...porConsultor.lista].map((c) => {
            const ativo = fConsultor === c.id;
            return (
              <button
                key={c.id || "todos"}
                type="button"
                onClick={() => setFConsultor(c.id)}
                className="flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors"
                style={{
                  borderColor: ativo ? "#10B981" : "rgba(255,255,255,.14)",
                  background: ativo ? "rgba(16,185,129,.15)" : "rgba(255,255,255,.04)",
                  color: ativo ? "#6EE7B7" : "rgba(255,255,255,.8)",
                }}
              >
                <span className="max-w-[160px] truncate">{c.nome}</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                  style={{ background: ativo ? "rgba(16,185,129,.25)" : "rgba(255,255,255,.10)" }}
                >
                  {c.total}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="lb-fade-up flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
          <input
            placeholder="Buscar por nome, telefone, produto, origem, consultor…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] pl-10 pr-3 text-sm text-white outline-none backdrop-blur transition-all placeholder:text-white/55 focus:border-[#3B82F6] focus:bg-[#3B82F6]/10"
          />
        </div>
        <FiltroSelect<Prioridade | "todas">
          titulo="Prioridade"
          valor={fPrioridade}
          onChange={setFPrioridade}
          opcoes={[
            { valor: "todas", rotulo: "Prioridade: todas" },
            ...(Object.keys(PRIORIDADE_INFO) as Prioridade[]).map((p) => ({
              valor: p,
              rotulo: PRIORIDADE_INFO[p].label,
            })),
          ]}
        />
        <FiltroSelect<CentralLeadStatus | "todos">
          titulo="Status"
          valor={fStatus}
          onChange={setFStatus}
          opcoes={[
            { valor: "todos", rotulo: "Status: todos" },
            ...(Object.keys(CENTRAL_STATUS_INFO) as CentralLeadStatus[]).map((st) => ({
              valor: st,
              rotulo: CENTRAL_STATUS_INFO[st].label,
            })),
          ]}
        />
        <FiltroSelect<string>
          titulo="Período"
          largura={250}
          valor={mesRef}
          onChange={setMesRef}
          opcoes={[
            { valor: "", rotulo: "Fila atual" },
            ...mesesDisponiveis.map((m, i) => ({
              valor: m.ym,
              rotulo: i === 0 ? `Este mês — ${m.label}` : i === 1 ? `Mês anterior — ${m.label}` : m.label,
            })),
          ]}
        />
        {admin && (
          <button
            type="button"
            onClick={() => setSoTestes((v) => !v)}
            title="Mostrar apenas os leads de teste, para poder removê-los"
            className="h-11 rounded-xl border px-3 text-sm transition-colors"
            style={{
              borderColor: soTestes ? "rgba(245,158,11,.6)" : "rgba(255,255,255,.12)",
              background: soTestes ? "rgba(245,158,11,.15)" : "rgba(255,255,255,.04)",
              color: soTestes ? "#fcd34d" : "rgba(255,255,255,.7)",
            }}
          >
            {soTestes ? "Mostrando só testes" : "Só testes"}
          </button>
        )}
      </div>

      {/* período em foco + exclusão em massa */}
      <div className="lb-fade-up flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-white/60">
          Exibindo: <strong className="text-white">{periodoLabel}</strong>
          {carregandoMes ? " · buscando…" : ` · ${filtrados.length} lead(s)`}
          {mesRef ? " · inclui encerrados do mês" : " · leads em andamento"}
        </p>
        {admin && sel.size > 0 && (
          <button
            type="button"
            disabled={excluindo}
            onClick={() => void excluirSelecionados()}
            className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-1.5 font-semibold text-red-200 transition-colors hover:bg-red-400/20 disabled:opacity-60"
          >
            Excluir {sel.size} selecionado(s)
          </button>
        )}
      </div>

      {/* Cards */}
      {filtrados.length === 0 ? (
        <div className="lb-card-premium lb-fade-up rounded-2xl">
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="lb-orb h-12 w-12" style={{ ["--orb" as string]: "#2563FF" }}>
              <Inbox className="h-6 w-6" />
            </span>
            <p className="text-base font-bold text-white">
              {leads.length === 0 ? "Nenhum lead na Central" : "Nada encontrado com esses filtros"}
            </p>
            <p className="max-w-md text-sm text-white/70">
              {leads.length === 0
                ? admin
                  ? "Use “Novo lead” ou “Importar” para começar, depois distribua aos consultores."
                  : "Assim que o administrador distribuir leads para você, eles aparecem aqui."
                : "Ajuste a busca ou os filtros acima."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((l, i) => {
            const emAtend = l.status === "em_atendimento";
            const podeLigar = ["aguardando", "nao_atendeu", "aguardando_resposta"].includes(l.status);
            const naoDist = l.status === "novo";
            const marcado = sel.has(l.id);
            return (
              <div
                key={l.id}
                className="lb-card-premium lb-fade-up relative flex flex-col gap-3 rounded-2xl p-4"
                style={{ animationDelay: `${Math.min(i, 12) * 0.04}s`, outline: marcado ? "2px solid #2563FF" : undefined }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {admin && naoDist && (
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => toggleSel(l.id)}
                        className="h-4 w-4 accent-[#2563FF]"
                        title="Selecionar para distribuir"
                      />
                    )}
                    <PrioridadeBadge p={l.prioridade} />
                    {l.teste && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{ background: "rgba(245,158,11,.18)", color: "#fcd34d" }}
                        title="Veio da ferramenta de teste da Meta — não entra em métrica nenhuma"
                      >
                        Teste
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={l.status} />
                    {admin && (
                      <button
                        type="button"
                        disabled={excluindo}
                        onClick={() => void excluir(l)}
                        title="Remover da Central (continua no banco)"
                        aria-label={`Remover ${l.nome}`}
                        className="rounded-md p-1 text-white/60 transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-[17px] font-bold leading-tight tracking-tight text-white">{l.nome}</p>
                  {(l.produto || l.subproduto) && (
                    <p className="truncate text-[13px] font-medium text-white/80">
                      {[l.produto, l.subproduto].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {l.faixaCredito && (
                    <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-white/85">
                      <span aria-hidden>💰</span>
                      <span className="min-w-0 truncate">{l.faixaCredito}</span>
                    </p>
                  )}
                </div>

                {l.prazoInteresse && (
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                      Quer fechar
                    </p>
                    <PrazoBadge prazo={l.prazoInteresse} />
                  </div>
                )}

                <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs text-white/85 sm:grid-cols-2">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-white/70" />
                    <span className="truncate">{l.telefone || "—"}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-white/70" />
                    <span className="truncate">
                      Entrada: {fmtData(l.recebidoEm)} · {fmtHora(l.recebidoEm)}
                    </span>
                  </span>
                  {l.origem && (
                    <span className="truncate text-white/70 sm:col-span-2">Origem: {l.origem}</span>
                  )}
                  {/* para quem foi e quando — a pergunta da aba ENVIADOS */}
                  {l.vendedorId && (admin || veConsultor) && (
                    <span className="flex items-center gap-1.5 font-semibold text-emerald-300/90 sm:col-span-2">
                      <UserRound className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Enviado para: {nomeVend(l.vendedorId)}</span>
                    </span>
                  )}
                  {l.distribuidoEm && (admin || veConsultor) && (
                    <span className="truncate text-white/70 sm:col-span-2">
                      Enviado: {fmtData(l.distribuidoEm)} · {fmtHora(l.distribuidoEm)}
                    </span>
                  )}
                  {l.status === "aguardando_resposta" && l.mensagemEnviadaEm && (
                    <span className="col-span-2 text-amber-300/90">Mensagem enviada {tempoDesde(l.mensagemEnviadaEm)}</span>
                  )}
                </div>

                <div className="flex gap-2">
                  {waLink(l.telefone) && (
                    <a
                      href={waLink(l.telefone)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  )}
                  {telLink(l.telefone) && (
                    <a
                      href={telLink(l.telefone)}
                      className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] text-xs font-semibold text-white/80 transition-colors hover:bg-white/[0.08]"
                    >
                      <Phone className="h-3.5 w-3.5" /> Discar
                    </a>
                  )}
                  <button
                    onClick={() => abrirTimeline(l)}
                    title="Ficha completa — respostas do formulário e histórico"
                    className="grid h-8 w-9 shrink-0 place-items-center rounded-lg border border-white/12 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/[0.08]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </button>
                </div>

                {admin && l.vendedorId && (
                  <button
                    type="button"
                    onClick={() => abrirRedist(l)}
                    title="Passar este lead para outro consultor, mantendo o histórico"
                    className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20"
                  >
                    <Repeat className="h-3.5 w-3.5" /> Redistribuir
                  </button>
                )}

                {naoDist ? (
                  <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-[11px] text-white/70">
                    {admin ? "Selecione e distribua a um consultor" : "Aguardando distribuição"}
                  </p>
                ) : emAtend ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Button onClick={() => abrirAcao(l, "atendeu")} className="!h-9 !px-2 text-xs">
                      <CheckCircle2 className="h-4 w-4" /> Atendeu
                    </Button>
                    <Button variant="secondary" onClick={() => abrirAcao(l, "naoatendeu")} className="!h-9 !px-2 text-xs">
                      <XCircle className="h-4 w-4" /> Não
                    </Button>
                    <Button variant="secondary" onClick={() => abrirAcao(l, "perdido")} className="!h-9 !px-2 text-xs !text-rose-300">
                      <Ban className="h-4 w-4" /> Perdido
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => run(l.id, () => centralLeadsApi.iniciarLigacao(l.id))}
                      disabled={busy === l.id || !podeLigar}
                      className="!h-9 flex-1 text-sm"
                    >
                      <PhoneCall className="h-4 w-4" /> Ligar
                    </Button>
                    {l.status === "nao_atendeu" && (
                      <Button
                        variant="secondary"
                        onClick={() => run(l.id, () => centralLeadsApi.mensagemEnviada(l.id))}
                        disabled={busy === l.id}
                        className="!h-9 flex-1 text-xs"
                      >
                        <MessageCircle className="h-4 w-4" /> Msg enviada
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de ação (obs/motivo) */}
      <Modal
        open={!!acao}
        onClose={() => setAcao(null)}
        title={
          acao?.tipo === "atendeu"
            ? "Atender e enviar ao Pipeline"
            : acao?.tipo === "naoatendeu"
              ? "Não atendeu"
              : "Marcar como perdido"
        }
        subtitle={acao?.lead.nome}
        icon={
          acao?.tipo === "atendeu" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : acao?.tipo === "perdido" ? (
            <Ban className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )
        }
      >
        <form onSubmit={confirmarAcao} className="space-y-4">
          {acao?.tipo === "perdido" ? (
            <>
              <div>
                <Label htmlFor="motivo">Motivo</Label>
                <select
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
                >
                  {MOTIVOS_PERDA_CENTRAL.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              {motivo === "Outros" && (
                <div>
                  <Label htmlFor="outro">Descreva</Label>
                  <Input id="outro" value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value)} placeholder="Motivo…" />
                </div>
              )}
            </>
          ) : acao?.tipo === "atendeu" ? (
            <>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
                <span className="text-[var(--color-text-dim)]">Consultor: </span>
                <span className="font-semibold text-[var(--color-text)]">{nomeVend(acao.lead.vendedorId)}</span>
              </div>
              <div>
                <Label>Etapa inicial no Pipeline</Label>
                <div className="mt-1 grid gap-1.5">
                  {STATUS_ORDER.map((s) => {
                    const sel = etapa === s;
                    return (
                      <label
                        key={s}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          sel
                            ? "border-[#3B82F6] bg-[#3B82F6]/12 text-[var(--color-text)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="etapa-central"
                          checked={sel}
                          onChange={() => setEtapa(s)}
                          className="h-4 w-4 accent-[#3B82F6]"
                        />
                        {LEAD_STATUS_INFO[s].label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label htmlFor="obs">Observações (opcional)</Label>
                <textarea
                  id="obs"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  rows={3}
                  placeholder="O que o cliente falou, próximos passos…"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[#3B82F6]"
                />
              </div>
              <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200/90">
                Ao confirmar, o negócio é criado no <b>Pipeline</b> na etapa escolhida, no seu nome, com todo o
                histórico — e o card sai da Central na hora.
              </p>
            </>
          ) : (
            <div>
              <Label htmlFor="obs">Observações (opcional)</Label>
              <textarea
                id="obs"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={4}
                placeholder="Ex.: caixa postal, chamou e não atendeu…"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[#3B82F6]"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setAcao(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || (acao?.tipo === "atendeu" && !etapa)}>
              {salvando ? "Salvando…" : "Confirmar"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Redistribuir (admin) */}
      <Modal
        open={!!redist}
        onClose={() => setRedist(null)}
        title="Redistribuir lead"
        subtitle={redist?.nome}
      >
        {redist && (
          <div className="space-y-5">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              <span className="text-[var(--color-text-dim)]">Está com: </span>
              <span className="font-semibold text-[var(--color-text)]">{nomeVend(redist.vendedorId)}</span>
              {redist.distribuidoEm && (
                <span className="text-[var(--color-text-dim)]">
                  {" "}· desde {fmtData(redist.distribuidoEm)} {fmtHora(redist.distribuidoEm)}
                </span>
              )}
            </div>

            <div>
              <Label>Passar para</Label>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {vendedoresAtivos
                  .filter((v) => v.id !== redist.vendedorId)
                  .map((v) => {
                    const escolhido = redistPara === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setRedistPara(v.id)}
                        className={`flex h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${
                          escolhido
                            ? "border-[var(--color-brand)] bg-[var(--color-brand)]/12 font-semibold text-[var(--color-text)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                        }`}
                      >
                        <UserRound className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="truncate">{v.nome}</span>
                      </button>
                    );
                  })}
              </div>
              {vendedoresAtivos.filter((v) => v.id !== redist.vendedorId).length === 0 && (
                <p className="mt-1.5 text-sm text-[var(--color-text-dim)]">
                  Não há outro consultor ativo para receber este lead.
                </p>
              )}
            </div>

            <div>
              <Label>Motivo (opcional)</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {MOTIVOS_REDIST.map((m) => {
                  const escolhido = redistMotivo === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setRedistMotivo(escolhido ? "" : m)}
                      className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                        escolhido
                          ? "border-[var(--color-brand)] bg-[var(--color-brand)]/12 text-[var(--color-text)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              {redistMotivo === "Outro" && (
                <textarea
                  rows={2}
                  value={redistOutro}
                  onChange={(e) => setRedistOutro(e.target.value)}
                  placeholder="Escreva o motivo"
                  className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[#3B82F6]"
                />
              )}
            </div>

            <p className="text-xs text-[var(--color-text-dim)]">
              É o mesmo lead: nada é duplicado e o histórico fica guardado na ficha —
              quem recebeu antes, quem passou a atender e o motivo.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRedist(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void confirmarRedist()} disabled={!redistPara || redistSalvando}>
                <Repeat className="h-4 w-4" />
                {redistSalvando ? "Passando…" : "Confirmar"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Novo lead (admin) */}
      <Modal open={novoOpen} onClose={() => setNovoOpen(false)} title="Novo lead" subtitle="Cadastro manual na Central" icon={<Plus className="h-5 w-5" />}>
        <form onSubmit={salvarNovo} className="space-y-4">
          <div>
            <Label htmlFor="n-nome">Nome</Label>
            <Input id="n-nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="n-tel">Telefone</Label>
              <Input id="n-tel" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <Label htmlFor="n-prod">Produto</Label>
              <input
                id="n-prod"
                list="produtos-central"
                value={novo.produto}
                onChange={(e) => setNovo({ ...novo, produto: e.target.value })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)]"
              />
              <datalist id="produtos-central">
                {PRODUTOS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="n-orig">Origem</Label>
              <Input id="n-orig" value={novo.origem} onChange={(e) => setNovo({ ...novo, origem: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="n-prio">Prioridade</Label>
              <select
                id="n-prio"
                value={novo.prioridade}
                onChange={(e) => setNovo({ ...novo, prioridade: e.target.value as Prioridade })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                {(Object.keys(PRIORIDADE_INFO) as Prioridade[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORIDADE_INFO[p].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setNovoOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Adicionar"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Importar (admin) */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar leads"
        subtitle="Excel/CSV ou colar lista"
        icon={<FileSpreadsheet className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <div>
            <Label>Arquivo (.xlsx / .csv)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onArquivo}
              className="block w-full text-sm text-[var(--color-text-dim)] file:mr-3 file:rounded-lg file:border-0 file:bg-[#2563FF] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--color-text)] hover:file:bg-[#1d4ed8]"
            />
            <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">Colunas reconhecidas: Nome, Telefone, Produto, Origem.</p>
          </div>
          <div>
            <Label htmlFor="colar">Ou cole a lista (uma por linha: Nome, Telefone, Produto, Origem)</Label>
            <textarea
              id="colar"
              value={colar}
              onChange={(e) => setColar(e.target.value)}
              rows={5}
              placeholder={"João, 79999999999, Imóvel, Instagram\nMaria; 7988888888; Carro; Tráfego Pago"}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[#3B82F6]"
            />
            <div className="mt-2">
              <Button type="button" variant="secondary" onClick={lerColado} disabled={!colar.trim()}>
                Pré-visualizar lista colada
              </Button>
            </div>
          </div>

          {importRows.length > 0 && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">{importRows.length} lead(s) prontos para importar:</p>
              <div className="lb-scroll max-h-40 space-y-1 overflow-y-auto pr-1 text-xs text-[var(--color-text-dim)]">
                {importRows.slice(0, 8).map((r, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="truncate">{r.nome}</span>
                    <span className="shrink-0 text-[var(--color-text-dim)]">{r.telefone || "—"}</span>
                  </div>
                ))}
                {importRows.length > 8 && <p className="text-[var(--color-text-dim)]">…e mais {importRows.length - 8}</p>}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={salvando || importRows.length === 0} onClick={confirmarImport}>
              {salvando ? "Importando…" : `Importar ${importRows.length || ""}`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal timeline */}
      <Modal
        open={!!timelineDe}
        onClose={() => setTimelineDe(null)}
        title="Ficha do lead"
        subtitle={timelineDe?.nome}
        icon={<FileText className="h-5 w-5" />}
      >
        {/* identificação */}
        {timelineDe && (
          <div className="mb-4 space-y-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3">
              <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                {[
                  ["Produto", timelineDe.produto],
                  ["Telefone", timelineDe.telefone],
                  ["Origem", timelineDe.origem],
                  ["Entrou em", `${fmtData(timelineDe.recebidoEm)} · ${fmtHora(timelineDe.recebidoEm)}`],
                  ["Consultor", nomeVend(timelineDe.vendedorId)],
                  ["Status", CENTRAL_STATUS_INFO[timelineDe.status].label],
                  ["Prioridade (CRM)", PRIORIDADE_INFO[timelineDe.prioridade].label],
                  ["Subproduto", timelineDe.subproduto],
                  ["Faixa de crédito", timelineDe.faixaCredito],
                  ["Objetivo", timelineDe.objetivo],
                  ["Prazo (cliente)", timelineDe.prazoInteresse],
                ].map(([rot, val]) =>
                  val ? (
                    <div key={rot as string} className="flex min-w-0 gap-1.5">
                      <dt className="shrink-0 text-[var(--color-text-dim)]">{rot}:</dt>
                      <dd className="min-w-0 break-words font-medium">{val}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </div>

            {/* Informações do formulário — respostas originais, sem interpretação */}
            <section>
              <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
                Informações do formulário
              </h4>
              {timelineDe.formulario && timelineDe.formulario.length > 0 ? (
                <dl className="space-y-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
                  {timelineDe.formulario.map((c, i) => (
                    <div key={`${c.pergunta}-${i}`} className="min-w-0">
                      <dt className="break-words text-[11px] text-[var(--color-text-dim)]">{c.pergunta}</dt>
                      <dd className="break-words text-sm font-medium">{c.resposta}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-text-dim)]">
                  Este lead não veio de formulário da Meta — não há respostas para mostrar.
                  {timelineDe.observacoes ? " O que foi informado está nas observações abaixo." : ""}
                </p>
              )}
            </section>

            {timelineDe.observacoes && (
              <section>
                <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
                  Observações
                </h4>
                <p className="whitespace-pre-wrap break-words rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3 text-xs leading-relaxed">
                  {timelineDe.observacoes}
                </p>
              </section>
            )}

            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
              Histórico da negociação
            </h4>
          </div>
        )}

        {eventos === null ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">Carregando…</p>
        ) : eventos.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">Sem eventos registrados.</p>
        ) : (
          <ol className="lb-scroll max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {eventos.map((ev) => (
              <li key={ev.id} className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#3B82F6]" style={{ boxShadow: "0 0 8px #3B82F6" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-text)]">
                    <span className="font-semibold capitalize">{ev.tipo.replace(/_/g, " ")}</span>
                    {ev.detalhe ? <span className="text-[var(--color-text-dim)]"> — {ev.detalhe}</span> : null}
                  </p>
                  {ev.campo && (
                    <p className="text-[11px] text-[var(--color-text-dim)]">
                      {ev.campo}: {ev.valorAnterior ?? "—"} → {ev.valorNovo ?? "—"}
                    </p>
                  )}
                  <p className="text-[11px] text-[var(--color-text-dim)]">
                    {fmtDataHora(ev.criadoEm)}
                    {ev.autorNome ? ` · ${ev.autorNome}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </PremiumStage>
  );
}
