"use client";

// ANÁLISE E FICHAS — módulo próprio, sem relação com a Central de Tráfego.
//
// O consultor preenche UMA vez com o cliente; o administrador analisa; a ficha
// sai em PDF a partir dos mesmos dados. O desenho da ficha não mora aqui —
// mora em lib/ficha/modelo.ts, para poder ser trocado depois sem mexer nesta
// tela nem no banco.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  History,
  Hourglass,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";

import { PremiumStage } from "@/components/premium-stage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/lib/notify";
import { useLeadsEscopo, useSession, useVendedoresEscopo } from "@/lib/store";
import { ehAdmin } from "@/lib/permissions";
import { telefoneBonito } from "@/lib/telefone";
import {
  AVISO_ANALISE_INTERNA,
  OBJETIVOS,
  MENSAGENS_REPROVACAO,
  STATUS_ANALISE_INFO,
  TEMPOS_ANALISE,
  analisesApi,
  brlOuTraco,
  calcularLancePct,
  pctOuTraco,
  type Analise,
  type EventoAnalise,
  type StatusAnalise,
  type StatusFinal,
} from "@/lib/analises";
import { AnaliseAndamento, relogio } from "@/components/analises/analise-andamento";
import { AprovacaoCelebracao } from "@/components/analises/aprovacao-celebracao";
import { ReprovacaoResultado } from "@/components/analises/reprovacao-resultado";
import { FichaFinal } from "@/components/analises/ficha-final";
import { MENSAGENS_APROVACAO, fichasApi, type Ficha } from "@/lib/fichas";
import { LEAD_TIPO_INFO } from "@/lib/types";

/* ------------------------------- utilidades -------------------------------- */

const soNum = (t: string) => Number(t.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || undefined;
const dataHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

type Rascunho = {
  leadId?: string;
  nome: string;
  cpf: string;
  nascimento: string;
  email: string;
  telefone: string;
  cidade: string;
  objetivo: string;
  credito: string;
  parcela: string;
  comLance: boolean;
  lanceValor: string;
  lanceEmbutido: string;
  observacoes: string;
};

const VAZIO: Rascunho = {
  nome: "", cpf: "", nascimento: "", email: "", telefone: "", cidade: "",
  objetivo: "", credito: "", parcela: "", comLance: false,
  lanceValor: "", lanceEmbutido: "", observacoes: "",
};

function Campo({
  rotulo, valor, onChange, placeholder, tipo = "text", largura = "",
}: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  placeholder?: string; tipo?: string; largura?: string;
}) {
  return (
    <div className={largura}>
      <Label>{rotulo}</Label>
      <Input type={tipo} value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{rotulo}</p>
      <p className="truncate text-sm font-semibold text-[var(--color-text)]">{valor}</p>
    </div>
  );
}

/* ---------------------------------- página --------------------------------- */

