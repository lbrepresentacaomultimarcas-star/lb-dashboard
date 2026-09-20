"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Clock,
  Download,
  Info,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";

import { LEAD_STATUS_INFO, type LeadStatus } from "@/lib/types";
import { brl } from "@/lib/utils";
import { exportXlsx } from "@/lib/export";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * HISTÓRICO POR CONSULTOR — a camada de LEITURA do que já aconteceu.
 *
 * Tudo aqui vem de `/api/analise-comercial`, que lê o histórico inteiro pelo
 * servidor. Esta tela não calcula regra de negócio e não grava nada: mostra o
 * que está registrado e, quando não está, diz "não registrado" em vez de
 * supor. É por isso que o bloco de cobertura fica visível em cima — o número
 * só vale se dá para conferir de onde ele veio.
 */

type Evento = {
  em: string;
  tipo: "criado" | "central" | "etapa" | "atualizacao" | "observacao" | "tentativa" | "venda";
  etapa?: LeadStatus;
  rotulo: string;
  texto?: string;
  quem?: string;
  diasDesdeAnterior: number | null;
};

type Desfecho = { tipo: string; rotulo: string; dias?: number } | null;

type Negocio = {
  leadId: string;
  nome: string;
  consultor: string;
  vendedorId: string | null;
  etapaAtual: LeadStatus;
  criadoEm: string;
  origem: string | null;
  valorEstimado: number | null;
  agendamentos: number;
  reagendamentos: number;
  desfechoAgendamento: Desfecho;
  primeiroContatoEm: string | null;
  vendaEm: string | null;
  vendaValor: number | null;
  perdidoEm: string | null;
  motivoPerda: string | null;
  diasParado: number;
  inconsistencias: string[];
  eventos: Evento[];
  movimentacoesNoPeriodo: number;
};

type Consultor = {
  vendedorId: string | null;
  nome: string;
  negociosComMovimento: number;
  movimentacoes: number;
  atualizacoes: number;
  observacoes: number;
  agendamentos: number;
  reagendamentos: number;
  primeirosContatos: number;
  acompanhamentos: number;
  fechamentos: number;
  perdidos: number;
  vendas: number;
  valorVendido: number;
  parados7: number;
  parados15: number;
  diasAtePrimeiroContato: number | null;
  agendamentosSemResultado: number;
  inconsistencias: number;
};

type Dados = {
  periodo: { de: string; ate: string; rotulo: string; tipo: string };
  geradoEm: string;
  lido: { leads: number; auditoria: number; centrais: number; vendas: number; tentativas: number };
  cobertura: {
    leads: number;
    comHistorico: number;
    semHistorico: number;
    movimentacoes: number;
    atualizacoes: number;
    observacoesDatadas: number;
    agendamentos: number;
    reagendamentos: number;
    agendamentosSemResultado: number;
    inconsistencias: number;
    semInformacaoSuficiente: number;
  };
  consultores: Consultor[];
  vendedores: { id: string; nome: string }[];
  negocios: Negocio[];
  parados: { leadId: string; nome: string; consultor: string; etapaAtual: LeadStatus; diasParado: number; ultimoEventoEm: string }[];
  inconsistencias: { leadId: string; nome: string; consultor: string; etapaAtual: LeadStatus; pontos: string[] }[];
  naoRegistrado: string[];
};

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const soData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const etapa = (s: LeadStatus) => LEAD_STATUS_INFO[s]?.label ?? s;

const COR_EVENTO: Record<Evento["tipo"], string> = {
  criado: "bg-white/40",
  central: "bg-sky-400",
  etapa: "bg-[var(--color-brand)]",
  atualizacao: "bg-white/20",
  observacao: "bg-amber-300",
  tentativa: "bg-violet-400",
  venda: "bg-emerald-400",
};

