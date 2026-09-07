import type { CentralLead, CentralLeadEvento } from "./types";

/**
 * LEITURA DA CONVERSA — só apresentação.
 *
 * Nada aqui grava, consulta ou decide. Recebe os eventos que a Central já lê
 * hoje (`central_leads_eventos`) e os organiza como uma conversa, para o
 * consultor entender o cliente em segundos.
 *
 * A ingestão do WhatsApp, a anti-duplicação por telefone e a distribuição
 * continuam exatamente como estão — este arquivo nem as enxerga.
 */

export type Quem = "cliente" | "lb" | "sistema";

export type Fala = {
  id: string;
  quem: Quem;
  /** O que foi dito. Vazio em evento de sistema. */
  texto: string;
  /** Linhas que vieram junto da mensagem: anúncio, id do anúncio, link. */
  extras: string[];
  em: string;
  autor?: string;
  /** Rótulo legível — "Cliente", "Lead recebido", "Distribuído"… */
  rotulo: string;
};

/**
 * O texto que o cliente escreveu, de dentro do `detalhe` do evento.
 *
 * A ingestão grava `Mensagem: “texto”` e, quando veio de anúncio, acrescenta
 * linhas `Anúncio:`, `ID do anúncio:` e `Link:`. A captura é preguiçosa e para
 * na aspa que antecede uma dessas linhas (ou o fim) — assim mensagem com
 * quebra de linha dentro continua inteira, em vez de ser cortada na primeira.
 */
const RE_MENSAGEM = /Mensagem:\s*[“"]([\s\S]*?)[”"](?=\s*(?:\n(?:Anúncio|ID do anúncio|Link):|$))/;

const RE_EXTRA = /^(?:Anúncio|ID do anúncio|Link):\s*(.+)$/;

export function textoDaFala(detalhe?: string): { texto: string; extras: string[] } {
  if (!detalhe) return { texto: "", extras: [] };
  const m = detalhe.match(RE_MENSAGEM);
  const extras = detalhe
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => RE_EXTRA.test(l));
  if (m) return { texto: m[1].trim(), extras };
  // Mensagem sem texto digitado (áudio, imagem, botão) chega descrita em prosa:
  // continua sendo fala do cliente, só não tem aspas.
  return { texto: "", extras };
}

const ROTULO_SISTEMA: Record<string, string> = {
  criado: "Lead recebido",
  distribuido: "Distribuído",
  ligar: "Ligação iniciada",
  atendeu: "Cliente atendido",
  nao_atendeu: "Não atendeu",
  naoatendeu: "Não atendeu",
  perdido: "Marcado como perdido",
  convertido: "Convertido em negócio",
  prioridade: "Prioridade alterada",
  editado: "Atualização automática",
  observacao: "Anotação do consultor",
};

/** Evento que carrega mensagem do cliente: WhatsApp ou resposta de formulário. */
const doCanalDoCliente = (ev: CentralLeadEvento) =>
  ev.campo === "wamid" || ev.campo === "leadgen";

function paraFala(ev: CentralLeadEvento): Fala {
  const { texto, extras } = textoDaFala(ev.detalhe);
  const descricao = (ev.detalhe ?? "").split("\n")[0]?.trim() ?? "";

  // Cliente: veio pelo canal dele E tem conteúdo próprio. O evento de chegada
  // sem texto ("Lead recebido via WhatsApp") é marco do sistema, não fala.
  if (doCanalDoCliente(ev) && (texto || ev.tipo === "observacao")) {
    return {
      id: ev.id,
      quem: "cliente",
      texto: texto || descricao,
      extras,
      em: ev.criadoEm,
      autor: ev.autorNome,
      rotulo: "Cliente",
    };
  }

  // Mensagem que a LB mandou (o consultor registrou o envio).
  if (ev.tipo === "mensagem") {
    return {
      id: ev.id,
      quem: "lb",
      texto: texto || descricao,
      extras,
      em: ev.criadoEm,
      autor: ev.autorNome,
      rotulo: "LB Representações",
    };
  }

  return {
    id: ev.id,
    quem: "sistema",
    texto: descricao,
    extras,
    em: ev.criadoEm,
    autor: ev.autorNome,
    rotulo: ROTULO_SISTEMA[ev.tipo] ?? ev.tipo.replace(/_/g, " "),
  };
}

export type Conversa = {
  falas: Fala[];
  /** Só as do cliente, em ordem. */
  doCliente: Fala[];
  /** A que o consultor precisa responder. */
  ultima: Fala | null;
  primeiroContatoEm: string | null;
  ultimaMensagemEm: string | null;
  total: number;
};

export function montarConversa(lead: CentralLead, eventos: CentralLeadEvento[]): Conversa {
  const falas = eventos.map(paraFala);

  /*
   * LEAD ANTIGO — a primeira mensagem existe, só não está no evento.
   *
   * Antes de 07/09/2026 a ingestão gravava o evento de criação sem o texto
   * ("Lead recebido via WhatsApp") e a mensagem ficava apenas em `observacoes`.
   * O dado existe: é só mostrá-lo no lugar certo.
   *
   * A regra é estreita de propósito — só vale quando `observacoes` está no
   * formato que a própria ingestão escreve (`Mensagem: “…”`). Anotação digitada
   * por consultor nunca tem esse formato, então nunca é confundida com fala do
   * cliente.
   */
  const jaTemFalaDoCliente = falas.some((f) => f.quem === "cliente");
  const resgatada = textoDaFala(lead.observacoes);
  if (!jaTemFalaDoCliente && resgatada.texto) {
    const chegada = falas.findIndex((f) => f.rotulo === "Lead recebido");
    const fala: Fala = {
      id: `${lead.id}-primeira`,
      quem: "cliente",
      texto: resgatada.texto,
      extras: resgatada.extras,
      em: lead.recebidoEm,
      rotulo: "Cliente",
    };
    falas.splice(chegada >= 0 ? chegada + 1 : 0, 0, fala);
  }

  const doCliente = falas.filter((f) => f.quem === "cliente");
  return {
    falas,
    doCliente,
    ultima: doCliente.length ? doCliente[doCliente.length - 1] : null,
    primeiroContatoEm: doCliente[0]?.em ?? lead.recebidoEm ?? null,
    ultimaMensagemEm: doCliente.length ? doCliente[doCliente.length - 1].em : null,
    total: doCliente.length,
  };
}

/** A origem é de anúncio pago? Vale para o selo Meta Ads → Click-to-WhatsApp. */
export const origemDeAnuncio = (origem?: string) => !!origem && origem.startsWith("Meta Ads");
