"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  Download,
  FileUp,
  ImageIcon,
  Loader2,
  MapPin,
  MonitorPlay,
  Printer,
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
import { useSession, useVendas } from "@/lib/store";
import {
  BRLc,
  filtrarPeriodo,
  gerarArte,
  gerarPdfInstitucional,
  mesLabel,
  parsearResultados,
  resumir,
  resultadosApi,
  type Contemplacao,
  type FiltroMeses,
  type LinhaImportada,
} from "@/lib/resultados";

const PERIODOS: { v: FiltroMeses; label: string }[] = [
  { v: 1, label: "Último mês" },
  { v: 3, label: "3 meses" },
  { v: 6, label: "6 meses" },
  { v: 12, label: "12 meses" },
  { v: 0, label: "Todo o histórico" },
];

export default function ResultadosPage() {
  const session = useSession();
  const vendas = useVendas();
  const isAdmin = session?.papel === "admin";

  const [itens, setItens] = useState<Contemplacao[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [periodo, setPeriodo] = useState<FiltroMeses>(12);
  const [busca, setBusca] = useState("");
  const [modalMaterial, setModalMaterial] = useState(false);
  const [modalImport, setModalImport] = useState(false);

  // Importação
  const [impUrl, setImpUrl] = useState("");
  const [impTexto, setImpTexto] = useState("");
  const [impMes, setImpMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [extraindo, setExtraindo] = useState(false);
  const [previa, setPrevia] = useState<LinhaImportada[] | null>(null);
  const [fonte, setFonte] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const r = await resultadosApi.listar();
    setItens(r);
    setCarregado(true);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, []);

  const doPeriodo = useMemo(() => filtrarPeriodo(itens, periodo), [itens, periodo]);
  const resumo = useMemo(() => resumir(doPeriodo), [doPeriodo]);
  const daCidade = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return null;
    const filtrados = doPeriodo.filter((i) => i.cidade.toLowerCase().includes(q));
    return { itens: filtrados, resumo: resumir(filtrados) };
  }, [busca, doPeriodo]);

  const maxMes = Math.max(1, ...resumo.porMes.map((m) => m.qtd));
  const periodoLabel = PERIODOS.find((p) => p.v === periodo)?.label ?? "";
  const preparadoPor = session?.papel === "vendedor" || session?.papel === "supervisor" || session?.papel === "coordenador" ? session?.nome : session?.nome;

  // Dados internos LB (separados dos oficiais): vendas da própria empresa.
  const internoLB = useMemo(() => {
    const total = vendas.length;
    const valor = vendas.reduce((s, v) => s + v.valor, 0);
    return { total, valor };
  }, [vendas]);

  /* ------------------------------- importação ------------------------------- */

  async function extrair(modo: "url" | "arquivo", arquivo?: File) {
    setExtraindo(true);
    setPrevia(null);
    try {
      let res: Response;
      if (modo === "url") {
        if (!impUrl.trim()) {
          notify.error("Informe o link oficial.");
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
      const j = (await res.json()) as { texto?: string; fonte?: string; error?: string };
      if (!res.ok || !j.texto) {
        notify.error(j.error ?? "Falha ao extrair o conteúdo.");
        return;
      }
      const linhas = parsearResultados(j.texto, impMes, j.fonte ?? "importação");
      setFonte(j.fonte ?? "importação");
      setPrevia(linhas);
      if (linhas.length === 0)
        notify.error("Nenhum registro de Sergipe reconhecido — confira o arquivo ou cole o texto manualmente abaixo.");
      else notify.success(`${linhas.length} registro(s) de Sergipe reconhecidos — confira a prévia.`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Erro na extração.");
    } finally {
      setExtraindo(false);
    }
  }

  function extrairDoTexto() {
    if (!impTexto.trim()) return notify.error("Cole o texto do resultado.");
    const linhas = parsearResultados(impTexto, impMes, "texto colado");
    setFonte("texto colado");
    setPrevia(linhas);
    if (linhas.length === 0) notify.error("Nenhum registro de Sergipe reconhecido no texto.");
  }

  async function confirmarImportacao() {
    if (!previa || previa.length === 0) return;
    setSalvando(true);
    const r = await resultadosApi.salvar(previa);
    setSalvando(false);
    if (!r.ok) return notify.error(r.erro ?? "Falha ao salvar.");
    notify.success(`Importação concluída: ${r.inseridos} registro(s) novos (duplicados são ignorados).`);
    setModalImport(false);
    setPrevia(null);
    setImpUrl("");
    setImpTexto("");
    void carregar();
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
            <Button variant="secondary" onClick={() => setModalImport(true)}>
              <FileUp className="h-4 w-4" /> Importar resultado
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setModalMaterial(true)}>
            <ImageIcon className="h-4 w-4" /> Gerar Material
          </Button>
          <Link href={`/resultados/apresentacao?meses=${periodo}${busca ? `&cidade=${encodeURIComponent(busca)}` : ""}`}>
            <Button>
              <MonitorPlay className="h-4 w-4" /> Apresentar ao Cliente
            </Button>
          </Link>
        </div>
      </div>

      {/* filtros de período + pesquisa por cidade */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.v}
            onClick={() => setPeriodo(p.v)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              periodo === p.v
                ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-text)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <Input className="pl-9" placeholder="Pesquisar cidade de Sergipe… (ex.: Aracaju, Lagarto, Itabaiana)" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {carregado && itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
          <Award className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
          <p className="mt-2 font-bold text-[var(--color-text)]">Nenhum resultado importado ainda</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-text-dim)]">
            {isAdmin
              ? "Clique em “Importar resultado” e informe o link oficial da administradora ou envie o PDF — o sistema reconhece e filtra automaticamente os registros de Sergipe."
              : "Peça ao administrador para importar o resultado oficial do mês."}
          </p>
        </div>
      ) : (
        <>
          {/* Dados OFICIAIS */}
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="brand">📜 Dados oficiais da administradora</Badge>
            <span className="text-xs text-[var(--color-muted)]">{periodoLabel}</span>
          </div>

          {daCidade ? (
            /* ------------------------- visão da cidade ------------------------- */
            <div className="rounded-2xl border p-5" style={{ borderColor: "color-mix(in oklab, #d4a72c 45%, transparent)", background: "linear-gradient(160deg, color-mix(in oklab, #d4a72c 8%, var(--color-surface)), var(--color-surface) 70%)" }}>
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--color-text)]">
                <MapPin className="h-5 w-5" style={{ color: "#d4a72c" }} /> {busca.trim()}
              </h2>
              {daCidade.resumo.total === 0 ? (
                <p className="mt-2 text-sm text-[var(--color-text-dim)]">
                  Nenhuma contemplação registrada nessa cidade no período — amplie o período ou confira a grafia.
                </p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-[var(--color-surface-2)]/60 p-3 text-center">
                      <p className="text-3xl font-extrabold tabular-nums" style={{ color: "#d4a72c" }}>{daCidade.resumo.total}</p>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">contemplações</p>
                    </div>
                    <div className="rounded-xl bg-[var(--color-surface-2)]/60 p-3 text-center">
                      <p className="text-xl font-extrabold tabular-nums text-[var(--color-text)]">{BRLc(daCidade.resumo.valorTotal)}</p>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">valor liberado</p>
                    </div>
                    <div className="col-span-2 rounded-xl bg-[var(--color-surface-2)]/60 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">modalidades</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        {daCidade.resumo.porModalidade.map((m) => `${m.nome} (${m.qtd})`).join(" · ") || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end gap-1.5">
                    {daCidade.resumo.porMes.map((m) => (
                      <div key={m.mes} className="flex flex-col items-center gap-1">
                        <div className="w-8 rounded-t bg-[#d4a72c] transition-[height] duration-500" style={{ height: `${Math.max(8, (m.qtd / Math.max(1, ...daCidade.resumo.porMes.map((x) => x.qtd))) * 70)}px` }} />
                        <span className="text-[9px] text-[var(--color-muted)]">{mesLabel(m.mes)}</span>
                      </div>
                    ))}
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
                  <p className="text-2xl font-extrabold tabular-nums text-[var(--color-success)]">{BRLc(resumo.valorTotal)}</p>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">valor total liberado</p>
                </div>
                <div className="lb-fade-up rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center" style={{ animationDelay: "100ms" }}>
                  <p className="text-2xl font-extrabold tabular-nums text-[var(--color-text)]">{resumo.porCidade.length}</p>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">cidades contempladas</p>
                </div>
                <div className="lb-fade-up rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center" style={{ animationDelay: "150ms" }}>
                  <p className="text-2xl font-extrabold tabular-nums text-[var(--color-text)]">
                    {resumo.total > 0 ? BRLc(resumo.valorTotal / resumo.total) : "—"}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">crédito médio</p>
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
                            title={`${mesLabel(m.mes)}: ${m.qtd} · ${BRLc(m.valor)}`}
                          />
                          <span className="text-[9px] text-[var(--color-muted)]">{mesLabel(m.mes)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* modalidades */}
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">🏷️ Por modalidade</h2>
                  <div className="space-y-2">
                    {resumo.porModalidade.slice(0, 6).map((m) => (
                      <div key={m.nome}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span className="font-semibold text-[var(--color-text)]">{m.nome}</span>
                          <span className="tabular-nums text-[var(--color-text-dim)]">{m.qtd} · {BRLc(m.valor)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                          <div className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-700" style={{ width: `${(m.qtd / Math.max(1, resumo.porModalidade[0]?.qtd ?? 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* cidades */}
              <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <h2 className="mb-3 text-sm font-bold text-[var(--color-text)]">🗺️ Contemplações por cidade</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                  {resumo.porCidade.slice(0, 15).map((c, i) => (
                    <button
                      key={c.cidade}
                      onClick={() => setBusca(c.cidade)}
                      className="lb-fade-up rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-3 text-left transition-transform duration-200 hover:-translate-y-0.5"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <p className="truncate text-sm font-bold text-[var(--color-text)]">{c.cidade}</p>
                      <p className="text-lg font-extrabold tabular-nums" style={{ color: "#d4a72c" }}>{c.qtd}</p>
                      <p className="text-[10px] tabular-nums text-[var(--color-muted)]">{BRLc(c.valor)}</p>
                    </button>
                  ))}
                </div>
              </div>
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
        Resultados LB · dados oficiais importados da administradora (filtro automático de Sergipe) · histórico permanente.
      </p>

      {/* ------------------------------ modal material ---------------------------- */}
      <Modal open={modalMaterial} onClose={() => setModalMaterial(false)} title="Gerar Material" subtitle="Com a identidade visual da LB — pronto pra postar ou imprimir.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            onClick={() => void gerarPdfInstitucional({ periodo: periodoLabel, resumo: daCidade?.resumo ?? resumo, preparadoPor })}
          >
            <Download className="h-4 w-4" /> PDF institucional
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              gerarArte("feed", {
                titulo: daCidade ? `Contemplações em ${busca.trim()}` : "Consórcio contempla — e a prova está aqui",
                destaqueQtd: String((daCidade?.resumo ?? resumo).total),
                destaqueValor: BRLc((daCidade?.resumo ?? resumo).valorTotal),
                periodo: periodoLabel,
                preparadoPor,
              })
            }
          >
            <ImageIcon className="h-4 w-4" /> Arte pro Instagram
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              gerarArte("story", {
                titulo: daCidade ? `Contemplações em ${busca.trim()}` : "Tem contemplação em Sergipe? TEM!",
                destaqueQtd: String((daCidade?.resumo ?? resumo).total),
                destaqueValor: BRLc((daCidade?.resumo ?? resumo).valorTotal),
                periodo: periodoLabel,
                preparadoPor,
              })
            }
          >
            <Smartphone className="h-4 w-4" /> Story
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              gerarArte("status", {
                titulo: "Resultados oficiais do consórcio em Sergipe",
                destaqueQtd: String((daCidade?.resumo ?? resumo).total),
                destaqueValor: BRLc((daCidade?.resumo ?? resumo).valorTotal),
                periodo: periodoLabel,
                preparadoPor,
              })
            }
          >
            <Smartphone className="h-4 w-4" /> Status do WhatsApp
          </Button>
          <Button variant="secondary" className="sm:col-span-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Relatório para impressão (imprimir esta tela)
          </Button>
        </div>
        {preparadoPor ? (
          <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
            Os materiais saem com “Apresentação preparada por {preparadoPor} · Consultor LB Representações”.
          </p>
        ) : null}
      </Modal>

      {/* ------------------------------ modal importar ----------------------------- */}
      <Modal open={modalImport} onClose={() => (extraindo || salvando ? null : setModalImport(false))} title="Importar resultado oficial" subtitle="Link OU PDF — o sistema lê, filtra Sergipe e mostra a prévia antes de salvar.">
        <div className="space-y-4">
          <div>
            <Label>Mês de referência do resultado</Label>
            <Input type="month" value={impMes} onChange={(e) => setImpMes(e.target.value)} className="max-w-44" />
          </div>
          <div>
            <Label>Link oficial da administradora</Label>
            <div className="flex gap-2">
              <Input value={impUrl} onChange={(e) => setImpUrl(e.target.value)} placeholder="https://…/resultado.pdf" />
              <Button variant="secondary" onClick={() => void extrair("url")} disabled={extraindo}>
                {extraindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Ler
              </Button>
            </div>
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

          {previa ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3">
              <p className="mb-2 text-sm font-bold text-[var(--color-text)]">
                Prévia — {previa.length} registro(s) de Sergipe reconhecidos {fonte ? `(${fonte})` : ""}
              </p>
              <div className="max-h-44 space-y-1 overflow-y-auto">
                {previa.slice(0, 30).map((l, i) => (
                  <p key={i} className="truncate text-xs text-[var(--color-text-dim)]">
                    📍 {l.cidade} · {l.tipoBem ?? "—"} · {l.valorCredito ? BRLc(l.valorCredito) : "valor —"} ·
                    {l.grupo ? ` G${l.grupo}` : ""}{l.cota ? `/C${l.cota}` : ""} · {l.tipoContemplacao ?? "—"} · {l.mesRef}
                  </p>
                ))}
                {previa.length > 30 ? <p className="text-[11px] text-[var(--color-muted)]">…e mais {previa.length - 30}.</p> : null}
              </div>
              <Button className="mt-3 w-full" onClick={() => void confirmarImportacao()} disabled={salvando || previa.length === 0}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                Confirmar importação ({previa.length})
              </Button>
            </div>
          ) : null}
        </div>
      </Modal>
    </PremiumStage>
  );
}
