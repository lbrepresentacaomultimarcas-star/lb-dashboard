"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Award,
  Download,
  FileText,
  FileUp,
  ImageIcon,
  Loader2,
  MessageCircle,
  MonitorPlay,
  Printer,
  RefreshCw,
  Search,
  Smartphone,
  UploadCloud,
} from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { reloadResultados, useResultados, useSession, useVendasEscopo, useVendedoresEscopo } from "@/lib/store";
import { settings, useTextSetting } from "@/lib/settings";
import {
  AssinaturaComercial,
  EMPRESA_LB,
  KIT_VAZIO,
  kitEstaVazio,
  type KitComunicacao,
} from "@/components/materiais/assinatura-comercial";
import { PeriodFilter } from "@/components/period-filter";
import { dateToInputValue, formatPeriodLabel, periodFromPreset, type Period } from "@/lib/period";
import {
  BRLc,
  dataLabel,
  filtrarPorIntervalo,
  mesLabel,
  parsearResultados,
  resumir,
  resultadosApi,
  type Contemplacao,
  type LinhaImportada,
  type ResultadoParse,
} from "@/lib/resultados";
import {
  baixarImagem,
  baixarPdf,
  carregarLogos,
  construirDados,
  imprimirRelatorio,
  nomeTemplate,
  renderEmCanvas,
  resetLogos,
  type FormatoMaterial,
  type ModeloComunicacao,
  type TemplateFeed,
} from "@/lib/materiais";

const EMOJI_TIPO: Record<string, string> = { Sorteio: "🎯", "Lance Fixo": "📌", "Lance Livre": "🚀" };

type OpcaoMaterial = "feed" | "story" | "status" | "pdf" | "print";
const OPCOES: { id: OpcaoMaterial; titulo: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "feed", titulo: "Feed Instagram", desc: "Post quadrado 1080×1080", icon: ImageIcon },
  { id: "story", titulo: "Story", desc: "Vertical pra Stories", icon: Smartphone },
  { id: "status", titulo: "Status WhatsApp", desc: "Leitura rápida no zap", icon: MessageCircle },
  { id: "pdf", titulo: "PDF Institucional", desc: "Apresentação executiva", icon: FileText },
  { id: "print", titulo: "Relatório impresso", desc: "Layout corporativo A4", icon: Printer },
];

/** Recorde = algum mês do período atual empata com o máximo histórico (≥3). */
function calcularRecorde(todos: Contemplacao[], porMesAtual: { mes: string; qtd: number }[]): string | null {
  if (todos.length === 0) return null;
  const porMes = new Map<string, number>();
  for (const i of todos) porMes.set(i.mesRef, (porMes.get(i.mesRef) ?? 0) + 1);
  const globalMax = Math.max(...porMes.values());
  if (globalMax < 3) return null;
  return porMesAtual.some((m) => m.qtd === globalMax) ? `${globalMax} no mês` : null;
}

