"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Sparkles,
} from "lucide-react";

import {
  atribuicao,
  emojiDoProduto,
  montarConversa,
  origemDeAnuncio,
  rotuloDaOrigem,
  proximaAcao,
  type Fala,
} from "@/lib/conversa";
import type { CentralLead, CentralLeadEvento } from "@/lib/types";

/**
 * FICHA DO LEAD — leitura da conversa.
 *
 * Só apresentação: recebe o lead e os eventos que a Central já carrega e os
 * organiza para o consultor entender o cliente em segundos. Não grava, não
 * consulta e não decide nada.
 *
 * A ordem segue as perguntas do consultor: quem é, de onde veio, o que quer,
 * O QUE ELE ACABOU DE ESCREVER, e o que eu faço agora. Só depois vem a conversa
 * inteira e os dados de cadastro.
 */

const fmtData = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const fmtHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDataHora = (iso?: string) => (iso ? `${fmtData(iso)} · ${fmtHora(iso)}` : "—");
/** Para os indicadores: sem o ano, para caber em celular sem virar reticências. */
const fmtCurto = (iso?: string) =>
  iso
    ? `${new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${fmtHora(iso)}`
    : "—";

/** Iniciais para o avatar — duas letras bastam e cabem sempre. */
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase() || "?";
}

/** Mensagem longa não é cortada: fica recolhida com o texto inteiro atrás de um clique. */
function Texto({ children }: { children: string }) {
  const [aberto, setAberto] = useState(false);
  const longo = children.length > 600;
  return (
    <>
      <p
        className="whitespace-pre-wrap break-words text-sm leading-relaxed"
        style={
          longo && !aberto
            ? { display: "-webkit-box", WebkitLineClamp: 8, WebkitBoxOrient: "vertical", overflow: "hidden" }
            : undefined
        }
      >
        {children}
      </p>
      {longo && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="mt-1 text-[11px] font-semibold text-[var(--color-brand)] hover:underline"
        >
          {aberto ? "mostrar menos" : "ler mensagem inteira"}
        </button>
      )}
    </>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        {rotulo}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold">{valor}</p>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
      {children}
    </h4>
  );
}

/** Linha rótulo → valor da atribuição do anúncio. */
function LinhaOrigem({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0 text-[var(--color-text-dim)]">{rotulo}:</dt>
      <dd className={`min-w-0 break-words font-medium ${mono ? "font-mono text-[11px]" : ""}`}>
        {valor}
      </dd>
    </div>
  );
}

