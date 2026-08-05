"use client";

import { useMemo, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  History,
  Inbox,
  MessageCircle,
  Phone,
  PhoneCall,
  Plus,
  Search,
  Send,
  Upload,
  UserRound,
  XCircle,
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

/** Mapeia uma linha (objeto do xlsx) → ImportRow por nome de coluna. */
function mapObjRow(o: Record<string, unknown>): ImportRow {
  const get = (...keys: string[]) => {
    for (const k of Object.keys(o)) {
      if (keys.includes(k.trim().toLowerCase())) return String(o[k] ?? "").trim();
    }
    return "";
  };
  return {
    nome: get("nome", "cliente", "name"),
    telefone: get("telefone", "fone", "celular", "whatsapp", "phone"),
    produto: get("produto", "interesse", "produto de interesse"),
    origem: get("origem", "fonte", "source"),
  };
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
  const [fPrioridade, setFPrioridade] = useState<Prioridade | "todas">("todas");
  const [fStatus, setFStatus] = useState<CentralLeadStatus | "todos">("todos");

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

  const naoDistribuidos = useMemo(() => leads.filter((l) => l.status === "novo"), [leads]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return leads
      .filter((l) => (fPrioridade === "todas" ? true : l.prioridade === fPrioridade))
      .filter((l) => (fStatus === "todos" ? true : l.status === fStatus))
      .filter((l) => {
        if (!q) return true;
        return (
          l.nome.toLowerCase().includes(q) ||
          (l.telefone ?? "").toLowerCase().includes(q) ||
          (l.produto ?? "").toLowerCase().includes(q) ||
          (l.origem ?? "").toLowerCase().includes(q) ||
          (vendedores.find((v) => v.id === l.vendedorId)?.nome ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const pa = PRIORIDADE_INFO[a.prioridade].ordem - PRIORIDADE_INFO[b.prioridade].ordem;
        if (pa !== 0) return pa;
        return new Date(b.recebidoEm).getTime() - new Date(a.recebidoEm).getTime();
      });
  }, [leads, busca, fPrioridade, fStatus, vendedores]);

  const kpis = useMemo(() => {
    const aguardando = leads.filter((l) => l.status === "aguardando").length;
    const aguardResp = leads.filter((l) => l.status === "aguardando_resposta").length;
    return { aguardando, aguardResp, novos: naoDistribuidos.length };
  }, [leads, naoDistribuidos]);

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
            <p className="text-sm text-white/55">
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
          <p className="mt-2 text-[11px] text-white/45">
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

      {/* Filtros */}
      <div className="lb-fade-up flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            placeholder="Buscar por nome, telefone, produto, origem, consultor…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] pl-10 pr-3 text-sm text-white outline-none backdrop-blur transition-all placeholder:text-white/35 focus:border-[#3B82F6] focus:bg-[#3B82F6]/10"
          />
        </div>
        <select
          value={fPrioridade}
          onChange={(e) => setFPrioridade(e.target.value as Prioridade | "todas")}
          className="h-11 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-[#3B82F6]"
        >
          <option value="todas">Prioridade: todas</option>
          {(Object.keys(PRIORIDADE_INFO) as Prioridade[]).map((p) => (
            <option key={p} value={p}>
              {PRIORIDADE_INFO[p].label}
            </option>
          ))}
        </select>
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value as CentralLeadStatus | "todos")}
          className="h-11 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-[#3B82F6]"
        >
          <option value="todos">Status: todos</option>
          {(Object.keys(CENTRAL_STATUS_INFO) as CentralLeadStatus[]).map((s) => (
            <option key={s} value={s}>
              {CENTRAL_STATUS_INFO[s].label}
            </option>
          ))}
        </select>
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
            <p className="max-w-md text-sm text-white/55">
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
                  </div>
                  <StatusBadge status={l.status} />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">{l.nome}</p>
                  {l.produto && <p className="truncate text-xs text-white/60">{l.produto}</p>}
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-white/70">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-white/40" />
                    {l.telefone || "—"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-white/40" />
                    {fmtData(l.recebidoEm)} · {fmtHora(l.recebidoEm)}
                  </span>
                  {l.origem && <span className="col-span-2 text-white/45">Origem: {l.origem}</span>}
                  {veConsultor && (
                    <span className="col-span-2 flex items-center gap-1.5 text-white/45">
                      <UserRound className="h-3.5 w-3.5" />
                      {nomeVend(l.vendedorId)}
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
                    title="Histórico"
                    className="grid h-8 w-9 shrink-0 place-items-center rounded-lg border border-white/12 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/[0.08]"
                  >
                    <History className="h-3.5 w-3.5" />
                  </button>
                </div>

                {naoDist ? (
                  <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-[11px] text-white/45">
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
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                <span className="text-white/45">Consultor: </span>
                <span className="font-semibold text-white">{nomeVend(acao.lead.vendedorId)}</span>
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
                            ? "border-[#3B82F6] bg-[#3B82F6]/12 text-white"
                            : "border-white/10 bg-white/[0.02] text-white/75 hover:bg-white/[0.05]"
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
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-white outline-none focus:border-[#3B82F6]"
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
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-white outline-none focus:border-[#3B82F6]"
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
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-white"
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
              className="block w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-[#2563FF] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#1d4ed8]"
            />
            <p className="mt-1 text-[11px] text-white/40">Colunas reconhecidas: Nome, Telefone, Produto, Origem.</p>
          </div>
          <div>
            <Label htmlFor="colar">Ou cole a lista (uma por linha: Nome, Telefone, Produto, Origem)</Label>
            <textarea
              id="colar"
              value={colar}
              onChange={(e) => setColar(e.target.value)}
              rows={5}
              placeholder={"João, 79999999999, Imóvel, Instagram\nMaria; 7988888888; Carro; Tráfego Pago"}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-white outline-none focus:border-[#3B82F6]"
            />
            <div className="mt-2">
              <Button type="button" variant="secondary" onClick={lerColado} disabled={!colar.trim()}>
                Pré-visualizar lista colada
              </Button>
            </div>
          </div>

          {importRows.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="mb-2 text-xs font-semibold text-white">{importRows.length} lead(s) prontos para importar:</p>
              <div className="lb-scroll max-h-40 space-y-1 overflow-y-auto pr-1 text-xs text-white/70">
                {importRows.slice(0, 8).map((r, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="truncate">{r.nome}</span>
                    <span className="shrink-0 text-white/40">{r.telefone || "—"}</span>
                  </div>
                ))}
                {importRows.length > 8 && <p className="text-white/40">…e mais {importRows.length - 8}</p>}
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
      <Modal open={!!timelineDe} onClose={() => setTimelineDe(null)} title="Histórico do lead" subtitle={timelineDe?.nome} icon={<History className="h-5 w-5" />}>
        {eventos === null ? (
          <p className="py-6 text-center text-sm text-white/45">Carregando…</p>
        ) : eventos.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/45">Sem eventos registrados.</p>
        ) : (
          <ol className="lb-scroll max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {eventos.map((ev) => (
              <li key={ev.id} className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#3B82F6]" style={{ boxShadow: "0 0 8px #3B82F6" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">
                    <span className="font-semibold capitalize">{ev.tipo.replace(/_/g, " ")}</span>
                    {ev.detalhe ? <span className="text-white/70"> — {ev.detalhe}</span> : null}
                  </p>
                  {ev.campo && (
                    <p className="text-[11px] text-white/45">
                      {ev.campo}: {ev.valorAnterior ?? "—"} → {ev.valorNovo ?? "—"}
                    </p>
                  )}
                  <p className="text-[11px] text-white/40">
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