function TabelaContemplacoes({ itens }: { itens: Contemplacao[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            <th className="py-2 pr-3">Data</th>
            <th className="py-2 pr-3">Grupo</th>
            <th className="py-2 pr-3">Cota</th>
            <th className="py-2 pr-3">Tipo</th>
            <th className="py-2 pr-3">Bem</th>
            <th className="py-2 pr-3">Lance</th>
            <th className="py-2 pr-3">Valor do lance</th>
            <th className="py-2">Crédito estimado</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.id} className="border-b border-[var(--color-border)]/50 text-[var(--color-text)]">
              <td className="py-2 pr-3 tabular-nums">{dataLabel(i.dataContemplacao)}</td>
              <td className="py-2 pr-3 font-bold tabular-nums">{i.grupo}</td>
              <td className="py-2 pr-3 tabular-nums">{i.cota}</td>
              <td className="py-2 pr-3">{EMOJI_TIPO[i.tipoContemplacao] ?? ""} {i.tipoContemplacao}</td>
              <td className="py-2 pr-3">{i.tipoBem ?? "—"}</td>
              <td className="py-2 pr-3 tabular-nums">{i.pctLance != null ? `${i.pctLance.toLocaleString("pt-BR")}%` : "—"}</td>
              <td className="py-2 pr-3 tabular-nums">{i.valorLance != null ? BRLc(i.valorLance) : "—"}</td>
              <td className="py-2 font-semibold tabular-nums" style={{ color: "#d4a72c" }}>
                {i.creditoEstimado != null ? BRLc(i.creditoEstimado) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResultadosPage() {
  const session = useSession();
  const vendas = useVendasEscopo();
  const vendedores = useVendedoresEscopo();
  const isAdmin = session?.papel === "admin";

  // Mesma fonte e mecânica dos demais módulos: store global (carregado no
  // boot, recarregado pelo Realtime) + período global igual ao Dashboard.
  const itens = useResultados();
  const [period, setPeriod] = useState<Period>(() => periodFromPreset("mes-atual"));
  const [busca, setBusca] = useState("");
  const [modalMaterial, setModalMaterial] = useState(false);
  const [modalImport, setModalImport] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  // Importação
  const [impUrl, setImpUrl] = useState("");
  const [impTexto, setImpTexto] = useState("");
  const [impMes, setImpMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [extraindo, setExtraindo] = useState(false);
  const [previa, setPrevia] = useState<ResultadoParse | null>(null);
  const [fonte, setFonte] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [logExtracao, setLogExtracao] = useState<string[]>([]);
  const [erroExtracao, setErroExtracao] = useState<string | null>(null);

  /* ------------------------ sincronização automática ------------------------ */
  // Busca os PDFs do mês na pasta OFICIAL (salva no sistema — sem link),
  // parseia no servidor e grava só o que for novo. Roda sozinha 1x por dia
  // quando o admin abre a tela; o Realtime espalha pra todos os aparelhos.
  async function sincronizar(silencioso = false) {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const res = await fetch("/api/resultados/sync", { method: "POST" });
      const bruto = await res.text();
      let j: {
        linhas?: LinhaImportada[];
        totalBrasil?: number;
        totalSE?: number;
        error?: string;
        log?: string[];
      };
      try {
        j = JSON.parse(bruto) as typeof j;
      } catch {
        j = { error: `Resposta inesperada do servidor (HTTP ${res.status}).` };
      }
      if (j.log?.length) console.log("[resultados/sync] diagnóstico:\n" + j.log.join("\n"));
      if (!res.ok || !j.linhas) {
        if (!silencioso) notify.error(j.error ?? `Falha na sincronização (HTTP ${res.status}).`);
        return;
      }
      if (j.linhas.length > 0) {
        const r = await resultadosApi.salvar(j.linhas);
        if (!r.ok) {
          if (!silencioso) notify.error(r.erro ?? "Falha ao salvar a sincronização.");
          return;
        }
        await reloadResultados();
        if (r.inseridos > 0)
          notify.success(`Resultados sincronizados: ${r.inseridos} contemplação(ões) nova(s) de Sergipe.`);
        else if (!silencioso)
          notify.info("Resultados em dia — nenhuma contemplação nova de Sergipe.");
      } else if (!silencioso) {
        notify.info(
          `Mês verificado (${j.totalBrasil ?? 0} contemplações no Brasil) — nenhuma de Sergipe até agora.`,
        );
      }
    } catch (e) {
      if (!silencioso) notify.error(e instanceof Error ? e.message : "Falha na sincronização.");
    } finally {
      setSincronizando(false);
    }
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!isAdmin) return;
    const hoje = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem("lb:resultados:autosync") === hoje) return;
      localStorage.setItem("lb:resultados:autosync", hoje);
    } catch {
      /* sem localStorage — sincroniza mesmo assim */
    }
    void sincronizar(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const doPeriodo = useMemo(
    () => filtrarPorIntervalo(itens, period.from, period.to),
    [itens, period],
  );
  const resumo = useMemo(() => resumir(doPeriodo), [doPeriodo]);
  const daBusca = useMemo(() => {
    const q = busca.trim();
    if (!q) return null;
    const filtrados = doPeriodo.filter((i) => i.grupo.includes(q) || i.cota === q || `${i.grupo}/${i.cota}` === q);
    return { itens: filtrados, resumo: resumir(filtrados) };
  }, [busca, doPeriodo]);

  const recentes = useMemo(
    () =>
      [...doPeriodo]
        .sort((a, b) => (b.dataContemplacao ?? b.mesRef).localeCompare(a.dataContemplacao ?? a.mesRef))
        .slice(0, 12),
    [doPeriodo],
  );

  const maxMes = Math.max(1, ...resumo.porMes.map((m) => m.qtd));
  const periodoLabel = formatPeriodLabel(period);
  const preparadoPor = session?.nome;

  /* --------------------------- Comunicação da peça -------------------------- */
  // Fica no navegador (mesmo lugar das logos do co-branding): é preferência de
  // quem monta o material, não dado da empresa. Sobrevive ao recarregar a
  // página, então ele não redigita o kit a cada peça.
  const kitSalvo = useTextSetting("material_comunicacao");
  const frasesSalvas = useTextSetting("material_frases");
  /** O que ele digitou nesta sessão. Enquanto for nulo, vale o que está
   *  guardado — derivar em vez de copiar para dentro de um efeito, que é o que
   *  o React 19 recusa e que também causaria um render a mais. */
  const [kitEditado, setKitEditado] = useState<KitComunicacao | null>(null);
  const kit = useMemo<KitComunicacao>(() => {
    if (kitEditado) return kitEditado;
    if (!kitSalvo) return KIT_VAZIO;
    try {
      return { ...KIT_VAZIO, ...(JSON.parse(kitSalvo) as Partial<KitComunicacao>) };
    } catch {
      return KIT_VAZIO; // kit corrompido no navegador não derruba a tela
    }
  }, [kitEditado, kitSalvo]);

  function trocarKit(k: KitComunicacao) {
    setKitEditado(k);
    settings.setText("material_comunicacao", JSON.stringify(k));
  }

  const proprias: ModeloComunicacao[] = useMemo(() => {
    if (!frasesSalvas) return [];
    try {
      return JSON.parse(frasesSalvas) as ModeloComunicacao[];
    } catch {
      return [];
    }
  }, [frasesSalvas]);

  function guardarFrase(nome: string) {
    const nova: ModeloComunicacao = {
      id: `meu:${Date.now()}`,
      grupo: "Minhas frases",
      nome,
      modo: kit.modo,
      selo: kit.selo,
      chamada: kit.chamada,
      destaque: kit.destaque,
      assinatura: kit.assinatura,
    };
    settings.setText("material_frases", JSON.stringify([nova, ...proprias]));
    trocarKit({ ...kit, modeloId: nova.id });
    notify.success("Frase guardada.");
  }

  function apagarFrase(id: string) {
    settings.setText("material_frases", JSON.stringify(proprias.filter((f) => f.id !== id)));
    if (kit.modeloId === id) trocarKit({ ...kit, modeloId: null });
  }

  const consultores = useMemo(
    () => vendedores.filter((v) => v.ativo).map((v) => v.nome).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [vendedores],
  );

  /* ------------------------------ Gerar Material ---------------------------- */
  const [matSel, setMatSel] = useState<OpcaoMaterial>("feed");
  const [matTemplate, setMatTemplate] = useState<TemplateFeed | undefined>(undefined);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [logosReady, setLogosReady] = useState(0);

  const matResumo = daBusca?.resumo ?? resumo;
  const matItens = daBusca?.itens ?? doPeriodo;
  const recorde = useMemo(() => calcularRecorde(itens, matResumo.porMes), [itens, matResumo]);
  const dadosMaterial = useMemo(
    () =>
      construirDados({
        resumo: matResumo,
        itens: matItens,
        periodoLabel: daBusca ? `Pesquisa: ${busca.trim()}` : periodoLabel,
        recorde,
        preparadoPor,
        // Kit vazio = arte exatamente como era antes deste painel existir.
        comunicacao: kitEstaVazio(kit)
          ? null
          : {
              modo: kit.modo,
              selo: kit.selo,
              chamada: kit.chamada,
              destaque: kit.destaque,
              assinatura: kit.assinatura,
            },
      }),
    [matResumo, matItens, daBusca, busca, periodoLabel, recorde, preparadoPor, kit],
  );

  const previewFormato: FormatoMaterial | null =
    matSel === "print" ? null : matSel === "pdf" ? "pdf-capa" : matSel;

  // Ao abrir o modal, (re)carrega as logos do co-branding e força re-render do preview.
  useEffect(() => {
    if (!modalMaterial) return;
    resetLogos();
    let vivo = true;
    void carregarLogos().then(() => {
      if (vivo) setLogosReady((n) => n + 1);
    });
    return () => {
      vivo = false;
    };
  }, [modalMaterial]);

  useEffect(() => {
    if (!modalMaterial || !previewFormato || !previewRef.current) return;
    renderEmCanvas(previewRef.current, previewFormato, dadosMaterial, matSel === "feed" ? matTemplate : undefined);
  }, [modalMaterial, previewFormato, dadosMaterial, matSel, matTemplate, logosReady]);

  function baixarMaterial() {
    if (matSel === "feed" || matSel === "story" || matSel === "status")
      void baixarImagem(matSel, dadosMaterial, matSel === "feed" ? matTemplate : undefined);
    else if (matSel === "pdf") void baixarPdf(dadosMaterial, matItens);
    else imprimirRelatorio(dadosMaterial, matItens);
  }

  function trocarTemplate() {
    const ordem: TemplateFeed[] = ["Premium", "Executivo", "Comercial"];
    const atual = matTemplate ?? (nomeTemplate("feed", dadosMaterial) as TemplateFeed);
    setMatTemplate(ordem[(ordem.indexOf(atual) + 1) % ordem.length]);
  }

  // Dados internos LB (separados dos oficiais): vendas da própria empresa.
  const internoLB = useMemo(() => {
    const total = vendas.length;
    const valor = vendas.reduce((s, v) => s + v.valor, 0);
    return { total, valor };
  }, [vendas]);

  /* ------------------------------- importação ------------------------------- */

  function processar(texto: string, origem: string) {
    const r = parsearResultados(texto, impMes, origem);
    setFonte(origem);
    setPrevia(r);
    if (r.totalBrasil === 0)
      notify.error("Não reconheci contemplações nesse conteúdo — confira se é o PDF oficial de resultados.");
    else if (r.totalSE === 0)
      notify.info(`Arquivo lido: ${r.totalBrasil} contemplações no Brasil, mas nenhuma de Sergipe neste resultado.`);
    else notify.success(`${r.totalSE} contemplação(ões) de Sergipe reconhecidas — confira a prévia.`);
  }

  async function extrair(modo: "url" | "arquivo", arquivo?: File) {
    setExtraindo(true);
    setPrevia(null);
    setErroExtracao(null);
    setLogExtracao([]);
    try {
      let res: Response;
      if (modo === "url") {
        if (!impUrl.trim()) {
          notify.error("Informe o link do resultado ou da pasta do mês.");
          return;
        }
        res = await fetch("/api/resultados/extrair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: impUrl.trim() }),
        });
      } else {
        if (!arquivo) return;
        const fd = new FormData();
        fd.set("file", arquivo);
        res = await fetch("/api/resultados/extrair", { method: "POST", body: fd });
      }
      // Lê como texto primeiro: se o servidor cair antes do JSON, mostramos o erro real.
      const bruto = await res.text();
      let j: { texto?: string; fonte?: string; arquivos?: number; error?: string; log?: string[] };
      try {
        j = JSON.parse(bruto) as typeof j;
      } catch {
        j = { error: `Resposta inesperada do servidor (HTTP ${res.status}): ${bruto.slice(0, 300)}` };
      }
      if (j.log?.length) {
        setLogExtracao(j.log);
        console.log("[resultados/extrair] diagnóstico:\n" + j.log.join("\n"));
      }
      if (!res.ok || !j.texto) {
        const msg = j.error ?? `Falha ao extrair o conteúdo (HTTP ${res.status}).`;
        setErroExtracao(msg);
        notify.error(msg);
        return;
      }
      processar(j.texto, j.fonte ?? "importação");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro na extração.";
      setErroExtracao(msg);
      notify.error(msg);
    } finally {
      setExtraindo(false);
    }
  }

  function extrairDoTexto() {
    if (!impTexto.trim()) return notify.error("Cole o texto do resultado.");
    setErroExtracao(null);
    setLogExtracao([]);
    processar(impTexto, "texto colado");
  }

  async function confirmarImportacao() {
    if (!previa || previa.totalSE === 0) return;
    setSalvando(true);
    const r = await resultadosApi.salvar(previa.itens);
    setSalvando(false);
    if (!r.ok) return notify.error(r.erro ?? "Falha ao salvar.");
    notify.success(`Importação concluída: ${r.inseridos} registro(s) novos (duplicados são ignorados).`);
    setModalImport(false);
    setPrevia(null);
    setImpUrl("");
    setImpTexto("");
    void reloadResultados();
  }

  /* --------------------------------- render --------------------------------- */

  return (
    <PremiumStage>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text)]">
            <Award className="h-6 w-6" style={{ color: "#d4a72c" }} /> Resultados LB
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Contemplações oficiais da administradora em Sergipe — a prova social que fecha negócio.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <Button variant="secondary" onClick={() => void sincronizar(false)} disabled={sincronizando}>
              {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
          ) : null}
          {isAdmin ? (
            <Button variant="secondary" onClick={() => setModalImport(true)}>
              <FileUp className="h-4 w-4" /> Importar histórico
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setModalMaterial(true)}>
            <ImageIcon className="h-4 w-4" /> Gerar Material
          </Button>
          <Link
            href={`/resultados/apresentacao?de=${dateToInputValue(period.from)}&ate=${dateToInputValue(period.to)}`}
          >
            <Button>
              <MonitorPlay className="h-4 w-4" /> Apresentar ao Cliente
            </Button>
          </Link>
        </div>
      </div>

      {/* período global (igual ao Dashboard) + pesquisa por grupo/cota */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PeriodFilter period={period} onChange={setPeriod} align="start" />
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <Input className="pl-9" placeholder="Pesquisar grupo ou cota… (ex.: 2063 ou 1781)" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
          <Award className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
          <p className="mt-2 font-bold text-[var(--color-text)]">Nenhum resultado no histórico ainda</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-text-dim)]">
            {isAdmin
              ? "Clique em “Sincronizar agora” — o sistema busca sozinho os resultados do mês na pasta oficial da administradora e filtra as cotas de Sergipe. Pra carregar meses antigos, use “Importar histórico”."
              : "Os resultados oficiais são sincronizados automaticamente pelo administrador — em breve aparecem aqui."}
          </p>
        </div>
      ) : (
        <>
          {/* Dados OFICIAIS */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="brand">📜 Dados oficiais da administradora</Badge>
            <span className="text-xs text-[var(--color-muted)]">{periodoLabel}</span>
            <span className="text-[11px] text-[var(--color-muted)]">
              · o resultado oficial identifica cada cota pelo estado (UF) — aqui entram só as de Sergipe
            </span>
          </div>

          {daBusca ? (
            /* ----------------------- resultado da pesquisa ---------------------- */
            <div className="rounded-2xl border p-5" style={{ borderColor: "color-mix(in oklab, #d4a72c 45%, transparent)", background: "linear-gradient(160deg, color-mix(in oklab, #d4a72c 8%, var(--color-surface)), var(--color-surface) 70%)" }}>
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--color-text)]">
                <Search className="h-5 w-5" style={{ color: "#d4a72c" }} /> Pesquisa: “{busca.trim()}”
              </h2>
              {daBusca.resumo.total === 0 ? (
                <p className="mt-2 text-sm text-[var(--color-text-dim)]">
                  Nenhuma contemplação de Sergipe com esse grupo/cota no período — amplie o período ou confira o número.
                </p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-[var(--color-surface-2)]/60 p-3 text-center">
                      <p className="text-3xl font-extrabold tabular-nums" style={{ color: "#d4a72c" }}>{daBusca.resumo.total}</p>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">contemplações</p>
                    </div>
                    <div className="rounded-xl bg-[var(--color-surface-2)]/60 p-3 text-center">
                      <p className="text-xl font-extrabold tabular-nums text-[var(--color-text)]">{daBusca.resumo.sorteios} · {daBusca.resumo.lances}</p>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">sorteios · lances</p>
                    </div>
                    <div className="col-span-2 rounded-xl bg-[var(--color-surface-2)]/60 p-3 text-center sm:col-span-1">
                      <p className="text-xl font-extrabold tabular-nums text-[var(--color-text)]">{daBusca.resumo.creditoEstimado ? BRLc(daBusca.resumo.creditoEstimado) : "—"}</p>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">crédito estimado (lances)</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <TabelaContemplacoes itens={daBusca.itens.slice(0, 30)} />
                  </div>
                </>
              )}
            </div>
          ) : (
            /* --------------------------- dashboard geral ------------------------ */
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <div className="lb-fade-up rounded-2xl border p-4 text-center" style={{ borderColor: "color-mix(in oklab, #d4a72c 45%, transparent)", background: "linear-gradient(160deg, color-mix(in oklab, #d4a72c 10%, var(--color-surface)), var(--color-surface) 70%)" }}>
                  <p className="text-4xl font-extrabold tabular-nums" style={{ color: "#d4a72c" }}>{resumo.total}</p>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">contemplações em Sergipe</p>
                </div>
                <div className="lb-fade-up rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center" style={{ animationDelay: "50ms" }}>
                  <p className="text-2xl font-extrabold tabular-nums text-[var(--color-success)]">{resumo.creditoEstimado ? BRLc(resumo.creditoEstimado) : "—"}</p>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">crédito estimado (lances)</p>
                </div>
                <div className="lb-fade-up rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center" style={{ animationDelay: "100ms" }}>
                  <p className="text-2xl font-extrabold tabular-nums text-[var(--color-text)]">🎯 {resumo.sorteios}</p>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">por sorteio</p>
                </div>
                <div className="lb-fade-up rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center" style={{ animationDelay: "150ms" }}>
                  <p className="text-2xl font-extrabold tabular-nums text-[var(--color-text)]">🚀 {resumo.lances}</p>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">por lance</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                {/* evolução mensal */}
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 xl:col-span-2">
                  <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">📈 Evolução mensal</h2>
                  {resumo.porMes.length === 0 ? (
                    <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">Sem dados no período.</p>
                  ) : (
                    <div className="flex items-end gap-2 overflow-x-auto pb-1">
                      {resumo.porMes.map((m, i) => (
                        <div key={m.mes} className="lb-fade-up flex min-w-11 flex-col items-center gap-1" style={{ animationDelay: `${i * 40}ms` }}>
                          <span className="text-[10px] font-bold tabular-nums text-[var(--color-text)]">{m.qtd}</span>
                          <div
                            className="w-9 rounded-t-lg transition-[height] duration-700"
                            style={{ height: `${Math.max(10, (m.qtd / maxMes) * 120)}px`, background: "linear-gradient(180deg, #d4a72c, color-mix(in oklab, #d4a72c 55%, var(--color-surface-2)))" }}
                            title={`${mesLabel(m.mes)}: ${m.qtd}${m.credito ? ` · ${BRLc(m.credito)} em crédito estimado` : ""}`}
                          />
                          <span className="text-[9px] text-[var(--color-muted)]">{mesLabel(m.mes)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* por bem + por modalidade */}
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">🏷️ Por tipo de bem</h2>
                  <div className="space-y-2">
                    {resumo.porBem.slice(0, 5).map((m) => (
                      <div key={m.nome}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span className="font-semibold text-[var(--color-text)]">{m.nome}</span>
                          <span className="tabular-nums text-[var(--color-text-dim)]">{m.qtd}{m.credito ? ` · ${BRLc(m.credito)}` : ""}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                          <div className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-700" style={{ width: `${(m.qtd / Math.max(1, resumo.porBem[0]?.qtd ?? 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <h2 className="mb-2 mt-5 text-sm font-bold text-[var(--color-text)]">🎯 Por modalidade</h2>
                  <div className="flex flex-wrap gap-2">
                    {resumo.porTipo.map((t) => (
                      <span key={t.nome} className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-1 text-xs font-semibold text-[var(--color-text)]">
                        {EMOJI_TIPO[t.nome] ?? ""} {t.nome}: <span style={{ color: "#d4a72c" }}>{t.qtd}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* últimas contemplações */}
              <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">🏆 Últimas contemplações de Sergipe</h2>
                {recentes.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[var(--color-text-dim)]">Sem registros no período.</p>
                ) : (
                  <TabelaContemplacoes itens={recentes} />
                )}
              </div>

              {/* grupos */}
              {resumo.porGrupo.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">📂 Grupos com contemplação em Sergipe</h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    {resumo.porGrupo.slice(0, 12).map((g, i) => (
                      <button
                        key={g.grupo}
                        onClick={() => setBusca(g.grupo)}
                        className="lb-fade-up rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-3 text-left transition-transform duration-200 hover:-translate-y-0.5"
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
                        <p className="truncate text-sm font-bold text-[var(--color-text)]">Grupo {g.grupo}</p>
                        <p className="text-lg font-extrabold tabular-nums" style={{ color: "#d4a72c" }}>{g.qtd}</p>
                        <p className="text-[10px] text-[var(--color-muted)]">{g.bem ?? "—"}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {/* Dados INTERNOS da LB — separados dos oficiais */}
          <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone="neutral">🏢 Dados internos da LB (não oficiais)</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[var(--color-surface-2)]/60 p-3 text-center">
                <p className="text-2xl font-extrabold tabular-nums text-[var(--color-text)]">{internoLB.total}</p>
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">vendas acompanhadas pela LB</p>
              </div>
              <div className="rounded-xl bg-[var(--color-surface-2)]/60 p-3 text-center">
                <p className="text-xl font-extrabold tabular-nums text-[var(--color-text)]">{BRLc(internoLB.valor)}</p>
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">em negócios da empresa</p>
              </div>
            </div>
          </div>
        </>
      )}

      <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
        Resultados LB · sincronização automática com a pasta oficial da administradora (filtro de Sergipe) · crédito
        estimado a partir do % dos lances · histórico permanente · atualização em tempo real.
      </p>

      {/* ------------------------------ modal material ---------------------------- */}
      <Modal
        open={modalMaterial}
        onClose={() => setModalMaterial(false)}
        title="Gerar Material"
        subtitle="Os números vêm do resultado oficial. A frase e a assinatura são sua escolha."
        icon={<ImageIcon className="h-5 w-5" />}
      >
        <div className="space-y-4">
          {/* escolha do formato */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OPCOES.map((o) => {
              const Icon = o.icon;
              const ativo = matSel === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => setMatSel(o.id)}
                  className={`group flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                    ativo
                      ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10"
                      : "border-[var(--color-border)] hover:border-[var(--color-brand)]/50"
                  }`}
                  style={ativo ? { boxShadow: "0 0 0 1px var(--color-brand), 0 8px 24px -12px rgba(37,99,255,.6)" } : undefined}
                >
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-lg transition-colors ${
                      ativo
                        ? "bg-[var(--color-brand)]/20 text-[var(--color-brand)]"
                        : "bg-[var(--color-surface-2)] text-[var(--color-text-dim)] group-hover:text-[var(--color-text)]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-bold text-[var(--color-text)]">{o.titulo}</span>
                  <span className="text-[11px] leading-tight text-[var(--color-text-dim)]">{o.desc}</span>
                </button>
              );
            })}
          </div>

          {/* como apresentar — palavras, não números */}
          <AssinaturaComercial
            kit={kit}
            onChange={trocarKit}
            consultores={consultores}
            proprios={proprias}
            onSalvarFrase={guardarFrase}
            onApagarFrase={apagarFrase}
          />

          {/* prévia ao vivo */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[#0a1220] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Prévia do material
              </span>
              {matSel === "feed" ? (
                <button
                  onClick={trocarTemplate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)]"
                >
                  <RefreshCw className="h-3 w-3" /> Modelo: {matTemplate ?? nomeTemplate("feed", dadosMaterial)}
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                  Modelo: {previewFormato ? nomeTemplate(previewFormato, dadosMaterial) : "Relatório A4"}
                </span>
              )}
            </div>
            {previewFormato ? (
              <div className="flex justify-center">
                <canvas
                  ref={previewRef}
                  className="rounded-xl border border-white/10 shadow-2xl"
                  style={{ maxHeight: "46vh", maxWidth: "100%", width: "auto", height: "auto" }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Printer className="h-10 w-10 text-[var(--color-muted)]" />
                <p className="text-sm font-semibold text-[var(--color-text)]">Relatório corporativo A4</p>
                <p className="max-w-xs text-[11px] text-[var(--color-text-dim)]">
                  Cabeçalho premium, resumo executivo, indicadores e tabela elegante. Abre a janela de impressão do navegador.
                </p>
              </div>
            )}
          </div>

          {/* baixar */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-[var(--color-muted)]">
              {kitEstaVazio(kit)
                ? preparadoPor
                  ? `Assinado por ${preparadoPor}`
                  : `Identidade ${EMPRESA_LB}`
                : kit.assinatura.trim() || kit.destaque.trim() || `Identidade ${EMPRESA_LB}`}
              {dadosMaterial.recorde && kitEstaVazio(kit) ? ` · 🏆 ${dadosMaterial.recorde}` : ""}
            </p>
            <Button onClick={baixarMaterial}>
              {matSel === "print" ? <Printer className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {matSel === "pdf" ? "Baixar PDF" : matSel === "print" ? "Imprimir" : "Baixar imagem"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ------------------------------ modal importar ----------------------------- */}
      <Modal open={modalImport} onClose={() => (extraindo || salvando ? null : setModalImport(false))} title="Importar resultado oficial" subtitle="Link do PDF, link da PASTA do mês no Drive ou o próprio PDF — o sistema lê, filtra Sergipe e mostra a prévia antes de salvar.">
        <div className="space-y-4">
          <div>
            <Label>Link do resultado (PDF) ou da pasta do mês no Drive</Label>
            <div className="flex gap-2">
              <Input value={impUrl} onChange={(e) => setImpUrl(e.target.value)} placeholder="https://drive.google.com/… (arquivo ou pasta do mês)" />
              <Button variant="secondary" onClick={() => void extrair("url")} disabled={extraindo}>
                {extraindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Ler
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              Cole o link da pasta do mês (ex.: “JULHO DE 2026”) pra importar todos os resultados de uma vez.
            </p>
          </div>
          <div>
            <Label>…ou envie o PDF oficial</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-4 py-3 text-sm text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]">
              <UploadCloud className="h-5 w-5" />
              Selecionar PDF do resultado
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void extrair("arquivo", f);
                }}
              />
            </label>
          </div>
          <div>
            <Label>…ou cole o texto do resultado (plano B sempre funciona)</Label>
            <textarea
              value={impTexto}
              onChange={(e) => setImpTexto(e.target.value)}
              rows={3}
              placeholder="Cole aqui o conteúdo do resultado…"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
            <Button variant="secondary" className="mt-1" onClick={extrairDoTexto} disabled={extraindo}>
              Processar texto
            </Button>
          </div>
          <div>
            <Label>Mês de referência (usado só se o arquivo não trouxer a data)</Label>
            <Input type="month" value={impMes} onChange={(e) => setImpMes(e.target.value)} className="max-w-44" />
          </div>

          {erroExtracao ? (
            <div className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3">
              <p className="text-sm font-bold text-[var(--color-danger)]">A leitura falhou</p>
              <p className="mt-1 break-words text-xs text-[var(--color-text)]">{erroExtracao}</p>
            </div>
          ) : null}

          {logExtracao.length > 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Diagnóstico da leitura</p>
              <div className="max-h-36 space-y-0.5 overflow-y-auto font-mono text-[11px] leading-relaxed text-[var(--color-text-dim)]">
                {logExtracao.map((l, i) => (
                  <p key={i} className="break-words">{l}</p>
                ))}
              </div>
            </div>
          ) : null}

          {previa ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3">
              <p className="mb-1 text-sm font-bold text-[var(--color-text)]">
                Prévia — {previa.totalSE} de Sergipe {fonte ? `(${fonte})` : ""}
              </p>
              <p className="mb-2 text-[11px] text-[var(--color-muted)]">
                Reconhecidas {previa.totalBrasil} contemplações no Brasil em {previa.grupos} grupos · só as de SE entram no histórico.
              </p>
              <div className="max-h-44 space-y-1 overflow-y-auto">
                {previa.itens.slice(0, 30).map((l, i) => (
                  <p key={i} className="truncate text-xs text-[var(--color-text-dim)]">
                    {EMOJI_TIPO[l.tipoContemplacao] ?? "🏆"} Grupo {l.grupo} · Cota {l.cota} · {l.tipoContemplacao}
                    {l.pctLance != null ? ` ${l.pctLance.toLocaleString("pt-BR")}%` : ""} · {l.tipoBem ?? "—"} ·{" "}
                    {l.valorLance != null ? `lance ${BRLc(l.valorLance)} · crédito est. ${l.creditoEstimado != null ? BRLc(l.creditoEstimado) : "—"} · ` : ""}
                    {dataLabel(l.dataContemplacao)}
                  </p>
                ))}
                {previa.totalSE > 30 ? <p className="text-[11px] text-[var(--color-muted)]">…e mais {previa.totalSE - 30}.</p> : null}
              </div>
              <Button className="mt-3 w-full" onClick={() => void confirmarImportacao()} disabled={salvando || previa.totalSE === 0}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                Confirmar importação ({previa.totalSE})
              </Button>
            </div>
          ) : null}
        </div>
      </Modal>
    </PremiumStage>
  );
}