export default function AnalisesPage() {
  const session = useSession();
  const admin = ehAdmin(session);
  const leads = useLeadsEscopo();
  const vendedores = useVendedoresEscopo();

  const [analises, setAnalises] = useState<Analise[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState<StatusAnalise | "todas">("todas");

  const [novaAberta, setNovaAberta] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [buscaLead, setBuscaLead] = useState("");

  const [aberta, setAberta] = useState<Analise | null>(null);
  const [historico, setHistorico] = useState<EventoAnalise[]>([]);
  const [carregandoFicha, setCarregandoFicha] = useState(false);
  const [decisao, setDecisao] = useState<StatusAnalise | null>(null);
  const [obsDecisao, setObsDecisao] = useState("");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [mensagem, setMensagem] = useState(MENSAGENS_APROVACAO[0]);
  const [mensagemRep, setMensagemRep] = useState(MENSAGENS_REPROVACAO[0]);
  /** Configuração da análise com tempo (só quando "deixar em análise"). */
  const [tempo, setTempo] = useState<number>(TEMPOS_ANALISE[1]);
  const [programado, setProgramado] = useState<StatusFinal | null>(null);
  /** Telas que o consultor vira para o cliente. */
  const [celebrar, setCelebrar] = useState<{ nome: string; mensagem: string } | null>(null);
  const [reprovar, setReprovar] = useState<{ nome: string; mensagem: string } | null>(null);
  const [mostrarRelogio, setMostrarRelogio] = useState(false);
  const [conferindo, setConferindo] = useState(false);

  /** Recarrega sob demanda (depois de criar, decidir…). */
  const recarregar = useCallback(async () => {
    const { data, error } = await analisesApi.listar();
    if (error) notify.error("Não consegui carregar as análises", error);
    setAnalises(data);
    setCarregando(false);
  }, []);

  // A primeira carga não pode mexer em estado no corpo do efeito (React 19):
  // o estado só muda quando a resposta chega, e só se a tela ainda existir.
  useEffect(() => {
    let vivo = true;
    void analisesApi.listar().then(({ data, error }) => {
      if (!vivo) return;
      if (error) notify.error("Não consegui carregar as análises", error);
      setAnalises(data);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  /* ------------------------------ lista filtrada ---------------------------- */
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return analises
      .filter((a) => (fStatus === "todas" ? true : a.status === fStatus))
      .filter((a) =>
        !q
          ? true
          : [a.nome, a.cpf, a.telefone, a.cidade, a.objetivo]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(q),
      );
  }, [analises, busca, fStatus]);

  const contagem = useMemo(
    () => ({
      todas: analises.length,
      em_analise: analises.filter((a) => a.status === "em_analise").length,
      aprovado: analises.filter((a) => a.status === "aprovado").length,
      nao_aprovado: analises.filter((a) => a.status === "nao_aprovado").length,
    }),
    [analises],
  );

  /* --------------------------- criar a partir do lead ----------------------- */
  const leadsSugeridos = useMemo(() => {
    const q = buscaLead.trim().toLowerCase();
    if (!q) return [];
    return leads
      .filter((l) => `${l.nome} ${l.telefone}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [leads, buscaLead]);

  /** Puxa o que o CRM já sabe — o consultor não redigita o que já existe. */
  function usarLead(id: string) {
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    setRascunho((r) => ({
      ...r,
      leadId: l.id,
      nome: l.nome || r.nome,
      email: l.email || r.email,
      telefone: l.telefone || r.telefone,
      objetivo: l.tipo ? LEAD_TIPO_INFO[l.tipo].label : r.objetivo,
      credito: l.valorEstimado ? String(l.valorEstimado) : r.credito,
    }));
    setBuscaLead("");
  }

  const pctPrevia = calcularLancePct(soNum(rascunho.credito), soNum(rascunho.lanceValor));

  async function salvarNova(e: React.FormEvent) {
    e.preventDefault();
    if (!rascunho.nome.trim()) {
      notify.error("O nome do cliente é obrigatório");
      return;
    }
    setSalvando(true);
    try {
      const nova = await analisesApi.criar(
        {
          leadId: rascunho.leadId,
          vendedorId: session?.vendedorId,
          criadoPor: session?.id,
          criadoPorNome: session?.nome,
          nome: rascunho.nome.trim(),
          cpf: rascunho.cpf.trim(),
          nascimento: rascunho.nascimento || undefined,
          email: rascunho.email.trim(),
          telefone: rascunho.telefone.trim(),
          cidade: rascunho.cidade.trim(),
          objetivo: rascunho.objetivo,
          credito: soNum(rascunho.credito),
          parcela: soNum(rascunho.parcela),
          comLance: rascunho.comLance,
          lanceValor: rascunho.comLance ? soNum(rascunho.lanceValor) : undefined,
          lanceEmbutido: rascunho.comLance ? soNum(rascunho.lanceEmbutido) : undefined,
          observacoes: rascunho.observacoes.trim(),
        },
        session?.nome,
      );
      notify.success("Análise criada", nova.nome);
      setNovaAberta(false);
      setRascunho(VAZIO);
      await recarregar();
      void abrirFicha(nova);
    } catch (err) {
      notify.error("Não consegui criar", err instanceof Error ? err.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  /* --------------------------------- detalhe -------------------------------- */
  async function abrirFicha(a: Analise) {
    setAberta(a);
    setDecisao(null);
    setObsDecisao("");
    setMensagem(a.mensagemAprovacao ?? MENSAGENS_APROVACAO[0]);
    setCarregandoFicha(true);
    const [h, f] = await Promise.all([analisesApi.historico(a.id), fichasApi.obter(a.id)]);
    setHistorico(h);
    setFicha(f);
    setCarregandoFicha(false);
  }

  /** Recarrega análise + ficha depois de qualquer passo do fluxo. */
  async function recarregarAberta() {
    if (!aberta) return;
    const { data } = await analisesApi.listar();
    setAnalises(data);
    const atual = data.find((x) => x.id === aberta.id) ?? aberta;
    setAberta(atual);
    setFicha(await fichasApi.obter(atual.id));
    setHistorico(await analisesApi.historico(atual.id));
  }
  async function confirmarDecisao() {
    if (!aberta || !decisao) return;
    setSalvando(true);
    try {
      await analisesApi.decidir(aberta.id, decisao, obsDecisao, {
        nome: session?.nome,
        mensagem: decisao === "aprovado" ? mensagem : undefined,
      });
      const aprovou = decisao === "aprovado";
      // Aprovado tem tela própria; os outros dois seguem com o aviso de sempre.
      if (!aprovou) notify.success(`Marcado como ${STATUS_ANALISE_INFO[decisao].curto}`);
      setDecisao(null);
      setObsDecisao("");
      // recarrega do banco: a data de conclusão e a frase são decididas lá.
      await recarregarAberta();
      await recarregar();
      // depois de recarregar: quando a tela fechar, a ficha já está liberada
      // atrás dela. A ficha NÃO é criada aqui — quem decide a hora é o consultor.
      if (aprovou) setCelebrar({ nome: aberta.nome, mensagem });
    } catch (e) {
      notify.error("Não consegui registrar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  /** Inicia a análise com tempo e já abre a tela para o cliente. */
  async function iniciarAnalise() {
    if (!aberta || !programado) return;
    setSalvando(true);
    try {
      const ok = await analisesApi.iniciarAnalise(aberta.id, tempo, programado, { nome: session?.nome });
      if (!ok) {
        // Outro administrador começou antes: nada foi gravado por cima.
        notify.error("Já existe uma análise em andamento", "A tela foi atualizada com o estado atual.");
        await recarregarAberta();
        return;
      }
      setDecisao(null);
      setProgramado(null);
      await recarregarAberta();
      await recarregar();
      setMostrarRelogio(true);
    } catch (e) {
      notify.error("Não consegui iniciar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  /** Revela o resultado programado e o grava como decisão final. */
  async function conferirResultado() {
    if (!aberta) return;
    setConferindo(true);
    try {
      const r = await analisesApi.revelar(aberta.id, { nome: session?.nome });
      setMostrarRelogio(false);
      if (!r) {
        // alguém já revelou nesta proposta — mostra o estado real, sem 2ª decisão
        notify.error("Este resultado já foi conferido", "A tela foi atualizada.");
        await recarregarAberta();
        return;
      }
      const nome = aberta.nome;
      await recarregarAberta();
      await recarregar();
      if (r === "aprovado") setCelebrar({ nome, mensagem: "PROPOSTA APROVADA" });
      else setReprovar({ nome, mensagem: "PROPOSTA NÃO APROVADA" });
    } catch (e) {
      notify.error("Não consegui conferir", e instanceof Error ? e.message : undefined);
    } finally {
      setConferindo(false);
    }
  }

  async function cancelarAnalise() {
    if (!aberta) return;
    if (!confirm("Cancelar a análise em andamento?\n\nO tempo é descartado e a proposta volta a aguardar decisão.")) return;
    try {
      await analisesApi.cancelarAnalise(aberta.id, { nome: session?.nome });
      setMostrarRelogio(false);
      await recarregarAberta();
      await recarregar();
    } catch (e) {
      notify.error("Não consegui cancelar", e instanceof Error ? e.message : undefined);
    }
  }

  /* Há análise correndo? A fonte é o banco: `analiseFim` preenchido significa
     análise pendente, e é isso que impede iniciar outra por cima. */
  const analiseRodando = !!aberta?.analiseFim;
  /* Quanto falta AGORA. Recalculado a cada render do modal (o relógio grande
     dentro da tela cheia tem o próprio tique de meio segundo). */
  const faltaMs = aberta?.analiseFim
    ? Math.max(0, new Date(aberta.analiseFim).getTime() - new Date().getTime())
    : 0;

  const nomeConsultor = (id?: string) => vendedores.find((v) => v.id === id)?.nome ?? "—";

  /* ---------------------------------- render -------------------------------- */
  return (
    <PremiumStage>
      <div className="mx-auto max-w-6xl space-y-5">
        {/* cabeçalho */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-brand)]/15">
              <ClipboardList className="h-5 w-5 text-[var(--color-brand)]" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Análise Final de Proposta</h1>
              <p className="text-sm text-[var(--color-text-dim)]">
                Acompanhe a proposta até a decisão e feche com a ficha final da operação.
              </p>
            </div>
          </div>
          <Button onClick={() => { setRascunho(VAZIO); setNovaAberta(true); }}>
            <Plus className="h-4 w-4" /> Nova análise
          </Button>
        </header>

        {/* aviso institucional — some do lugar nenhum */}
        <div className="flex items-start gap-2 rounded-xl border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/10 px-4 py-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warn)]" />
          <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">{AVISO_ANALISE_INTERNA}</p>
        </div>

        {/* filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 sm:w-auto sm:max-w-sm sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, CPF, telefone ou cidade..."
              className="pl-9"
            />
          </div>
          {([
            { id: "todas" as const, rotulo: "Todas", n: contagem.todas, cor: "#8892A6" },
            { id: "em_analise" as const, rotulo: "Em análise", n: contagem.em_analise, cor: STATUS_ANALISE_INFO.em_analise.cor },
            { id: "aprovado" as const, rotulo: "Aprovadas", n: contagem.aprovado, cor: STATUS_ANALISE_INFO.aprovado.cor },
            { id: "nao_aprovado" as const, rotulo: "Não aprovadas", n: contagem.nao_aprovado, cor: STATUS_ANALISE_INFO.nao_aprovado.cor },
          ]).map((f) => {
            const ativo = fStatus === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFStatus(f.id)}
                className="flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  borderColor: ativo ? f.cor : "var(--color-border)",
                  background: ativo ? `${f.cor}1f` : "transparent",
                  color: ativo ? f.cor : "var(--color-text-dim)",
                }}
              >
                {f.rotulo}
                <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] tabular-nums">{f.n}</span>
              </button>
            );
          })}
        </div>

        {/* lista */}
        {carregando ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-dim)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : filtradas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-[var(--color-muted)]" />
            <p className="mt-2 text-sm font-semibold">
              {analises.length === 0 ? "Nenhuma análise ainda" : "Nada encontrado"}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">
              {analises.length === 0
                ? "Comece pelo botão “Nova análise” — dá para puxar os dados de um negócio do Pipeline."
                : "Ajuste a busca ou o filtro de situação."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtradas.map((a) => {
              const info = STATUS_ANALISE_INFO[a.status];
              return (
                <button
                  key={a.id}
                  onClick={() => void abrirFicha(a)}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--color-brand)]/50"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-[15px] font-bold leading-tight">{a.nome}</p>
                    <Badge tone={info.tone}>{info.curto}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <Linha rotulo="Objetivo" valor={a.objetivo || "—"} />
                    <Linha rotulo="Crédito" valor={brlOuTraco(a.credito)} />
                    <Linha rotulo="Lance" valor={a.comLance ? pctOuTraco(a.lancePct) : "Sem lance"} />
                    <Linha rotulo="Consultor" valor={a.criadoPorNome ?? nomeConsultor(a.vendedorId)} />
                  </div>
                  <p className="mt-3 text-[11px] text-[var(--color-muted)]">Criada em {dataHora(a.criadoEm)}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================ NOVA ANÁLISE ============================ */}
      <Modal
        open={novaAberta}
        onClose={() => (salvando ? null : setNovaAberta(false))}
        title="Nova análise"
        subtitle="Preencha junto com o cliente. O que já existe no CRM é aproveitado."
        icon={<Plus className="h-5 w-5" />}
      >
        <form onSubmit={salvarNova} className="space-y-4">
          {/* puxar de um negócio existente */}
          <div>
            <Label>Puxar de um negócio do Pipeline (opcional)</Label>
            <Input
              value={buscaLead}
              onChange={(e) => setBuscaLead(e.target.value)}
              placeholder="Digite o nome do cliente que já está no Pipeline..."
            />
            {leadsSugeridos.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {leadsSugeridos.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => usarLead(l.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--color-brand)]/60"
                  >
                    <UserRound className="h-4 w-4 shrink-0 text-[var(--color-text-dim)]" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{l.nome}</span>
                    <span className="shrink-0 text-xs text-[var(--color-text-dim)]">{telefoneBonito(l.telefone)}</span>
                  </button>
                ))}
              </div>
            )}
            {rascunho.leadId && (
              <p className="mt-1.5 text-[11px] text-[var(--color-success)]">
                Vinculada ao negócio do Pipeline — o histórico do cliente fica junto.
              </p>
            )}
          </div>

          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Dados do cliente</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome completo *" valor={rascunho.nome} onChange={(v) => setRascunho({ ...rascunho, nome: v })} largura="sm:col-span-2" />
            <Campo rotulo="CPF" valor={rascunho.cpf} onChange={(v) => setRascunho({ ...rascunho, cpf: v })} placeholder="000.000.000-00" />
            <Campo rotulo="Data de nascimento" tipo="date" valor={rascunho.nascimento} onChange={(v) => setRascunho({ ...rascunho, nascimento: v })} />
            <Campo rotulo="Telefone" valor={rascunho.telefone} onChange={(v) => setRascunho({ ...rascunho, telefone: v })} placeholder="(79) 90000-0000" />
            <Campo rotulo="E-mail" tipo="email" valor={rascunho.email} onChange={(v) => setRascunho({ ...rascunho, email: v })} />
            <Campo rotulo="Cidade" valor={rascunho.cidade} onChange={(v) => setRascunho({ ...rascunho, cidade: v })} largura="sm:col-span-2" />
          </div>

          <div>
            <Label>Objetivo do cliente</Label>
            <div className="flex flex-wrap gap-1.5">
              {OBJETIVOS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setRascunho({ ...rascunho, objetivo: rascunho.objetivo === o ? "" : o })}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    rascunho.objetivo === o
                      ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                      : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Dados do consórcio</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Valor do crédito" valor={rascunho.credito} onChange={(v) => setRascunho({ ...rascunho, credito: v })} placeholder="60000" />
            <Campo rotulo="Valor da parcela" valor={rascunho.parcela} onChange={(v) => setRascunho({ ...rascunho, parcela: v })} placeholder="900" />
          </div>

          <div className="flex flex-wrap gap-2">
            {[{ v: false, r: "Sem lance" }, { v: true, r: "Com lance" }].map((m) => (
              <button
                key={String(m.v)}
                type="button"
                onClick={() => setRascunho({ ...rascunho, comLance: m.v })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                  rascunho.comLance === m.v
                    ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                    : "border-[var(--color-border)] text-[var(--color-text-dim)]"
                }`}
              >
                {m.r}
              </button>
            ))}
          </div>

          {rascunho.comLance && (
            <div className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 sm:grid-cols-2">
              <Campo rotulo="Valor do lance" valor={rascunho.lanceValor} onChange={(v) => setRascunho({ ...rascunho, lanceValor: v })} placeholder="15000" />
              <Campo rotulo="Lance embutido (se houver)" valor={rascunho.lanceEmbutido} onChange={(v) => setRascunho({ ...rascunho, lanceEmbutido: v })} />
              {/* a conta aparece enquanto ele digita — é o item 2 do pedido */}
              <div className="sm:col-span-2 flex items-baseline gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Percentual do lance</span>
                <span className="text-lg font-bold text-[var(--color-brand)] tabular-nums">
                  {pctPrevia == null ? "—" : pctOuTraco(pctPrevia)}
                </span>
              </div>
            </div>
          )}

          <div>
            <Label>Observações</Label>
            <textarea
              rows={3}
              value={rascunho.observacoes}
              onChange={(e) => setRascunho({ ...rascunho, observacoes: e.target.value })}
              className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNovaAberta(false)} disabled={salvando}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar análise
            </Button>
          </div>
        </form>
      </Modal>

      {/* ============================== DETALHE ============================== */}
      <Modal
        open={!!aberta}
        onClose={() => setAberta(null)}
        title={aberta?.nome ?? ""}
        subtitle="Documentação, análise interna e ficha"
        icon={<FileText className="h-5 w-5" />}
      >
        {aberta && (
          <div className="space-y-5">
            {/* resumo */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 sm:grid-cols-4">
              <Linha rotulo="CPF" valor={aberta.cpf || "—"} />
              <Linha rotulo="Telefone" valor={aberta.telefone ? telefoneBonito(aberta.telefone) : "—"} />
              <Linha rotulo="Cidade" valor={aberta.cidade || "—"} />
              <Linha rotulo="Objetivo" valor={aberta.objetivo || "—"} />
              <Linha rotulo="Crédito" valor={brlOuTraco(aberta.credito)} />
              <Linha rotulo="Parcela" valor={brlOuTraco(aberta.parcela)} />
              <Linha rotulo="Lance" valor={aberta.comLance ? brlOuTraco(aberta.lanceValor) : "Sem lance"} />
              <Linha rotulo="% do lance" valor={aberta.comLance ? pctOuTraco(aberta.lancePct) : "—"} />
            </div>

            {/* decisão — só admin */}
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                <ShieldCheck className="h-4 w-4" /> Análise interna
              </h3>
              <div className="rounded-xl border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_ANALISE_INFO[aberta.status].tone}>
                    {aberta.status === "aprovado" && aberta.mensagemAprovacao
                      ? aberta.mensagemAprovacao
                      : STATUS_ANALISE_INFO[aberta.status].label}
                  </Badge>
                  {aberta.decididoEm && (
                    <span className="text-[11px] text-[var(--color-text-dim)]">
                      por {aberta.decididoPorNome ?? "—"} · {dataHora(aberta.decididoEm)}
                    </span>
                  )}
                </div>
                {aberta.decisaoObservacao && (
                  <p className="mt-2 text-sm text-[var(--color-text-dim)]">{aberta.decisaoObservacao}</p>
                )}

                {analiseRodando ? (
                  <div className="mt-3 rounded-xl border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                        <Hourglass className="h-4 w-4 text-[var(--color-brand)]" />
                        {faltaMs > 0 ? `Análise em andamento · ${relogio(faltaMs)}` : "Análise finalizada — aguardando conferência"}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-dim)]">
                        {aberta.analiseMinutos} min · iniciada por {aberta.analisePorNome ?? "—"}
                      </span>
                    </div>
                    {admin && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button onClick={() => setMostrarRelogio(true)}>
                          <Hourglass className="h-4 w-4" /> Mostrar ao cliente
                        </Button>
                        <Button variant="ghost" onClick={() => void cancelarAnalise()}>Cancelar análise</Button>
                      </div>
                    )}
                  </div>
                ) : admin ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {([
                        { s: "aprovado" as const, r: "Aprovar", I: CheckCircle2 },
                        { s: "nao_aprovado" as const, r: "Não aprovar", I: XCircle },
                        { s: "em_analise" as const, r: "Deixar em análise", I: Clock },
                      ]).map(({ s, r, I }) => (
                        <button
                          key={s}
                          onClick={() => { setDecisao(s); setObsDecisao(aberta.decisaoObservacao ?? ""); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
                          style={{
                            borderColor: decisao === s ? STATUS_ANALISE_INFO[s].cor : "var(--color-border)",
                            background: decisao === s ? `${STATUS_ANALISE_INFO[s].cor}1f` : "transparent",
                            color: decisao === s ? STATUS_ANALISE_INFO[s].cor : "var(--color-text-dim)",
                          }}
                        >
                          <I className="h-3.5 w-3.5" /> {r}
                        </button>
                      ))}
                    </div>
                    {decisao === "aprovado" && (
                      <div>
                        <Label>Como mostrar o resultado</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {MENSAGENS_APROVACAO.map((m) => (
                            <button
                              key={m}
                              onClick={() => setMensagem(m)}
                              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                                mensagem === m
                                  ? "border-[var(--color-success)] bg-[var(--color-success)]/15 text-[var(--color-success)]"
                                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                          A frase escolhida fica gravada nesta proposta e sai no PDF.
                        </p>
                      </div>
                    )}
                    {decisao === "nao_aprovado" && (
                      <div>
                        <Label>Como mostrar o resultado</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {MENSAGENS_REPROVACAO.map((m) => (
                            <button
                              key={m}
                              onClick={() => setMensagemRep(m)}
                              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                                mensagemRep === m
                                  ? "border-[var(--color-text-dim)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
                                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                          Esta tela também é virada para o cliente — a frase importa.
                        </p>
                      </div>
                    )}

                    {/* análise com tempo: escolhe quanto dura e o que sai no fim */}
                    {decisao === "em_analise" && (
                      <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                        <div>
                          <Label>Tempo da análise</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {TEMPOS_ANALISE.map((t) => (
                              <button
                                key={t}
                                onClick={() => setTempo(t)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                                  tempo === t
                                    ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                                    : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                                }`}
                              >
                                {t} minutos
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label>Resultado após o tempo</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {(["aprovado", "nao_aprovado"] as StatusFinal[]).map((r) => (
                              <button
                                key={r}
                                onClick={() => setProgramado(r)}
                                className="rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
                                style={{
                                  borderColor: programado === r ? STATUS_ANALISE_INFO[r].cor : "var(--color-border)",
                                  background: programado === r ? `${STATUS_ANALISE_INFO[r].cor}1f` : "transparent",
                                  color: programado === r ? STATUS_ANALISE_INFO[r].cor : "var(--color-text-dim)",
                                }}
                              >
                                {STATUS_ANALISE_INFO[r].curto}
                              </button>
                            ))}
                          </div>
                          <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                            O cliente vê o contador; o resultado só aparece quando alguém clicar em conferir.
                          </p>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => { setDecisao(null); setProgramado(null); }}>
                            Cancelar
                          </Button>
                          <Button onClick={() => void iniciarAnalise()} disabled={salvando || !programado}>
                            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hourglass className="h-4 w-4" />}
                            Iniciar análise
                          </Button>
                        </div>
                      </div>
                    )}

                    {decisao && decisao !== "em_analise" && (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={obsDecisao}
                          onChange={(e) => setObsDecisao(e.target.value)}
                          placeholder="Observação (opcional). Ex.: Documentação conferida, cliente apto a prosseguir."
                          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40"
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setDecisao(null)}>Cancelar</Button>
                          <Button onClick={() => void confirmarDecisao()} disabled={salvando}>
                            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Registrar decisão
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-[var(--color-muted)]">
                    A decisão é do administrador. Você acompanha a situação por aqui.
                  </p>
                )}
              </div>
            </section>

            {/* ficha final da operação — a ÚLTIMA etapa */}
            <section id="ficha-final">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                <FileText className="h-4 w-4" /> Ficha final da operação
              </h3>
              <FichaFinal
                analise={aberta}
                ficha={ficha}
                autorNome={session?.nome}
                onMudou={recarregarAberta}
              />
            </section>
            {/* histórico */}
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                <History className="h-4 w-4" /> Histórico
              </h3>
              {carregandoFicha ? (
                <p className="text-xs text-[var(--color-text-dim)]">Carregando…</p>
              ) : historico.length === 0 ? (
                <p className="text-xs text-[var(--color-text-dim)]">Sem registros ainda.</p>
              ) : (
                <ol className="space-y-1.5">
                  {historico.map((h) => (
                    <li key={h.id} className="flex gap-2 rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-xs">
                      <span className="shrink-0 tabular-nums text-[var(--color-muted)]">{dataHora(h.criadoEm)}</span>
                      <span className="min-w-0 flex-1 text-[var(--color-text-dim)]">
                        {h.campo && h.valorAnterior && h.valorNovo ? (
                          <>
                            <span className="font-semibold text-[var(--color-text)]">{h.campo}</span>: {h.valorAnterior} → {h.valorNovo}
                          </>
                        ) : (
                          h.detalhe ?? h.tipo
                        )}
                        {h.autorNome && <span className="text-[var(--color-muted)]"> · {h.autorNome}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </Modal>

      {celebrar && (
        <AprovacaoCelebracao
          nomeCliente={celebrar.nome}
          mensagem={celebrar.mensagem}
          onContinuar={() => setCelebrar(null)}
          onVerFicha={() => {
            setCelebrar(null);
            // a seção já está aberta atrás da tela; só precisa entrar no campo
            // de visão — sem isso o consultor fecha e procura onde clicar.
            setTimeout(
              () => document.getElementById("ficha-final")?.scrollIntoView({ behavior: "smooth", block: "start" }),
              80,
            );
          }}
        />
      )}

      {reprovar && (
        <ReprovacaoResultado
          nomeCliente={reprovar.nome}
          mensagem={reprovar.mensagem}
          onContinuar={() => setReprovar(null)}
        />
      )}

      {mostrarRelogio && aberta?.analiseFim && (
        <AnaliseAndamento
          nomeCliente={aberta.nome}
          fimIso={aberta.analiseFim}
          minutos={aberta.analiseMinutos}
          conferindo={conferindo}
          onConferir={() => void conferirResultado()}
          onFechar={() => setMostrarRelogio(false)}
        />
      )}
    </PremiumStage>
  );
}
