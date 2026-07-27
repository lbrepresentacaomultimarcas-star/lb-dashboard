"use client";

import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  LifeBuoy,
  Lock,
  MessageCircle,
  Phone,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  TrendingUp,
  Trophy,
  Wallet,
  XCircle,
} from "lucide-react";
import { recuperacaoApi, useLeads, useSession, useVendedores } from "@/lib/store";
import { ehAdmin, temPermissao } from "@/lib/permissions";
import {
  ETAPAS_RECUPERACAO,
  LEAD_TIPO_INFO,
  NIVEL_RECUPERACAO_INFO,
  type Lead,
  type LeadStatus,
  type NivelRecuperacao,
} from "@/lib/types";
import { brl, cn, pct } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { exportPdf, exportXlsx } from "@/lib/export";
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
function diasParado(l: Lead): number {
  const base = l.perdidoEm ?? l.atualizadoEm ?? l.criadoEm;
  return Math.max(0, Math.floor((Date.now() - new Date(base).getTime()) / 86_400_000));
}
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const nivelDe = (l: Lead): NivelRecuperacao => l.nivelRecuperacao ?? "sem_info";

// ---------- KPI tile ----------
function Kpi({
  icon,
  label,
  value,
  hint,
  cor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  cor: string;
}) {
  return (
    <div className="lb-card-premium lb-fade-up rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
          style={{ background: `${cor}22`, color: cor, boxShadow: `0 0 18px -4px ${cor}` }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/55">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-extrabold tabular-nums text-white" style={{ letterSpacing: "-0.02em" }}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-white/45">{hint}</p>}
    </div>
  );
}

export default function RecuperacaoPage() {
  const leads = useLeads();
  const vendedores = useVendedores();
  const session = useSession();
  const admin = ehAdmin(session);
  const gestor = temPermissao(session, "supervisor");

  const nomeVend = (id?: string) => vendedores.find((v) => v.id === id)?.nome ?? "Sem consultor";

  // ---------- métricas do painel ----------
  // Banco de recuperação = perdidos que NÃO foram removidos da Central (limpos).
  const perdidos = useMemo(
    () => leads.filter((l) => l.status === "perdido" && !l.recuperacaoRemovidoEm),
    [leads],
  );
  const emRecuperacao = useMemo(
    () => leads.filter((l) => l.emRecuperacao && l.status !== "perdido" && l.status !== "fechamento"),
    [leads],
  );
  const recuperados = useMemo(
    () => leads.filter((l) => l.emRecuperacao && l.status === "fechamento"),
    [leads],
  );
  const valorRecuperado = useMemo(() => recuperados.reduce((s, l) => s + l.valorEstimado, 0), [recuperados]);
  const baseRecuperacao = useMemo(() => leads.filter((l) => l.emRecuperacao).length, [leads]);
  const taxa = baseRecuperacao ? (recuperados.length / baseRecuperacao) * 100 : 0;

  const ranking = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; valor: number }>();
    for (const l of recuperados) {
      const id = l.vendedorId ?? "sem";
      const cur = map.get(id) ?? { nome: nomeVend(l.vendedorId), qtd: 0, valor: 0 };
      cur.qtd += 1;
      cur.valor += l.valorEstimado;
      map.set(id, cur);
    }
    return [...map.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recuperados, vendedores]);

  // ---------- filtros + lista ----------
  const [busca, setBusca] = useState("");
  const [fNivel, setFNivel] = useState<"todos" | NivelRecuperacao>("todos");
  const [fConsultor, setFConsultor] = useState("todos");

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return perdidos
      .filter((l) => {
        if (q && !`${l.nome} ${l.telefone} ${l.email} ${l.origem ?? ""}`.toLowerCase().includes(q)) return false;
        if (fNivel !== "todos" && nivelDe(l) !== fNivel) return false;
        if (fConsultor !== "todos" && (l.vendedorId ?? "sem") !== fConsultor) return false;
        return true;
      })
      .sort((a, b) => diasParado(b) - diasParado(a));
  }, [perdidos, busca, fNivel, fConsultor]);

  // ---------- seleção ----------
  const [sel, setSel] = useState<Set<string>>(new Set());
  // Leads marcados nos checkboxes = base EXCLUSIVA de exportação/impressão/
  // transferência. INDEPENDE dos filtros da tela (busca/consultor/nível) — os
  // filtros só afetam o que a lista EXIBE, nunca o que é exportado.
  const selecionados = useMemo(
    () => perdidos.filter((l) => sel.has(l.id)).sort((a, b) => diasParado(b) - diasParado(a)),
    [perdidos, sel],
  );
  const todosSel = lista.length > 0 && lista.every((l) => sel.has(l.id));
  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleTodos = () => setSel(todosSel ? new Set() : new Set(lista.map((l) => l.id)));

  // ---------- nível (edição do gestor) ----------
  async function mudarNivel(l: Lead, nivel: NivelRecuperacao) {
    try {
      await recuperacaoApi.definirNivel(l.id, nivel);
    } catch (e) {
      notify.error("Erro ao salvar o nível", e instanceof Error ? e.message : undefined);
    }
  }

  // ---------- transferência ----------
  const [transfOpen, setTransfOpen] = useState(false);
  const [novoVend, setNovoVend] = useState("");
  const [etapa, setEtapa] = useState<LeadStatus>("primeiro_contato");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  // ---------- limpeza do banco ----------
  const [limparOpen, setLimparOpen] = useState(false);
  const [limpando, setLimpando] = useState(false);

  const idsParaTransferir = selecionados.map((l) => l.id);

  async function confirmarTransferencia() {
    if (!novoVend) return notify.error("Escolha o novo consultor");
    if (idsParaTransferir.length === 0) return notify.error("Selecione ao menos um lead");
    setSalvando(true);
    try {
      await recuperacaoApi.transferir(idsParaTransferir, { novoVendedorId: novoVend, etapa, motivo });
      const etapaLabel = ETAPAS_RECUPERACAO.find((e) => e.status === etapa)?.label ?? "";
      notify.success(
        `${idsParaTransferir.length} lead(s) transferido(s) 🎯`,
        `Agora com ${nomeVend(novoVend)} · iniciando em "${etapaLabel}".`,
      );
      setSel(new Set());
      setMotivo("");
      setTransfOpen(false);
    } catch (e) {
      notify.error("Erro ao transferir", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarLimpeza() {
    // Com seleção → limpa só os marcados; sem seleção → toda a lista atual.
    const alvos = selecionados.length > 0 ? selecionados : lista;
    const ids = alvos.map((l) => l.id);
    if (ids.length === 0) return setLimparOpen(false);
    setLimpando(true);
    try {
      await recuperacaoApi.limpar(ids);
      notify.success(
        `${ids.length} cliente(s) removido(s) da Central`,
        "Continuam no CRM, com todo o histórico preservado.",
      );
      setSel(new Set());
      setLimparOpen(false);
    } catch (e) {
      notify.error("Erro ao limpar", e instanceof Error ? e.message : undefined);
    } finally {
      setLimpando(false);
    }
  }

  // ---------- export ----------
  const hoje = new Date().toISOString().slice(0, 10);
  const HEAD = [
    "Nome",
    "Telefone",
    "Consultor anterior",
    "Origem",
    "Produto",
    "Valor",
    "Entrou no CRM",
    "Perdido em",
    "Dias parado",
    "Última observação",
    "Motivo da perda",
    "Nível",
  ];
  const linhas = () =>
    selecionados.map((l) => [
      l.nome,
      l.telefone || "—",
      nomeVend(l.vendedorId),
      l.origem || "—",
      l.tipo ? LEAD_TIPO_INFO[l.tipo].label : "—",
      brl(l.valorEstimado),
      fmtData(l.criadoEm),
      fmtData(l.perdidoEm),
      `${diasParado(l)} dias`,
      l.observacao || "—",
      l.motivoPerda || "—",
      NIVEL_RECUPERACAO_INFO[nivelDe(l)].label,
    ]);

  async function exportarPdf() {
    if (selecionados.length === 0) return notify.error("Marque os leads (checkbox) que deseja exportar.");
    try {
      await exportPdf({
        filename: `recuperacao-leads-${hoje}.pdf`,
        titulo: "Central de Recuperação de Leads — LB",
        subtitulo: `${selecionados.length} leads selecionados · gerado em ${new Date().toLocaleString("pt-BR")}`,
        head: HEAD,
        body: linhas(),
      });
    } catch (e) {
      notify.error("Erro ao gerar PDF", e instanceof Error ? e.message : undefined);
    }
  }
  async function exportarXlsx() {
    if (selecionados.length === 0) return notify.error("Marque os leads (checkbox) que deseja exportar.");
    try {
      await exportXlsx(`recuperacao-leads-${hoje}.xlsx`, { Recuperação: [HEAD, ...linhas()] });
    } catch (e) {
      notify.error("Erro ao gerar Excel", e instanceof Error ? e.message : undefined);
    }
  }

  // ---------- impressão (janela limpa A4) ----------
  function imprimir() {
    if (selecionados.length === 0) return notify.error("Marque os leads (checkbox) que deseja imprimir.");
    const linhasHtml = selecionados
      .map((l, i) => {
        const nv = NIVEL_RECUPERACAO_INFO[nivelDe(l)];
        return `<tr>
          <td class="c">${i + 1}</td>
          <td><b>${escapeHtml(l.nome)}</b></td>
          <td class="tel">${escapeHtml(l.telefone || "—")}</td>
          <td>${escapeHtml(nomeVend(l.vendedorId))}</td>
          <td><span class="lvl" style="color:${nv.cor}">${nv.emoji} ${nv.label}</span></td>
          <td>${escapeHtml(l.motivoPerda || "—")}</td>
          <td>${escapeHtml(l.observacao || "—")}</td>
        </tr>`;
      })
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Recuperação de Leads — LB</title>
      <style>
        *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px}
        h1{font-size:18px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th{background:#101a36;color:#fff;text-align:left;padding:7px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
        td{padding:7px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
        tr:nth-child(even) td{background:#f7f8fb}
        .c{text-align:center;color:#888;width:26px} .tel{font-weight:bold;font-size:12px;white-space:nowrap}
        .lvl{font-weight:bold;white-space:nowrap} .foot{margin-top:14px;color:#888;font-size:10px}
        @media print{body{margin:12mm}}
      </style></head><body>
      <h1>Central de Recuperação de Leads — LB</h1>
      <p class="sub">${selecionados.length} leads selecionados · gerado em ${new Date().toLocaleString("pt-BR")}</p>
      <table><thead><tr>
        <th>Nº</th><th>Nome</th><th>Telefone</th><th>Consultor anterior</th><th>Nível</th><th>Motivo da perda</th><th>Última observação</th>
      </tr></thead><tbody>${linhasHtml}</tbody></table>
      <p class="foot">LB Representações · lista para recuperação de clientes.</p>
      </body></html>`;
    const w = window.open("", "_blank", "width=1024,height=720");
    if (!w) return notify.error("Pop-up bloqueado", "Libere pop-ups deste site para imprimir.");
    w.document.write(html);
    w.document.close();
    w.focus();
    // janela criada por document.write nem sempre dispara onload → timeout confiável
    setTimeout(() => {
      try {
        w.print();
      } catch {
        /* usuário fecha manualmente se algo bloquear */
      }
    }, 350);
  }

  const selCls =
    "h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-[var(--color-brand)]";

  // Limpeza: com seleção → limpa os marcados; sem seleção → toda a lista atual.
  const modoSel = selecionados.length > 0;
  const qtdLimpeza = modoSel ? selecionados.length : lista.length;

  // Acesso EXCLUSIVO de administrador — bloqueia inclusive URL direta.
  if (!admin) {
    return (
      <PremiumStage>
        <div className="grid min-h-[55vh] place-items-center px-4 text-center">
          <div className="lb-fade-up max-w-md">
            <span className="lb-orb mx-auto mb-4 h-14 w-14" style={{ ["--orb" as string]: "#f43f5e" }}>
              <Lock className="h-6 w-6" />
            </span>
            <h1 className="text-2xl font-extrabold text-white">Acesso restrito</h1>
            <p className="mt-2 text-sm text-white/55">
              A Central de Recuperação de Leads é exclusiva para administradores.
            </p>
          </div>
        </div>
      </PremiumStage>
    );
  }

  return (
    <PremiumStage>
      {/* ---------- header ---------- */}
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#10b981" }}>
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
              Recuperação de Leads
            </h1>
            <p className="text-sm text-white/55">
              {perdidos.length} no banco · {emRecuperacao.length} em recuperação · {recuperados.length} recuperados
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={imprimir} disabled={selecionados.length === 0} title="Imprime só os leads marcados">
            <Printer className="h-4 w-4" /> Imprimir{selecionados.length > 0 ? ` (${selecionados.length})` : ""}
          </Button>
          <Button variant="secondary" size="sm" onClick={exportarPdf} disabled={selecionados.length === 0} title="Exporta só os leads marcados">
            <FileDown className="h-4 w-4" /> PDF{selecionados.length > 0 ? ` (${selecionados.length})` : ""}
          </Button>
          <Button variant="secondary" size="sm" onClick={exportarXlsx} disabled={selecionados.length === 0} title="Exporta só os leads marcados">
            <FileSpreadsheet className="h-4 w-4" /> Excel{selecionados.length > 0 ? ` (${selecionados.length})` : ""}
          </Button>
          {gestor && (
            <Button
              size="sm"
              onClick={() => setTransfOpen(true)}
              disabled={selecionados.length === 0}
              title={selecionados.length === 0 ? "Marque leads na lista" : "Transferir selecionados"}
            >
              <ArrowRightLeft className="h-4 w-4" /> Transferir {selecionados.length > 0 ? `(${selecionados.length})` : ""}
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={() => setLimparOpen(true)}
            disabled={qtdLimpeza === 0}
            title={modoSel ? "Remove os selecionados da Central (não exclui do CRM)" : "Limpa a lista atual da Central (não exclui do CRM)"}
          >
            <Trash2 className="h-4 w-4" /> {modoSel ? `Limpar selecionados (${selecionados.length})` : "Limpar Banco de Recuperação"}
          </Button>
        </div>
      </header>

      {/* ---------- painel de KPIs ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={<XCircle className="h-4 w-4" />} label="Disponíveis" value={String(perdidos.length)} hint="no banco de recuperação" cor="#f43f5e" />
        <Kpi icon={<RotateCcw className="h-4 w-4" />} label="Em recuperação" value={String(emRecuperacao.length)} hint="redistribuídos, em atendimento" cor="#f59e0b" />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Recuperados" value={String(recuperados.length)} hint="voltaram e fecharam" cor="#22c55e" />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Valor recuperado" value={brl(valorRecuperado)} hint="em negócios fechados" cor="#10b981" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Taxa de recuperação" value={pct(taxa)} hint="fecharam ÷ redistribuídos" cor="#6366f1" />
      </div>

      {/* ---------- ranking ---------- */}
      <div className="lb-card-premium lb-fade-up rounded-2xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Leads Recuperados — ranking de consultores</h2>
        </div>
        {ranking.length === 0 ? (
          <p className="text-sm text-white/45">Nenhum lead recuperado ainda. Assim que um lead transferido fechar, ele aparece aqui no nome do novo consultor.</p>
        ) : (
          <div className="space-y-2">
            {ranking.map((r, i) => (
              <div key={r.nome + i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black"
                  style={{
                    background: i === 0 ? "rgba(245,158,11,.2)" : "rgba(255,255,255,.06)",
                    color: i === 0 ? "#fcd34d" : "rgba(255,255,255,.65)",
                  }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{r.nome}</span>
                <span className="shrink-0 text-xs text-white/55">
                  <b className="text-white">{r.qtd}</b> recuperado{r.qtd > 1 ? "s" : ""}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-300">{brl(r.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- filtros ---------- */}
      <div className="lb-fade-up flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone, origem…"
            className={cn(selCls, "w-full pl-9")}
          />
        </div>
        <select value={fNivel} onChange={(e) => setFNivel(e.target.value as typeof fNivel)} className={selCls}>
          <option value="todos" className="bg-[#0b0d16]">Todos os níveis</option>
          {(Object.keys(NIVEL_RECUPERACAO_INFO) as NivelRecuperacao[]).map((k) => (
            <option key={k} value={k} className="bg-[#0b0d16]">
              {NIVEL_RECUPERACAO_INFO[k].emoji} {NIVEL_RECUPERACAO_INFO[k].label}
            </option>
          ))}
        </select>
        <select value={fConsultor} onChange={(e) => setFConsultor(e.target.value)} className={selCls}>
          <option value="todos" className="bg-[#0b0d16]">Todos os consultores</option>
          <option value="sem" className="bg-[#0b0d16]">Sem consultor</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id} className="bg-[#0b0d16]">{v.nome}</option>
          ))}
        </select>
        <span className="text-xs text-white/45">
          {lista.length} na lista{selecionados.length > 0 ? ` · ${selecionados.length} selecionados` : ""}
        </span>
      </div>

      {/* ---------- tabela ---------- */}
      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                {gestor && (
                  <th className="px-3 py-3">
                    <input type="checkbox" checked={todosSel} onChange={toggleTodos} aria-label="Selecionar todos" className="h-4 w-4 accent-[var(--color-brand)]" />
                  </th>
                )}
                <th className="px-3 py-3">Cliente</th>
                <th className="px-3 py-3">Telefone</th>
                <th className="px-3 py-3">Consultor anterior</th>
                <th className="px-3 py-3">Origem</th>
                <th className="px-3 py-3">Produto</th>
                <th className="px-3 py-3 text-right">Valor</th>
                <th className="px-3 py-3">Entrou</th>
                <th className="px-3 py-3">Perdido</th>
                <th className="px-3 py-3">Parado</th>
                <th className="px-3 py-3">Nível</th>
                <th className="px-3 py-3">Motivo / última obs.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {lista.map((l) => {
                const dias = diasParado(l);
                const diasCor = dias > 30 ? "#f43f5e" : dias > 14 ? "#f59e0b" : "rgba(255,255,255,.55)";
                const nv = NIVEL_RECUPERACAO_INFO[nivelDe(l)];
                const wa = waLink(l.telefone);
                const tel = telLink(l.telefone);
                const checked = sel.has(l.id);
                return (
                  <tr key={l.id} className={cn("transition-colors hover:bg-white/[0.05]", checked && "bg-[var(--color-brand)]/10")}>
                    {gestor && (
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={checked} onChange={() => toggle(l.id)} aria-label={`Selecionar ${l.nome}`} className="h-4 w-4 accent-[var(--color-brand)]" />
                      </td>
                    )}
                    <td className="px-3 py-3 font-semibold text-white">{l.nome}</td>
                    {/* telefone em destaque */}
                    <td className="px-3 py-3">
                      {l.telefone ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[15px] font-bold tabular-nums text-[var(--color-brand)] whitespace-nowrap">{l.telefone}</span>
                          {wa && (
                            <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp" className="rounded p-1 text-emerald-400 hover:bg-white/10">
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {tel && (
                            <a href={tel} title="Ligar" className="rounded p-1 text-white/60 hover:bg-white/10">
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-white/75">{nomeVend(l.vendedorId)}</td>
                    <td className="px-3 py-3 text-white/60">{l.origem || "—"}</td>
                    <td className="px-3 py-3 text-white/60">{l.tipo ? LEAD_TIPO_INFO[l.tipo].label : "—"}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-white/85">{brl(l.valorEstimado)}</td>
                    <td className="px-3 py-3 text-xs text-white/50">{fmtData(l.criadoEm)}</td>
                    <td className="px-3 py-3 text-xs text-white/50">{fmtData(l.perdidoEm)}</td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-bold tabular-nums" style={{ color: diasCor }}>{dias}d</span>
                    </td>
                    {/* nível — editável pelo gestor */}
                    <td className="px-3 py-3">
                      {gestor ? (
                        <select
                          value={nivelDe(l)}
                          onChange={(e) => mudarNivel(l, e.target.value as NivelRecuperacao)}
                          className="h-8 rounded-lg border px-2 text-xs font-semibold outline-none"
                          style={{ borderColor: `${nv.cor}55`, background: `${nv.cor}18`, color: nv.cor }}
                        >
                          {(Object.keys(NIVEL_RECUPERACAO_INFO) as NivelRecuperacao[]).map((k) => (
                            <option key={k} value={k} className="bg-[#0b0d16] text-white">
                              {NIVEL_RECUPERACAO_INFO[k].emoji} {NIVEL_RECUPERACAO_INFO[k].label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold"
                          style={{ borderColor: `${nv.cor}55`, background: `${nv.cor}18`, color: nv.cor }}
                        >
                          {nv.emoji} {nv.label}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-[260px]">
                      {l.motivoPerda && <p className="truncate text-xs text-white/70" title={l.motivoPerda}>⚠️ {l.motivoPerda}</p>}
                      <p className="truncate text-xs text-white/45" title={l.observacao ?? ""}>{l.observacao || (l.motivoPerda ? "" : "—")}</p>
                    </td>
                  </tr>
                );
              })}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={gestor ? 12 : 11} className="px-5 py-16">
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="lb-orb mb-3 h-12 w-12" style={{ ["--orb" as string]: "#10b981" }}>
                        <LifeBuoy className="h-6 w-6" />
                      </span>
                      <p className="text-base font-bold text-white">Nenhum lead perdido nesses filtros</p>
                      <p className="mt-1 text-sm text-white/50">Quando um negócio é marcado como perdido, ele aparece aqui para recuperação.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- modal de transferência ---------- */}
      <Modal
        open={transfOpen}
        onClose={() => setTransfOpen(false)}
        title="Transferir leads para recuperação"
        subtitle={`${idsParaTransferir.length} lead(s) selecionado(s)`}
        icon={<ArrowRightLeft className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <div>
            <Label>Novo consultor responsável</Label>
            <select value={novoVend} onChange={(e) => setNovoVend(e.target.value)} className={cn(selCls, "w-full")}>
              <option value="" className="bg-[#0b0d16]">Selecione…</option>
              {vendedores.filter((v) => v.ativo).map((v) => (
                <option key={v.id} value={v.id} className="bg-[#0b0d16]">{v.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Onde deseja iniciar este lead?</Label>
            <select value={etapa} onChange={(e) => setEtapa(e.target.value as LeadStatus)} className={cn(selCls, "w-full")}>
              {ETAPAS_RECUPERACAO.map((e) => (
                <option key={e.status} value={e.status} className="bg-[#0b0d16]">{e.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-white/40">O lead sai de “Perdidos” e entra nessa etapa do funil, com o novo consultor.</p>
          </div>
          <div>
            <Label>Motivo da transferência</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: redistribuição para novato, retomar contato…" />
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-white/55">
            Ao confirmar: o responsável é alterado, o histórico registra <b className="text-white/80">quem transferiu, para quem, data/hora e motivo</b>, e o lead deixa de aparecer para o consultor anterior. Quando fechar, a venda e a comissão contam para o novo consultor.
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setTransfOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarTransferencia} disabled={salvando || !novoVend || idsParaTransferir.length === 0}>
              <ArrowRightLeft className="h-4 w-4" /> {salvando ? "Transferindo…" : "Confirmar transferência"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ---------- modal de limpeza do banco ---------- */}
      <Modal
        open={limparOpen}
        onClose={() => setLimparOpen(false)}
        title="Limpar Banco de Recuperação"
        icon={<Trash2 className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-4 text-sm leading-relaxed text-white/85">
            <p className="mb-1 text-base font-extrabold text-[var(--color-danger)]">ATENÇÃO!</p>
            <p>Você está prestes a limpar o Banco de Recuperação.</p>
            <p className="mt-2">
              Essa ação removerá{" "}
              <b>
                {modoSel
                  ? `os ${selecionados.length} clientes selecionados`
                  : `todos os ${lista.length} clientes desta lista`}
              </b>
              , mas <b>NÃO excluirá nenhum cliente do CRM</b>.
            </p>
            <p className="mt-2">Os históricos permanecerão preservados.</p>
            <p className="mt-3 font-semibold">Deseja continuar?</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLimparOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarLimpeza} disabled={limpando || qtdLimpeza === 0}>
              <Trash2 className="h-4 w-4" /> {limpando ? "Limpando…" : "Confirmar"}
            </Button>
          </div>
        </div>
      </Modal>
    </PremiumStage>
  );
}