/** Uma fala na conversa. Cliente à esquerda, LB à direita, sistema no meio. */
function Balao({ fala, destaque }: { fala: Fala; destaque: boolean }) {
  if (fala.quem === "sistema") {
    return (
      <li className="flex items-center gap-3 py-0.5">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        {/*
          Sem `min-w-0` (e com `shrink-0`) o texto do evento não quebrava e
          vazava pela direita no celular — o fim da frase ficava fora da tela.
        */}
        <span className="min-w-0 text-center text-[11px] text-[var(--color-text-dim)]">
          {fala.rotulo}
          {fala.texto ? ` — ${fala.texto}` : ""} · {fmtHora(fala.em)}
        </span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </li>
    );
  }

  const daLb = fala.quem === "lb";
  return (
    <li className={`flex ${daLb ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[86%] sm:max-w-[75%]">
        <p
          className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${
            daLb ? "text-right text-[var(--color-brand)]" : "text-[var(--color-text-dim)]"
          }`}
        >
          {fala.rotulo}
          {fala.autor && daLb ? ` · ${fala.autor}` : ""}
        </p>
        <div
          className={`rounded-2xl border px-3.5 py-2.5 ${
            daLb
              ? "rounded-tr-sm border-[var(--color-brand)]/35 bg-[var(--color-brand)]/12"
              : "rounded-tl-sm border-[var(--color-border)] bg-[var(--color-surface-2)]/70"
          } ${destaque ? "ring-2 ring-[var(--color-success,#22c55e)]/45" : ""}`}
        >
          <Texto>{fala.texto}</Texto>
          {fala.extras.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-[var(--color-border)] pt-2">
              {fala.extras.map((e) => (
                <li key={e} className="break-words text-[11px] text-[var(--color-text-dim)]">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className={`mt-1 text-[10px] text-[var(--color-text-dim)] ${daLb ? "text-right" : ""}`}>
          {fmtDataHora(fala.em)}
        </p>
      </div>
    </li>
  );
}

export function FichaConversa({
  lead,
  eventos,
  consultor,
  status,
  prioridade,
  whatsappUrl,
  telefoneUrl,
}: {
  lead: CentralLead;
  eventos: CentralLeadEvento[] | null;
  consultor: string;
  status: string;
  prioridade: string;
  /** Os MESMOS atalhos do card. Nenhum fluxo novo — só ficam à mão aqui também. */
  whatsappUrl?: string;
  telefoneUrl?: string;
}) {
  const lista = eventos ?? [];
  const conversa = montarConversa(lead, lista);
  const anuncio = origemDeAnuncio(lead.origem);
  const origem = atribuicao(lead, lista);
  const acao = proximaAcao(lead);
  const temAtribuicao = !!(origem.campanha || origem.conjunto || origem.anuncio || origem.idAnuncio);

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------- quem é o cliente */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--color-brand)]/15 text-base font-bold text-[var(--color-brand)]">
            {iniciais(lead.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-lg font-semibold leading-tight">{lead.nome}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-dim)]">
              {lead.telefone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {lead.telefone}
                </span>
              )}
              {lead.cidade && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {lead.cidade}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {consultor}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Dado rotulo="Primeiro contato" valor={fmtCurto(conversa.primeiroContatoEm ?? undefined)} />
          <Dado rotulo="Última mensagem" valor={fmtCurto(conversa.ultimaMensagemEm ?? undefined)} />
          <Dado
            rotulo="Mensagens"
            valor={conversa.total === 1 ? "1 mensagem" : `${conversa.total} mensagens`}
          />
          <Dado rotulo="Status" valor={status} />
        </div>
      </section>

      {/* --------------------------------------------------------- de onde veio */}
      {lead.origem && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
          <Titulo>De onde veio</Titulo>
          <p
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              anuncio
                ? "bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                : "bg-[var(--color-surface-2)] text-[var(--color-text-dim)]"
            }`}
          >
            {anuncio && <Sparkles className="h-3.5 w-3.5" />}
            {rotuloDaOrigem(lead.origem)}
          </p>

          {/*
            Só sai o que a Meta mandou. No Click-to-WhatsApp ela envia apenas o
            anúncio (título e id) — campanha e conjunto não existem nesse
            caminho, e por isso não aparecem. Nada é deduzido nem preenchido.
          */}
          {temAtribuicao && (
            <dl className="mt-3 space-y-1.5 border-t border-[var(--color-border)] pt-3 text-xs">
              {origem.campanha && <LinhaOrigem rotulo="Campanha" valor={origem.campanha} />}
              {origem.conjunto && (
                <LinhaOrigem rotulo="Conjunto de anúncios" valor={origem.conjunto} />
              )}
              {origem.anuncio && <LinhaOrigem rotulo="Anúncio" valor={origem.anuncio} />}
              {origem.idAnuncio && <LinhaOrigem rotulo="ID do anúncio" valor={origem.idAnuncio} mono />}
            </dl>
          )}
        </section>
      )}

      {/* ---------------------------------- interesse que o CRM já identificou */}
      {lead.produto && (
        <section className="rounded-2xl border border-[var(--color-success,#22c55e)]/35 bg-[var(--color-success,#22c55e)]/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-success,#22c55e)]">
            🎯 Interesse do cliente
          </p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-2xl font-bold leading-none">
              <span className="mr-2">{emojiDoProduto(lead.produto)}</span>
              {lead.produto.toUpperCase()}
            </p>
            {lead.subproduto && (
              <span className="text-sm text-[var(--color-text-dim)]">{lead.subproduto}</span>
            )}
          </div>
          {lead.faixaCredito && (
            <p className="mt-1.5 text-xs text-[var(--color-text-dim)]">
              Faixa de crédito: <span className="font-medium">{lead.faixaCredito}</span>
            </p>
          )}
        </section>
      )}

      {/* --------------------------------- o que precisa de resposta AGORA */}
      {conversa.ultima && (
        <section className="rounded-2xl border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/8 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
              <MessageSquare className="h-3.5 w-3.5" /> Última mensagem do cliente
            </p>
            <p className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
              <Clock className="h-3 w-3" /> {fmtDataHora(conversa.ultima.em)}
            </p>
          </div>
          {/* Sem recolher: é a frase que decide como o consultor vai abordar. */}
          <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
            {conversa.ultima.texto}
          </p>
        </section>
      )}

      {/* ------------------------------------------------------- próxima ação */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
        <Titulo>Próxima ação</Titulo>
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-brand)]/12 text-[var(--color-brand)]">
            {acao.contato ? <Phone className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{acao.titulo}</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">{acao.detalhe}</p>
          </div>
        </div>
        {/* Os mesmos atalhos do card — nenhum fluxo de atendimento novo. */}
        {acao.contato && (whatsappUrl || telefoneUrl) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            {telefoneUrl && (
              <a
                href={telefoneUrl}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-white/80 transition-colors hover:bg-white/[0.08]"
              >
                <Phone className="h-3.5 w-3.5" /> Discar
              </a>
            )}
          </div>
        )}
      </section>

      {/* --------------------------------------------- a conversa por inteiro */}
      <section>
        <Titulo>Conversa completa</Titulo>
        {eventos === null ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">Carregando…</p>
        ) : conversa.falas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-text-dim)]">
            Sem histórico registrado ainda.
          </p>
        ) : (
          <ol className="lb-scroll max-h-[60vh] space-y-3 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/25 p-4 pr-3">
            {conversa.falas.map((f) => (
              <Balao key={f.id} fala={f} destaque={f.id === conversa.ultima?.id} />
            ))}
          </ol>
        )}
      </section>

      {/* ------------------------------------------- dados que já apareciam */}
      <section>
        <Titulo>Dados do lead</Titulo>
        <dl className="grid gap-x-4 gap-y-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3 text-xs sm:grid-cols-2">
          {(
            [
              ["Cliente", lead.nome],
              ["Telefone", lead.telefone],
              ["Produto", lead.produto],
              ["Cidade", lead.cidade],
              ["Origem", lead.origem],
              ["Primeiro contato", fmtDataHora(conversa.primeiroContatoEm ?? undefined)],
              [
                "Última mensagem",
                conversa.ultimaMensagemEm ? fmtDataHora(conversa.ultimaMensagemEm) : undefined,
              ],
              ["Total de mensagens", String(conversa.total)],
              ["Status", status],
              ["Consultor", consultor],
              ["Prioridade (CRM)", prioridade],
              ["Subproduto", lead.subproduto],
              ["Faixa de crédito", lead.faixaCredito],
              ["Objetivo", lead.objetivo],
              ["Prazo (cliente)", lead.prazoInteresse],
            ] as [string, string | undefined][]
          ).map(([rot, val]) =>
            val ? (
              <div key={rot} className="flex min-w-0 gap-1.5">
                <dt className="shrink-0 text-[var(--color-text-dim)]">{rot}:</dt>
                <dd className="min-w-0 break-words font-medium">{val}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </section>

      {/* Respostas originais do formulário — sem interpretação, como já era */}
      <section>
        <Titulo>Informações do formulário</Titulo>
        {lead.formulario && lead.formulario.length > 0 ? (
          <dl className="space-y-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
            {lead.formulario.map((c, i) => (
              <div key={`${c.pergunta}-${i}`} className="min-w-0">
                <dt className="break-words text-[11px] text-[var(--color-text-dim)]">{c.pergunta}</dt>
                <dd className="break-words text-sm font-medium">{c.resposta}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-text-dim)]">
            Este lead não veio de formulário da Meta — veio pela conversa acima.
          </p>
        )}
      </section>

      {lead.observacoes && (
        <section>
          <Titulo>Observações</Titulo>
          <p className="whitespace-pre-wrap break-words rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3 text-xs leading-relaxed">
            {lead.observacoes}
          </p>
        </section>
      )}
    </div>
  );
}