function Numero({ rotulo, valor, sub, cor }: { rotulo: string; valor: string | number; sub?: string; cor?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{rotulo}</p>
      <p className={`mt-0.5 truncate text-lg font-bold ${cor ?? "text-white"}`}>{valor}</p>
      {sub && <p className="text-[10px] text-white/40">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ ficha */

function FichaNegocio({ n }: { n: Negocio }) {
  const [aberto, setAberto] = useState(false);
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-white/[0.03]"
      >
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${aberto ? "rotate-180" : ""}`} />
        <span className="min-w-[120px] flex-1 truncate font-medium text-white">{n.nome}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">{etapa(n.etapaAtual)}</span>
        {n.agendamentos > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300">
            <CalendarClock className="h-3 w-3" />
            {n.agendamentos} agendamento{n.agendamentos > 1 ? "s" : ""}
            {n.reagendamentos > 0 && ` · ${n.reagendamentos} reagendado`}
          </span>
        )}
        {n.vendaEm && <span className="text-[11px] font-semibold text-emerald-400">Vendido {brl(n.vendaValor ?? 0)}</span>}
        {n.diasParado > 7 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
            <Clock className="h-3 w-3" /> parado há {n.diasParado.toFixed(0)}d
          </span>
        )}
        <span className="text-[11px] text-white/40">{n.eventos.length} registros no período</span>
      </button>

      {aberto && (
        <div className="border-t border-white/10 px-3 py-3">
          <div className="mb-3 grid gap-2 text-[11px] sm:grid-cols-4">
            <div>
              <span className="text-white/40">Entrou no Pipeline</span>
              <p className="text-white/80">{soData(n.criadoEm)}</p>
            </div>
            <div>
              <span className="text-white/40">Primeiro contato</span>
              <p className="text-white/80">{n.primeiroContatoEm ? soData(n.primeiroContatoEm) : "Não registrado"}</p>
            </div>
            <div>
              <span className="text-white/40">Data/hora do agendamento</span>
              <p className="text-white/50 italic">Não registrado</p>
            </div>
            <div>
              <span className="text-white/40">Resultado do agendamento</span>
              <p className="text-white/80">{n.desfechoAgendamento?.rotulo ?? "Nunca foi agendado"}</p>
            </div>
          </div>

          <ol className="space-y-1.5 border-l border-white/10 pl-4">
            {n.eventos.map((e, i) => (
              <li key={`${e.em}-${i}`} className="relative text-xs">
                <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${COR_EVENTO[e.tipo]}`} />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="tabular-nums text-white/45">{dataHora(e.em)}</span>
                  <span className={e.tipo === "etapa" ? "font-semibold text-white" : "text-white/75"}>{e.rotulo}</span>
                  {e.diasDesdeAnterior != null && e.diasDesdeAnterior >= 0.1 && (
                    <span className="text-white/35">+{e.diasDesdeAnterior.toFixed(1)}d</span>
                  )}
                  {e.quem && <span className="text-white/30">· {e.quem.split("@")[0]}</span>}
                </div>
                {e.texto && <p className="mt-0.5 whitespace-pre-wrap text-white/60">{e.texto}</p>}
              </li>
            ))}
          </ol>

          {n.inconsistencias.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/8 p-2">
              <p className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                <AlertTriangle className="h-3 w-3" /> Precisa de conferência
              </p>
              <ul className="list-disc pl-4 text-[11px] text-white/70">
                {n.inconsistencias.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ tela */

export function HistoricoConsultores() {
  const [tipo, setTipo] = useState<"semana" | "quinzena" | "mes" | "personalizado">("semana");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [busca, setBusca] = useState("");
  const [d, setD] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const q = new URLSearchParams({ tipo });
      if (tipo === "personalizado") {
        if (!de || !ate) {
          setCarregando(false);
          return;
        }
        q.set("de", de);
        q.set("ate", ate);
      }
      if (vendedor) q.set("vendedor", vendedor);
      const r = await fetch(`/api/analise-comercial?${q}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao carregar");
      setD(j as Dados);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [tipo, de, ate, vendedor]);

  // React 19: nada de setState direto no corpo do efeito.
  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const negociosPorConsultor = useMemo(() => {
    const m = new Map<string, Negocio[]>();
    for (const n of d?.negocios ?? []) {
      const k = n.vendedorId ?? "__sem__";
      const lista = m.get(k) ?? [];
      lista.push(n);
      m.set(k, lista);
    }
    return m;
  }, [d?.negocios]);

  async function exportar() {
    if (!d) return;
    const periodo = `${soData(d.periodo.de)} a ${soData(d.periodo.ate)}`;
    const abas: Record<string, (string | number)[][]> = {
      Consultores: [
        ["Análise Comercial — " + periodo],
        ["Consultor", "Negócios com movimento", "Movimentações", "Atualizações", "Observações", "Agendamentos", "Reagendamentos", "1º contato", "Acompanhamentos", "Fechamentos", "Perdidos", "Vendas", "Valor vendido", "Parados 8-15d", "Parados +15d", "Dias até 1º contato", "Agendamentos sem resultado"],
        ...d.consultores.map((c) => [
          c.nome, c.negociosComMovimento, c.movimentacoes, c.atualizacoes, c.observacoes, c.agendamentos, c.reagendamentos,
          c.primeirosContatos, c.acompanhamentos, c.fechamentos, c.perdidos, c.vendas, c.valorVendido,
          c.parados7, c.parados15, c.diasAtePrimeiroContato ?? "Não registrado", c.agendamentosSemResultado,
        ]),
      ],
      Negocios: [
        ["Consultor", "Cliente", "Etapa atual", "Entrou no Pipeline", "1º contato", "Data/hora do agendamento", "Agendamentos", "Reagendamentos", "Resultado do agendamento", "Registros no período", "Dias parado", "Venda", "Motivo da perda"],
        ...d.negocios.map((n) => [
          n.consultor, n.nome, etapa(n.etapaAtual), soData(n.criadoEm),
          n.primeiroContatoEm ? soData(n.primeiroContatoEm) : "Não registrado",
          "Não registrado",
          n.agendamentos, n.reagendamentos,
          n.desfechoAgendamento?.rotulo ?? "Nunca foi agendado",
          n.eventos.length, n.diasParado.toFixed(1),
          n.vendaValor ?? "", n.motivoPerda ?? "",
        ]),
      ],
      Movimentacoes: [
        ["Consultor", "Cliente", "Quando", "Tipo", "Registro", "Quem", "Dias desde o anterior"],
        ...d.negocios.flatMap((n) =>
          n.eventos.map((e) => [n.consultor, n.nome, dataHora(e.em), e.tipo, e.rotulo + (e.texto ? " — " + e.texto.replace(/\s+/g, " ") : ""), e.quem ?? "", e.diasDesdeAnterior ?? ""]),
        ),
      ],
      Parados: [
        ["Consultor", "Cliente", "Etapa", "Dias parado", "Último registro"],
        ...d.parados.map((p) => [p.consultor, p.nome, etapa(p.etapaAtual), p.diasParado.toFixed(1), dataHora(p.ultimoEventoEm)]),
      ],
      Inconsistencias: [
        ["Consultor", "Cliente", "Etapa", "O que precisa conferir"],
        ...d.inconsistencias.flatMap((i) => i.pontos.map((p) => [i.consultor, i.nome, etapa(i.etapaAtual), p])),
      ],
    };
    try {
      await exportXlsx(`analise-comercial-${d.periodo.tipo}.xlsx`, abas);
      notify.success("Excel gerado");
    } catch {
      notify.error("Não consegui gerar o Excel");
    }
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------- filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div>
          <Label htmlFor="per">Período</Label>
          <select
            id="per"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
            className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white"
          >
            <option value="semana" className="bg-[#0b0d16]">Semana (seg a dom)</option>
            <option value="quinzena" className="bg-[#0b0d16]">Últimos 15 dias</option>
            {/* "Mês" aqui é o mês do calendário. O ciclo de produção (fecha dia
                20) é outra régua e vive no ranking/financeiro — misturar as duas
                numa tela de atividade só confundiria a leitura da reunião. */}
            <option value="mes" className="bg-[#0b0d16]">Mês (calendário)</option>
            <option value="personalizado" className="bg-[#0b0d16]">Período escolhido</option>
          </select>
        </div>
        {tipo === "personalizado" && (
          <>
            <div>
              <Label htmlFor="de">De</Label>
              <Input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-[150px]" />
            </div>
            <div>
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-[150px]" />
            </div>
          </>
        )}
        <div>
          <Label htmlFor="cons">Consultor</Label>
          <select
            id="cons"
            value={vendedor}
            onChange={(e) => setVendedor(e.target.value)}
            className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white"
          >
            <option value="" className="bg-[#0b0d16]">Todos</option>
            {(d?.vendedores ?? []).map((v) => (
              <option key={v.id} value={v.id} className="bg-[#0b0d16]">{v.nome}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <Label htmlFor="busca">Buscar cliente</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <Input id="busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nome do cliente" className="pl-8" />
          </div>
        </div>
        <Button variant="ghost" onClick={() => void carregar()} disabled={carregando}>
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
        </Button>
        <Button variant="secondary" onClick={() => void exportar()} disabled={!d}>
          <Download className="h-4 w-4" /> Excel
        </Button>
      </div>

      {erro && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{erro}</p>
      )}
      {carregando && !d && <p className="text-sm text-white/50">Lendo o histórico inteiro…</p>}

      {d && (
        <>
          {/* --------------------------------- o que foi lido (transparência) */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
              O que este painel leu — {soData(d.periodo.de)} a {soData(d.periodo.ate)}
            </p>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Numero rotulo="Negócios" valor={d.cobertura.leads} sub={`${d.cobertura.comHistorico} com histórico`} />
              <Numero rotulo="Registros de auditoria" valor={d.lido.auditoria} sub="lidos do início ao fim" />
              <Numero rotulo="Movimentações reais" valor={d.cobertura.movimentacoes} sub="a etapa mudou" />
              <Numero rotulo="Salvamentos sem mudar etapa" valor={d.cobertura.atualizacoes} sub="não é movimentação" cor="text-white/60" />
              <Numero rotulo="Observações com data" valor={d.cobertura.observacoesDatadas} />
              <Numero
                rotulo="Sem informação suficiente"
                valor={d.cobertura.semInformacaoSuficiente}
                sub="nem etapa nem observação"
                cor={d.cobertura.semInformacaoSuficiente > 0 ? "text-amber-300" : undefined}
              />
            </div>
            <p className="mt-3 flex items-start gap-2 text-[11px] text-white/50">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="text-white/70">Não existe no CRM e por isso aparece como &quot;não registrado&quot;:</strong>{" "}
                {d.naoRegistrado.join(" · ")}. Ausência de registro nunca é tratada como
                &quot;compareceu&quot; ou &quot;não compareceu&quot;.
              </span>
            </p>
          </section>

          {/* ------------------------------------------- tabela de consultores */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-white/50">Movimentação por consultor</p>
            <div className="lb-scroll overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                    <th className="pb-2">Consultor</th>
                    <th className="pb-2 text-right">Negócios</th>
                    <th className="pb-2 text-right">Movimentações</th>
                    <th className="pb-2 text-right">Agendamentos</th>
                    <th className="pb-2 text-right">Reagend.</th>
                    <th className="pb-2 text-right">1º contato</th>
                    <th className="pb-2 text-right">Acomp.</th>
                    <th className="pb-2 text-right">Fechou</th>
                    <th className="pb-2 text-right">Perdeu</th>
                    <th className="pb-2 text-right">Vendas</th>
                    <th className="pb-2 text-right">Parados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {d.consultores.filter((c) => c.negociosComMovimento > 0).map((c) => (
                    <tr key={c.vendedorId ?? "sem"} className="hover:bg-white/[0.03]">
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => setExpandido(expandido === (c.vendedorId ?? "__sem__") ? null : (c.vendedorId ?? "__sem__"))}
                          className="inline-flex items-center gap-1.5 font-medium text-white hover:underline"
                        >
                          <UserRound className="h-3.5 w-3.5 text-white/40" />
                          {c.nome}
                        </button>
                      </td>
                      <td className="py-2 text-right tabular-nums text-white/70">{c.negociosComMovimento}</td>
                      <td className="py-2 text-right font-semibold tabular-nums text-white">{c.movimentacoes}</td>
                      <td className="py-2 text-right tabular-nums text-cyan-300">{c.agendamentos}</td>
                      <td className="py-2 text-right tabular-nums text-white/60">{c.reagendamentos}</td>
                      <td className="py-2 text-right tabular-nums text-white/70">{c.primeirosContatos}</td>
                      <td className="py-2 text-right tabular-nums text-white/70">{c.acompanhamentos}</td>
                      <td className="py-2 text-right tabular-nums text-emerald-400">{c.fechamentos}</td>
                      <td className="py-2 text-right tabular-nums text-rose-400">{c.perdidos}</td>
                      <td className="py-2 text-right tabular-nums text-emerald-400">
                        {c.vendas > 0 ? `${c.vendas} · ${brl(c.valorVendido)}` : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-amber-300">{c.parados7 + c.parados15}</td>
                    </tr>
                  ))}
                  {d.consultores.filter((c) => c.negociosComMovimento > 0).length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-6 text-center text-xs text-white/40">
                        Nenhuma movimentação registrada neste período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-white/40">
              Clique no nome para abrir cliente por cliente. &quot;Movimentações&quot; conta só quando a etapa mudou de verdade.
            </p>
          </section>

          {/* ------------------------------------- clientes do consultor aberto */}
          {expandido && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-white/50">
                {d.consultores.find((c) => (c.vendedorId ?? "__sem__") === expandido)?.nome} — cliente por cliente
              </p>
              <ul className="space-y-2">
                {(negociosPorConsultor.get(expandido) ?? [])
                  .filter((n) => !busca || n.nome.toLowerCase().includes(busca.toLowerCase()))
                  .map((n) => (
                    <FichaNegocio key={n.leadId} n={n} />
                  ))}
              </ul>
            </section>
          )}

          {/* ------------------------------------------------ parados */}
          {d.parados.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
                Clientes parados ({d.parados.length}) — sem nenhum registro há mais de 7 dias
              </p>
              <div className="lb-scroll max-h-64 overflow-y-auto">
                <ul className="space-y-1 text-sm">
                  {d.parados.slice(0, 60).map((p) => (
                    <li key={p.leadId} className="flex flex-wrap items-center gap-x-3 text-white/75">
                      <span className="min-w-[130px] flex-1 truncate">{p.nome}</span>
                      <span className="text-xs text-white/45">{p.consultor}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{etapa(p.etapaAtual)}</span>
                      <span className={`text-xs font-semibold ${p.diasParado > 15 ? "text-rose-400" : "text-amber-300"}`}>
                        {p.diasParado.toFixed(0)} dias
                      </span>
                      <span className="text-[11px] text-white/35">último: {soData(p.ultimoEventoEm)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* ------------------------------------------ inconsistências */}
          {d.inconsistencias.length > 0 && (
            <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
              <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Precisa de conferência ({d.inconsistencias.length} negócios)
              </p>
              <p className="mb-2 text-[11px] text-white/55">
                Nada disso foi corrigido automaticamente. São casos em que o registro não fecha e alguém precisa decidir.
              </p>
              <div className="lb-scroll max-h-64 overflow-y-auto">
                <ul className="space-y-1.5 text-sm">
                  {d.inconsistencias.slice(0, 60).map((i) => (
                    <li key={i.leadId} className="text-white/75">
                      <span className="font-medium text-white">{i.nome}</span>
                      <span className="text-xs text-white/45"> · {i.consultor} · {etapa(i.etapaAtual)}</span>
                      <ul className="list-disc pl-5 text-[11px] text-white/60">
                        {i.pontos.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <p className="text-center text-[10px] text-white/30">
            Gerado em {dataHora(d.geradoEm)} · leitura de {d.lido.auditoria} registros de auditoria,{" "}
            {d.lido.leads} negócios, {d.lido.vendas} vendas · esta tela não altera nenhum dado
          </p>
        </>
      )}
    </div>
  );
}
