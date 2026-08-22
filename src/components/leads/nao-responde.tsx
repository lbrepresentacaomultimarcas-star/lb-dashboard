"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock,
  History,
  MessageSquareText,
  Repeat2,
  Send,
  User,
} from "lucide-react";
import {
  CANAL_INFO,
  CATEGORIA_MENSAGEM_INFO,
  CATEGORIA_ORDEM,
  LEAD_TIPO_INFO,
  RESULTADO_INFO,
  type CanalTentativa,
  type CategoriaMensagem,
  type Lead,
  type MensagemPronta,
  type ResultadoTentativa,
  type Tentativa,
} from "@/lib/types";
import { tentativasApi, useMensagensProntas } from "@/lib/store";
import { notify } from "@/lib/notify";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * Etapa "NÃO RESPONDE" — ferramenta de apoio ao consultor.
 *
 * Aparece SOMENTE nos cards dessa etapa e é 100% aditiva: não move ninguém
 * sozinho, não manda nada em massa e não altera o funil. Cada mensagem é
 * enviada UMA a UMA, pelo próprio consultor, no WhatsApp dele.
 */

const EMPRESA = "LB Representações";

/* ------------------------------- utilidades ------------------------------- */

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function waLink(telefone: string, texto?: string) {
  const d = onlyDigits(telefone);
  if (!d) return null;
  const numero = d.startsWith("55") ? d : `55${d}`;
  const q = texto ? `?text=${encodeURIComponent(texto)}` : "";
  return `https://wa.me/${numero}${q}`;
}

