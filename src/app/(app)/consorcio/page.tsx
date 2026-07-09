"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calculator,
  ExternalLink,
  FileText,
  History,
  Landmark,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { PremiumStage } from "@/components/premium-stage";
import {
  AnaliseComercial,
  AnaliseInteligente,
  Comparativo,
  PainelResultado,
  ResumoFinanceiro,
} from "@/components/consorcio/painel-premium";
import { notify } from "@/lib/notify";
import { useSession } from "@/lib/store";
import {
  CONFIG_PADRAO,
  NIVEL_INFO,
  SEGMENTO_INFO,
  consorcioApi,
  formatBRL,
  simularContemplacao,
  type ConsorcioAssembleia,
  type ConsorcioConfig,
  type ConsorcioCredito,
  type ConsorcioGrupo,
  type ConsorcioSegmento,
} from "@/lib/consorcio";

type HistSim = { id: string; cliente: string; carta: number; lance: number; prob: number; nivel: string; data: string };
const HIST_KEY = "lb-consorcio-hist";

type Aba = "simulador" | "creditos" | "grupos" | "assembleias";

const ABAS: { id: Aba; label: string }[] = [
  { id: "simulador", label: "Simulador" },
  { id: "creditos", label: "Créditos liberados" },
  { id: "grupos", label: "Grupos" },
  { id: "assembleias", label: "Assembleias" },
];

const hoje = () => new Date().toISOString().slice(0, 10);