/** Troca {{nome}}, {{consultor}}, {{produto}} e {{empresa}} pelos dados reais. */
export function aplicarVariaveis(
  texto: string,
  lead: Lead,
  consultorNome: string,
): string {
  const primeiroNome = (lead.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const produto = lead.tipo ? LEAD_TIPO_INFO[lead.tipo].label.toLowerCase() : "negócio";
  return texto
    .replace(/\{\{\s*nome\s*\}\}/gi, primeiroNome)
    .replace(/\{\{\s*consultor\s*\}\}/gi, consultorNome || "")
    .replace(/\{\{\s*produto\s*\}\}/gi, produto)
    .replace(/\{\{\s*empresa\s*\}\}/gi, EMPRESA)
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** "há 3 dias", "há 4 h", "agora há pouco" — em português, sem abreviação seca. */
function desde(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 2) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "há 1 dia";
  if (d < 30) return `há ${d} dias`;
  const m = Math.floor(d / 30);
  return m === 1 ? "há 1 mês" : `há ${m} meses`;
}

function dataHora(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ----------------------- painel dentro do card do lead --------------------- */

export function PainelNaoResponde({
  lead,
  consultorNome,
}: {
  lead: Lead;
  consultorNome: string;
}) {
  const [abrirMensagens, setAbrirMensagens] = useState(false);
  const [abrirHistorico, setAbrirHistorico] = useState(false);
  const biblioteca = useMensagensProntas();

  const tentativas = lead.tentativas ?? 0;
  const silencio = desde(lead.naoRespondeDesde ?? lead.atualizadoEm ?? lead.criadoEm);

  /** Sugestão de abordagem — só a primeira linha aparece no card. */
  const sugestao = useMemo(() => {
    const ativas = biblioteca.filter((m) => m.ativo);
    if (ativas.length === 0) return null;
    const porOrdem = [...ativas].sort((a, b) => {
      const ia = CATEGORIA_ORDEM.indexOf(a.categoria as CategoriaMensagem);
      const ib = CATEGORIA_ORDEM.indexOf(b.categoria as CategoriaMensagem);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.ordem - b.ordem;
    });
    return aplicarVariaveis(porOrdem[0].texto, lead, consultorNome);
  }, [biblioteca, lead, consultorNome]);

  return (
    <>
      <div
        className="relative mt-2.5 rounded-lg border p-2.5"
        style={{
          borderColor: "rgba(148,163,184,.28)",
          background:
            "linear-gradient(150deg, rgba(148,163,184,.14), rgba(148,163,184,.05))",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-300">
            <Repeat2 className="h-3 w-3" /> Recuperação
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            style={{
              background: tentativas === 0 ? "rgba(248,113,113,.18)" : "rgba(148,163,184,.2)",
              color: tentativas === 0 ? "#fca5a5" : "#e2e8f0",
            }}
          >
            {tentativas === 0
              ? "Sem tentativa"
              : `${tentativas} tentativa${tentativas > 1 ? "s" : ""}`}
          </span>
        </div>

        <dl className="mt-2 space-y-1 text-[10px] leading-relaxed text-white/60">
          <div className="flex items-start gap-1.5">
            <Clock className="mt-[1px] h-3 w-3 shrink-0 text-white/40" />
            <dt className="sr-only">Em silêncio</dt>
            <dd>
              Em silêncio <strong className="font-semibold text-white/85">{silencio}</strong>
            </dd>
          </div>
          {lead.ultimaTentativaEm && (
            <div className="flex items-start gap-1.5">
              <Send className="mt-[1px] h-3 w-3 shrink-0 text-white/40" />
              <dt className="sr-only">Última tentativa</dt>
              <dd className="min-w-0">
                <span className="block truncate text-white/85">
                  {lead.ultimaTentativaAcao ?? "Tentativa registrada"}
                </span>
                <span className="text-white/45">
                  {dataHora(lead.ultimaTentativaEm)} · {desde(lead.ultimaTentativaEm)}
                </span>
              </dd>
            </div>
          )}
          {consultorNome && (
            <div className="flex items-start gap-1.5">
              <User className="mt-[1px] h-3 w-3 shrink-0 text-white/40" />
              <dt className="sr-only">Responsável</dt>
              <dd className="truncate text-white/70">{consultorNome}</dd>
            </div>
          )}
        </dl>

        {sugestao && (
          <p
            className="mt-2 overflow-hidden text-[10px] italic leading-snug text-white/45"
            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
            title="Sugestão de abordagem — abra para ler e ajustar"
          >
            “{sugestao}”
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAbrirMensagens(true)}
            className="min-w-0 flex-1 truncate rounded-lg border border-emerald-400/35 bg-emerald-400/12 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200 transition-colors hover:bg-emerald-400/22"
          >
            💬 Ver mensagem
          </button>
          <button
            type="button"
            onClick={() => setAbrirHistorico(true)}
            title="Histórico de recuperação"
            aria-label="Histórico de recuperação"
            className="shrink-0 rounded-lg border border-white/12 bg-white/5 p-1.5 text-white/55 transition-colors hover:bg-white/12 hover:text-white"
          >
            <History className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {abrirMensagens && (
        <ModalMensagensProntas
          open
          onClose={() => setAbrirMensagens(false)}
          lead={lead}
          consultorNome={consultorNome}
        />
      )}
      {abrirHistorico && (
        <ModalHistoricoRecuperacao
          open
          onClose={() => setAbrirHistorico(false)}
          lead={lead}
        />
      )}
    </>
  );
}

/* --------------------------- modal: mensagens prontas --------------------- */

export function ModalMensagensProntas({
  open,
  onClose,
  lead,
  consultorNome,
}: {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  consultorNome: string;
}) {
  const biblioteca = useMensagensProntas();
  const [categoria, setCategoria] = useState<CategoriaMensagem | null>(null);
  const [escolhida, setEscolhida] = useState<MensagemPronta | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const ativas = useMemo(() => biblioteca.filter((m) => m.ativo), [biblioteca]);

  const categorias = useMemo(() => {
    const usadas = new Set(ativas.map((m) => m.categoria));
    const conhecidas = CATEGORIA_ORDEM.filter((c) => usadas.has(c));
    const extras = [...usadas].filter(
      (c) => !CATEGORIA_ORDEM.includes(c as CategoriaMensagem),
    ) as CategoriaMensagem[];
    return [...conhecidas, ...extras];
  }, [ativas]);

  // a categoria em foco é DERIVADA: enquanto o consultor não escolhe uma,
  // vale a primeira disponível. (O modal só é montado quando abre, então o
  // estado já nasce limpo a cada abertura — sem efeito de sincronização.)
  const categoriaAtiva = categoria ?? categorias[0] ?? null;

  const daCategoria = useMemo(
    () =>
      ativas
        .filter((m) => m.categoria === categoriaAtiva)
        .sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo)),
    [ativas, categoriaAtiva],
  );

  function selecionar(m: MensagemPronta) {
    setEscolhida(m);
    setTexto(aplicarVariaveis(m.texto, lead, consultorNome));
  }

  async function enviar() {
    const link = waLink(lead.telefone, texto);
    if (!link) {
      notify.error("Este negócio não tem telefone cadastrado");
      return;
    }
    setEnviando(true);
    try {
      // abre o WhatsApp do próprio consultor (envio individual, manual)
      window.open(link, "_blank", "noopener");
      await tentativasApi.registrar(lead, {
        canal: "whatsapp",
        acao: `WhatsApp · ${escolhida?.titulo ?? "Mensagem personalizada"}`,
        mensagemId: escolhida?.id,
        mensagemTitulo: escolhida?.titulo,
        categoria: escolhida?.categoria,
        automatica: true,
      });
      notify.success(
        "Tentativa registrada",
        "A mensagem abriu no WhatsApp — é só apertar enviar por lá.",
      );
      onClose();
    } catch (e) {
      notify.error("Não consegui registrar a tentativa", e instanceof Error ? e.message : undefined);
    } finally {
      setEnviando(false);
    }
  }

  const semBiblioteca = ativas.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mensagens prontas"
      subtitle={`${lead.nome} · escolha o argumento, revise e envie`}
      icon={<MessageSquareText className="h-5 w-5" />}
    >
      {/* contexto do lead — para decidir a abordagem sem sair da janela */}
      <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{lead.nome}</p>
            <p className="text-[11px] text-[var(--color-text-dim)]">
              {lead.tipo ? LEAD_TIPO_INFO[lead.tipo].label : "Negócio"}
              {lead.telefone ? ` · ${lead.telefone}` : ""}
              {consultorNome ? ` · ${consultorNome}` : ""}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: (lead.tentativas ?? 0) === 0 ? "rgba(248,113,113,.16)" : "rgba(148,163,184,.18)",
              color: (lead.tentativas ?? 0) === 0 ? "#fca5a5" : "#cbd5e1",
            }}
          >
            {(lead.tentativas ?? 0) === 0
              ? "Sem tentativa"
              : `${lead.tentativas} tentativa${(lead.tentativas ?? 0) > 1 ? "s" : ""}`}
          </span>
        </div>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
          <div className="flex gap-1.5">
            <dt className="text-[var(--color-text-dim)]">Sem resposta:</dt>
            <dd className="font-medium">{desde(lead.naoRespondeDesde ?? lead.atualizadoEm ?? lead.criadoEm)}</dd>
          </div>
          <div className="flex min-w-0 gap-1.5">
            <dt className="shrink-0 text-[var(--color-text-dim)]">Última ação:</dt>
            <dd className="min-w-0 truncate font-medium">{lead.ultimaTentativaAcao ?? "—"}</dd>
          </div>
          {lead.ultimaTentativaEm && (
            <div className="flex gap-1.5">
              <dt className="text-[var(--color-text-dim)]">Quando:</dt>
              <dd className="font-medium">{dataHora(lead.ultimaTentativaEm)}</dd>
            </div>
          )}
          {lead.valorEstimado > 0 && (
            <div className="flex gap-1.5">
              <dt className="text-[var(--color-text-dim)]">Valor:</dt>
              <dd className="font-medium tabular-nums">
                {lead.valorEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {semBiblioteca ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4 text-sm text-[var(--color-text-dim)]">
          Nenhuma mensagem cadastrada ainda. O administrador cria a biblioteca em{" "}
          <strong>Administrativo → Mensagens Prontas</strong>.
        </p>
      ) : (
        <div className="space-y-4">
          {/* categorias */}
          <div className="flex flex-wrap gap-1.5">
            {categorias.map((c) => {
              const info = CATEGORIA_MENSAGEM_INFO[c];
              const sel = categoriaAtiva === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoria(c)}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={{
                    borderColor: sel ? `${info?.cor ?? "#94a3b8"}80` : "var(--color-border)",
                    background: sel ? `${info?.cor ?? "#94a3b8"}22` : "transparent",
                    color: sel ? (info?.cor ?? "#94a3b8") : "var(--color-text-dim)",
                  }}
                >
                  {info ? `${info.emoji} ${info.label}` : c}
                </button>
              );
            })}
          </div>

          {categoriaAtiva && CATEGORIA_MENSAGEM_INFO[categoriaAtiva] && (
            <p className="-mt-1 text-xs text-[var(--color-text-dim)]">
              {CATEGORIA_MENSAGEM_INFO[categoriaAtiva].descricao}
            </p>
          )}

          {/* mensagens da categoria */}
          <div className="grid gap-2 sm:grid-cols-2">
            {daCategoria.map((m) => {
              const sel = escolhida?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selecionar(m)}
                  className="rounded-lg border p-3 text-left transition-colors"
                  style={{
                    borderColor: sel ? "var(--color-brand)" : "var(--color-border)",
                    background: sel ? "rgba(37,99,255,.10)" : "var(--color-surface-2)",
                  }}
                >
                  <p className="text-xs font-semibold">{m.titulo}</p>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
                    {aplicarVariaveis(m.texto, lead, consultorNome)}
                  </p>
                </button>
              );
            })}
          </div>

          {/* pré-visualização editável */}
          {escolhida && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                  Pré-visualização — você pode ajustar antes de enviar
                </p>
                <span className="text-[11px] text-[var(--color-text-dim)]">
                  {texto.length} caracteres
                </span>
              </div>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={5}
                className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm leading-relaxed outline-none focus:border-[var(--color-brand)]"
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={onClose}>
                  Cancelar
                </Button>
                <Button disabled={enviando || !texto.trim()} onClick={() => void enviar()}>
                  <Send className="h-4 w-4" /> Enviar pelo WhatsApp
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
                O WhatsApp abre com o texto pronto no número já cadastrado
                {lead.telefone ? ` (${lead.telefone})` : ""}. O envio é feito por você, um a um —
                o sistema só registra a tentativa.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------ modal: histórico + registro --------------------- */

const CANAIS: CanalTentativa[] = ["whatsapp", "ligacao", "presencial", "email", "outro"];
const RESULTADOS: ResultadoTentativa[] = [
  "sem_resposta",
  "respondeu",
  "agendou",
  "nao_quer",
  "outro",
];

export function ModalHistoricoRecuperacao({
  open,
  onClose,
  lead,
}: {
  open: boolean;
  onClose: () => void;
  lead: Lead;
}) {
  const [itens, setItens] = useState<Tentativa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [canal, setCanal] = useState<CanalTentativa>("ligacao");
  const [resultado, setResultado] = useState<ResultadoTentativa>("sem_resposta");
  const [acao, setAcao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setItens(await tentativasApi.listar(lead.id));
    } catch {
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, [lead.id]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [open, carregar]);

  async function registrar() {
    const resumo = acao.trim() || `${CANAL_INFO[canal].label} · ${RESULTADO_INFO[resultado].label}`;
    setSalvando(true);
    try {
      await tentativasApi.registrar(lead, { canal, acao: resumo, resultado });
      setAcao("");
      await carregar();
      notify.success("Tentativa registrada");
    } catch (e) {
      notify.error("Não consegui registrar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Histórico de recuperação"
      subtitle={`${lead.nome} · ${lead.tentativas ?? 0} tentativa${(lead.tentativas ?? 0) === 1 ? "" : "s"}`}
      icon={<History className="h-5 w-5" />}
    >
      <div className="space-y-4">
        {/* registro manual */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            Registrar uma tentativa feita por fora
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              <span className="text-[var(--color-text-dim)]">Canal</span>
              <select
                value={canal}
                onChange={(e) => setCanal(e.target.value as CanalTentativa)}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
              >
                {CANAIS.map((c) => (
                  <option key={c} value={c}>
                    {CANAL_INFO[c].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="text-[var(--color-text-dim)]">Resultado</span>
              <select
                value={resultado}
                onChange={(e) => setResultado(e.target.value as ResultadoTentativa)}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
              >
                {RESULTADOS.map((r) => (
                  <option key={r} value={r}>
                    {RESULTADO_INFO[r].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input
            value={acao}
            onChange={(e) => setAcao(e.target.value)}
            placeholder="O que foi feito (opcional)"
            className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
          />
          <div className="mt-2 flex justify-end">
            <Button variant="secondary" disabled={salvando} onClick={() => void registrar()}>
              Registrar tentativa
            </Button>
          </div>
        </div>

        {/* linha do tempo */}
        {carregando ? (
          <p className="text-xs text-[var(--color-text-dim)]">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-text-dim)]">
            Nenhuma tentativa registrada ainda.
          </p>
        ) : (
          <ol className="space-y-2">
            {itens.map((t) => {
              const info = RESULTADO_INFO[t.resultado];
              return (
                <li
                  key={t.id}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{t.acao}</p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        background:
                          info.tone === "success"
                            ? "rgba(34,197,94,.16)"
                            : info.tone === "danger"
                              ? "rgba(244,63,94,.16)"
                              : info.tone === "warn"
                                ? "rgba(245,158,11,.16)"
                                : "rgba(148,163,184,.16)",
                        color:
                          info.tone === "success"
                            ? "#6ee7b7"
                            : info.tone === "danger"
                              ? "#fda4af"
                              : info.tone === "warn"
                                ? "#fcd34d"
                                : "#cbd5e1",
                      }}
                    >
                      {info.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
                    {CANAL_INFO[t.canal].label} · {dataHora(t.criadoEm)} · {desde(t.criadoEm)}
                    {t.usuarioEmail ? ` · ${t.usuarioEmail}` : ""}
                    {t.automatica ? " · registrada pelo sistema" : ""}
                  </p>
                  {t.observacao && (
                    <p className="mt-1 text-[11px] text-[var(--color-text)]">{t.observacao}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Modal>
  );
}