export default function ConsorcioPage() {
  const session = useSession();
  const isAdmin = session?.papel === "admin";

  const [aba, setAba] = useState<Aba>("simulador");
  const [grupos, setGrupos] = useState<ConsorcioGrupo[]>([]);
  const [creditos, setCreditos] = useState<ConsorcioCredito[]>([]);
  const [assembleias, setAssembleias] = useState<ConsorcioAssembleia[]>([]);
  const [config, setConfig] = useState<ConsorcioConfig>(CONFIG_PADRAO);
  const [sincronizando, setSincronizando] = useState(false);

  // Simulador
  const [cliente, setCliente] = useState("");
  const [grupoSel, setGrupoSel] = useState("");
  const [carta, setCarta] = useState("");
  const [lance, setLance] = useState("");
  const [usarEmbutido, setUsarEmbutido] = useState(false);
  const [historico, setHistorico] = useState<HistSim[]>([]);

  // Filtros de créditos
  const [buscaCred, setBuscaCred] = useState("");
  const [segCred, setSegCred] = useState<"" | ConsorcioSegmento>("");

  // Form assembleia
  const [fa, setFa] = useState({ grupo: "", data: hoje(), numero: "", fixo: "", livre: "", menorPct: "", obs: "" });
  const [salvandoAsm, setSalvandoAsm] = useState(false);

  async function carregar() {
    const [g, c, a, cfg] = await Promise.all([
      consorcioApi.listarGrupos(),
      consorcioApi.listarCreditos(),
      consorcioApi.listarAssembleias(),
      consorcioApi.obterConfig(),
    ]);
    setGrupos(g);
    setCreditos(c);
    setAssembleias(a);
    setConfig(cfg);
  }
  useEffect(() => {
    void carregar();
    // Preparação p/ integração com o Pipeline: /consorcio?cliente=..&carta=..&lance=..&grupo=..
    try {
      const q = new URLSearchParams(window.location.search);
      const gc = (k: string) => q.get(k) ?? "";
      const raw = localStorage.getItem(HIST_KEY);
      /* eslint-disable react-hooks/set-state-in-effect */
      if (gc("cliente")) setCliente(gc("cliente"));
      if (gc("grupo")) setGrupoSel(gc("grupo"));
      if (gc("carta")) setCarta(gc("carta").replace(".", ","));
      if (gc("lance")) setLance(gc("lance").replace(".", ","));
      if (gc("embutido") === "1") setUsarEmbutido(true);
      if (raw) setHistorico(JSON.parse(raw) as HistSim[]);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* sem window/localStorage (SSR) — ignora */
    }
  }, []);

  async function sincronizar() {
    setSincronizando(true);
    const r = await consorcioApi.sincronizar();
    setSincronizando(false);
    if (!r.ok) return notify.error(r.erro ?? "Falha ao sincronizar");
    notify.success(`Tabelas atualizadas: ${r.grupos ?? 0} grupos, ${r.creditos ?? 0} créditos.`);
    void carregar();
  }

  const grupoAtual = grupos.find((g) => g.grupo === grupoSel) ?? null;
  const histGrupo = useMemo(
    () => assembleias.filter((a) => a.grupo === grupoSel),
    [assembleias, grupoSel],
  );

  const vCarta = Number(carta.replace(/\./g, "").replace(",", ".")) || 0;
  const vLance = Number(lance.replace(/\./g, "").replace(",", ".")) || 0;
  const resultado =
    vCarta > 0 && vLance > 0
      ? simularContemplacao({
          valorCarta: vCarta,
          valorLance: vLance,
          usarEmbutido,
          pctEmbutidoGrupo: grupoAtual?.pctEmbutido ?? 30,
          config,
          historico: histGrupo,
        })
      : null;

  const creditosFiltrados = useMemo(() => {
    const q = buscaCred.trim().toLowerCase();
    return creditos.filter(
      (c) =>
        (!segCred || c.segmento === segCred) &&
        (!q || c.grupo.includes(q) || c.codBem.includes(q) || formatBRL(c.valor).toLowerCase().includes(q)),
    );
  }, [creditos, buscaCred, segCred]);

  const ultimaAtualizacao = useMemo(() => {
    const ts = grupos.map((g) => g.atualizadoEm).filter(Boolean).sort();
    return ts.length ? new Date(ts[ts.length - 1]).toLocaleString("pt-BR") : null;
  }, [grupos]);

  function simularCredito(c: ConsorcioCredito) {
    setGrupoSel(c.grupo);
    setCarta(String(c.valor).replace(".", ","));
    setAba("simulador");
  }

  async function salvarAssembleia() {
    if (!fa.grupo.trim() || !fa.data) return notify.error("Informe grupo e data.");
    setSalvandoAsm(true);
    const erro = await consorcioApi.salvarAssembleia({
      grupo: fa.grupo.trim(),
      data: fa.data,
      numero: fa.numero ? Number(fa.numero) : null,
      contempladosFixo: Number(fa.fixo) || 0,
      contempladosLivre: Number(fa.livre) || 0,
      menorLanceLivrePct: fa.menorPct ? Number(fa.menorPct.replace(",", ".")) : null,
      observacao: fa.obs.trim() || null,
    });
    setSalvandoAsm(false);
    if (erro) return notify.error(erro);
    notify.success("Assembleia registrada!");
    setFa({ grupo: "", data: hoje(), numero: "", fixo: "", livre: "", menorPct: "", obs: "" });
    void carregar();
  }

  async function excluirAssembleia(id: string) {
    if (!window.confirm("Excluir este registro de assembleia?")) return;
    const erro = await consorcioApi.excluirAssembleia(id);
    if (erro) return notify.error(erro);
    notify.success("Registro excluído.");
    void carregar();
  }

  const faixaRecomendada = resultado?.medianaHistorico ?? config.faixaAlta;

  function persistirHistorico(item: HistSim) {
    setHistorico((prev) => {
      const next = [item, ...prev].slice(0, 12);
      try {
        localStorage.setItem(HIST_KEY, JSON.stringify(next));
      } catch {
        /* ignora */
      }
      return next;
    });
  }
  // #7 — estrutura pronta (PDF vem depois); já registra no histórico local.
  function gerarProposta() {
    if (!resultado) return notify.error("Preencha carta e lance primeiro.");
    persistirHistorico({
      id: crypto.randomUUID(),
      cliente: cliente.trim() || "—",
      carta: vCarta,
      lance: vLance,
      prob: resultado.probabilidade,
      nivel: resultado.nivel,
      data: new Date().toISOString(),
    });
    notify.success("Proposta preparada e salva no histórico. Geração de PDF em breve.");
  }
  // #8 — estrutura pronta (WhatsApp/PDF/imagem depois): copia o resumo.
  function compartilhar() {
    if (!resultado) return notify.error("Preencha carta e lance primeiro.");
    const txt =
      `Simulação de Consórcio — LB Representações\n` +
      `Cliente: ${cliente.trim() || "—"}\n` +
      `Carta: ${formatBRL(vCarta)}\n` +
      `Lance: ${formatBRL(vLance)} (${resultado.pctLance.toFixed(1)}% do crédito)\n` +
      `Probabilidade estimada: ${resultado.probabilidade}% — ${NIVEL_INFO[resultado.nivel].label}\n` +
      `(Estimativa de apoio à negociação; não é garantia de contemplação.)`;
    navigator.clipboard?.writeText(txt).then(
      () => notify.success("Resumo copiado. Envio por WhatsApp/PDF/imagem em breve."),
      () => notify.error("Não foi possível copiar."),
    );
  }
  function limparHistorico() {
    setHistorico([]);
    try {
      localStorage.removeItem(HIST_KEY);
    } catch {
      /* ignora */
    }
  }

  return (
    <PremiumStage>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text)]">
            <Landmark className="h-6 w-6 text-[var(--color-brand)]" /> Consórcio
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Tabelas, simulador de contemplação e histórico de assembleias — Multimarcas.
            {ultimaAtualizacao ? ` · Atualizado em ${ultimaAtualizacao}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Button variant="secondary" onClick={sincronizar} disabled={sincronizando}>
              <RefreshCw className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} />
              {sincronizando ? "Sincronizando…" : "Sincronizar tabelas"}
            </Button>
          ) : null}
          <Link
            href={`/consorcio/apresentacao?carta=${vCarta || ""}&lance=${vLance || ""}&grupo=${grupoSel}&embutido=${usarEmbutido ? 1 : 0}&cliente=${encodeURIComponent(cliente)}`}
          >
            <Button>
              <Presentation className="h-4 w-4" /> Modo apresentação
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
              aba === a.id
                ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                : "border-transparent text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* ------------------------------- SIMULADOR ------------------------------ */}
      {aba === "simulador" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
              <Calculator className="h-4 w-4 text-[var(--color-brand)]" /> Simulador de contemplação
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Cliente (opcional)</Label>
                <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" />
              </div>
              <div>
                <Label>Grupo (opcional)</Label>
                <select
                  value={grupoSel}
                  onChange={(e) => setGrupoSel(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)]"
                >
                  <option value="">Sem grupo específico</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.grupo}>
                      {g.grupo} {g.segmento ? `· ${SEGMENTO_INFO[g.segmento]?.label ?? g.segmento}` : ""}
                      {g.situacao === "bloqueado" ? " (bloqueado)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Valor da carta (R$)</Label>
                <Input value={carta} onChange={(e) => setCarta(e.target.value)} placeholder="80.000,00" inputMode="decimal" />
              </div>
              <div>
                <Label>Valor do lance (R$)</Label>
                <Input value={lance} onChange={(e) => setLance(e.target.value)} placeholder="24.000,00" inputMode="decimal" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-dim)]">
                  <input
                    type="checkbox"
                    checked={usarEmbutido}
                    onChange={(e) => setUsarEmbutido(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-brand)]"
                  />
                  Usar lance embutido (até {grupoAtual?.pctEmbutido ?? 30}% do crédito)
                </label>
              </div>
            </div>

            {isAdmin ? (
              <div className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-3">
                <p className="mb-2 text-xs font-semibold text-[var(--color-text-dim)]">
                  Faixas da classificação (admin) — sem histórico do grupo:
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-dim)]">
                  🟢 Alta ≥
                  <Input
                    className="h-8 w-16 text-center"
                    value={String(config.faixaAlta)}
                    onChange={(e) => setConfig({ ...config, faixaAlta: Number(e.target.value) || 0 })}
                  />
                  % · 🟡 Média ≥
                  <Input
                    className="h-8 w-16 text-center"
                    value={String(config.faixaMedia)}
                    onChange={(e) => setConfig({ ...config, faixaMedia: Number(e.target.value) || 0 })}
                  />
                  %
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const erro = await consorcioApi.salvarConfig(config);
                      if (erro) notify.error(erro);
                      else notify.success("Faixas salvas.");
                    }}
                  >
                    Salvar faixas
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
              <Button onClick={gerarProposta} disabled={!resultado}>
                <FileText className="h-4 w-4" /> Gerar proposta
              </Button>
              <Button variant="secondary" onClick={compartilhar} disabled={!resultado}>
                <Share2 className="h-4 w-4" /> Compartilhar simulação
              </Button>
            </div>
          </div>

          {resultado ? (
            <PainelResultado resultado={resultado} />
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
              <Calculator className="h-9 w-9 text-[var(--color-muted)]" />
              <p className="mt-2 text-sm text-[var(--color-text-dim)]">
                Informe o valor da carta e do lance para ver a estimativa premium.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* Seções premium (aparecem com o resultado) */}
      {aba === "simulador" && resultado ? (
        <div className="mt-4 space-y-4">
          <ResumoFinanceiro resultado={resultado} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Comparativo resultado={resultado} faixaRecomendada={faixaRecomendada} />
            <AnaliseComercial resultado={resultado} carta={vCarta} />
          </div>
          <AnaliseInteligente resultado={resultado} />
        </div>
      ) : null}

      {/* Histórico das últimas simulações (local — sem alterar o banco) */}
      {aba === "simulador" && historico.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
              <History className="h-4 w-4 text-[var(--color-brand)]" /> Últimas simulações
            </p>
            <Button size="sm" variant="ghost" onClick={limparHistorico}>
              <Trash2 className="h-3.5 w-3.5" /> Limpar
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 px-3 text-right">Carta</th>
                  <th className="py-2 px-3 text-right">Lance</th>
                  <th className="py-2 px-3">Resultado</th>
                  <th className="py-2 pl-3 text-right">Data</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => {
                  const ni = NIVEL_INFO[(h.nivel as keyof typeof NIVEL_INFO) in NIVEL_INFO ? (h.nivel as keyof typeof NIVEL_INFO) : "moderada"];
                  return (
                    <tr key={h.id} className="border-b border-[var(--color-border)]/60 last:border-0">
                      <td className="py-2 pr-3 font-medium text-[var(--color-text)]">{h.cliente}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-[var(--color-text-dim)]">{formatBRL(h.carta)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-[var(--color-text-dim)]">{formatBRL(h.lance)}</td>
                      <td className="py-2 px-3">
                        <span className="font-semibold tabular-nums" style={{ color: ni.cor }}>
                          {ni.emoji} {h.prob}% · {ni.label}
                        </span>
                      </td>
                      <td className="py-2 pl-3 text-right text-xs text-[var(--color-muted)]">
                        {new Date(h.data).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ------------------------------- CRÉDITOS ------------------------------- */}
      {aba === "creditos" ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
              <Input className="pl-9" placeholder="Buscar por grupo, código ou valor…" value={buscaCred} onChange={(e) => setBuscaCred(e.target.value)} />
            </div>
            <select
              value={segCred}
              onChange={(e) => setSegCred(e.target.value as "" | ConsorcioSegmento)}
              className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)]"
            >
              <option value="">Todos os segmentos</option>
              {(Object.keys(SEGMENTO_INFO) as ConsorcioSegmento[]).map((sg) => (
                <option key={sg} value={sg}>
                  {SEGMENTO_INFO[sg].emoji} {SEGMENTO_INFO[sg].label}
                </option>
              ))}
            </select>
            <Badge tone="brand">{creditosFiltrados.length} créditos</Badge>
          </div>

          {creditosFiltrados.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--color-text-dim)]">
              {creditos.length === 0
                ? "Nenhum crédito sincronizado ainda — peça ao admin para clicar em “Sincronizar tabelas”."
                : "Nada encontrado com esses filtros."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                    <th className="py-2 pr-3">Grupo</th>
                    <th className="py-2 px-3">Segmento</th>
                    <th className="py-2 px-3">Cód. bem</th>
                    <th className="py-2 px-3 text-right">Valor do crédito</th>
                    <th className="py-2 px-3 text-right">Prazo</th>
                    <th className="py-2 px-3 text-right">Tx. adm</th>
                    <th className="py-2 px-3">Embutido</th>
                    <th className="py-2 pl-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {creditosFiltrados.map((c) => (
                    <tr key={c.id} className="border-b border-[var(--color-border)]/60 last:border-0">
                      <td className="py-2.5 pr-3 font-semibold text-[var(--color-text)]">{c.grupo}</td>
                      <td className="py-2.5 px-3 text-[var(--color-text-dim)]">
                        {c.segmento ? `${SEGMENTO_INFO[c.segmento]?.emoji ?? ""} ${SEGMENTO_INFO[c.segmento]?.label ?? c.segmento}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--color-text-dim)]">{c.codBem}</td>
                      <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-[var(--color-text)]">{formatBRL(c.valor)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-dim)]">{c.prazoTotal ?? "—"}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--color-text-dim)]">{c.taxaAdm != null ? `${c.taxaAdm}%` : "—"}</td>
                      <td className="py-2.5 px-3 text-[var(--color-text-dim)]">
                        {c.pctEmbutido != null ? `${c.pctEmbutido}% ${c.baseEmbutido === "lance" ? "(lance)" : "(crédito)"}` : "—"}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => simularCredito(c)}>
                          <Calculator className="h-3.5 w-3.5" /> Simular
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* -------------------------------- GRUPOS -------------------------------- */}
      {aba === "grupos" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {grupos.length === 0 ? (
            <p className="col-span-full py-12 text-center text-sm text-[var(--color-text-dim)]">
              Nenhum grupo sincronizado ainda — peça ao admin para clicar em “Sincronizar tabelas”.
            </p>
          ) : (
            grupos.map((g) => (
              <div key={g.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-[var(--color-text)]">Grupo {g.grupo}</p>
                    <p className="text-xs text-[var(--color-text-dim)]">
                      {g.segmento ? `${SEGMENTO_INFO[g.segmento]?.emoji ?? ""} ${SEGMENTO_INFO[g.segmento]?.label ?? g.segmento}` : "—"}
                      {g.prazoTotal ? ` · ${g.prazoTotal} meses` : ""}
                    </p>
                  </div>
                  <Badge tone={g.situacao === "liberado" ? "success" : "danger"}>
                    {g.situacao === "liberado" ? "Liberado" : "Bloqueado"}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-dim)]">
                  {g.taxaAdm != null ? <span>Tx. adm {g.taxaAdm}%</span> : null}
                  {g.taxaFr != null ? <span>FR {g.taxaFr}%</span> : null}
                  {g.pctEmbutido != null ? <span>Embutido até {g.pctEmbutido}%</span> : null}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setGrupoSel(g.grupo);
                      setAba("simulador");
                    }}
                  >
                    <Calculator className="h-3.5 w-3.5" /> Simular
                  </Button>
                  {g.pdfUrl ? (
                    <a href={g.pdfUrl} target="_blank" rel="noopener">
                      <Button size="sm" variant="ghost">
                        <ExternalLink className="h-3.5 w-3.5" /> Tabela oficial (PDF)
                      </Button>
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* ------------------------------ ASSEMBLEIAS ----------------------------- */}
      {aba === "assembleias" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">Registrar resultado de assembleia</h2>
            <p className="mb-3 text-xs text-[var(--color-text-dim)]">
              Leva 30 segundos — e o simulador fica mais preciso a cada resultado registrado.
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
              <div>
                <Label>Grupo *</Label>
                <Input value={fa.grupo} onChange={(e) => setFa({ ...fa, grupo: e.target.value })} placeholder="2067" />
              </div>
              <div>
                <Label>Data *</Label>
                <Input type="date" value={fa.data} onChange={(e) => setFa({ ...fa, data: e.target.value })} />
              </div>
              <div>
                <Label>Nº assemb.</Label>
                <Input value={fa.numero} onChange={(e) => setFa({ ...fa, numero: e.target.value })} placeholder="34" inputMode="numeric" />
              </div>
              <div>
                <Label>Contempl. fixo</Label>
                <Input value={fa.fixo} onChange={(e) => setFa({ ...fa, fixo: e.target.value })} placeholder="0" inputMode="numeric" />
              </div>
              <div>
                <Label>Contempl. livre</Label>
                <Input value={fa.livre} onChange={(e) => setFa({ ...fa, livre: e.target.value })} placeholder="0" inputMode="numeric" />
              </div>
              <div>
                <Label>Menor lance livre (%)</Label>
                <Input value={fa.menorPct} onChange={(e) => setFa({ ...fa, menorPct: e.target.value })} placeholder="28,5" inputMode="decimal" />
              </div>
              <div className="flex items-end">
                <Button onClick={salvarAssembleia} disabled={salvandoAsm} className="w-full">
                  <Plus className="h-4 w-4" /> Registrar
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">Histórico ({assembleias.length})</h2>
            {assembleias.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">
                Nenhum resultado registrado ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                      <th className="py-2 pr-3">Grupo</th>
                      <th className="py-2 px-3">Data</th>
                      <th className="py-2 px-3 text-right">Nº</th>
                      <th className="py-2 px-3 text-right">Fixo</th>
                      <th className="py-2 px-3 text-right">Livre</th>
                      <th className="py-2 px-3 text-right">Menor lance livre</th>
                      <th className="py-2 pl-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {assembleias.map((a) => (
                      <tr key={a.id} className="border-b border-[var(--color-border)]/60 last:border-0">
                        <td className="py-2 pr-3 font-semibold text-[var(--color-text)]">{a.grupo}</td>
                        <td className="py-2 px-3 text-[var(--color-text-dim)]">
                          {new Date(`${a.data}T12:00:00`).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-[var(--color-text-dim)]">{a.numero ?? "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-[var(--color-text-dim)]">{a.contempladosFixo}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-[var(--color-text-dim)]">{a.contempladosLivre}</td>
                        <td className="py-2 px-3 text-right font-semibold tabular-nums text-[var(--color-text)]">
                          {a.menorLanceLivrePct != null ? `${a.menorLanceLivrePct}%` : "—"}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => excluirAssembleia(a.id)} aria-label="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </PremiumStage>
  );
}
