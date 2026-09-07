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
   * A regra é estreita por dois lados. Primeiro, só vale quando `observacoes`
   * está no formato que a própria ingestão escreve (`Mensagem: “…”`) — anotação
   * digitada por consultor nunca tem esse formato. Segundo, o resgate é pulado
   * quando aquele mesmo texto já aparece como fala do cliente, para lead novo
   * (que já grava o texto no evento) não mostrar a primeira mensagem duas vezes.
   *
   * A condição NÃO pode ser "não existe nenhuma fala do cliente": no lead
   * antigo que recebeu mensagens depois do deploy, as seguintes existem e a
   * primeira continuaria sumida — foi exatamente o que o teste mostrou.
   */
  const resgatada = textoDaFala(lead.observacoes);
  const jaApareceu = resgatada.texto
    ? falas.some((f) => f.quem === "cliente" && f.texto === resgatada.texto)
    : true;
  if (!jaApareceu) {
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

/** A origem é de anúncio pago? Vale para o destaque visual do selo. */
export const origemDeAnuncio = (origem?: string) => !!origem && origem.startsWith("Meta Ads");

/**
 * O rótulo do selo de origem.
 *
 * "Click-to-WhatsApp" só quando FOI Click-to-WhatsApp. Lead de formulário chega
 * como "Meta Ads · Instagram" e chamá-lo de Click-to-WhatsApp mentiria sobre o
 * caminho que trouxe o cliente — e é por esse caminho que se decide onde
 * investir.
 */
export function rotuloDaOrigem(origem?: string): string {
  if (!origem) return "";
  return origem.includes("Click-to-WhatsApp") ? "Meta Ads → Click-to-WhatsApp" : origem;
}

/* ------------------------------------------------------------------ atribuição */

export type Atribuicao = {
  campanha?: string;
  conjunto?: string;
  anuncio?: string;
  idAnuncio?: string;
  link?: string;
};

const CHAVE_DO_ROTULO: Record<string, keyof Atribuicao> = {
  Campanha: "campanha",
  Conjunto: "conjunto",
  "Anúncio": "anuncio",
  "ID do anúncio": "idAnuncio",
  Link: "link",
};

const RE_ROTULO = /^(Campanha|Conjunto|Anúncio|ID do anúncio|Link):\s*(.+)$/;

/**
 * De qual anúncio este cliente veio.
 *
 * A ingestão já grava isso em texto, tanto nas observações do lead quanto no
 * detalhe do evento — então não há consulta nova, nem coluna nova: é leitura do
 * que já está no CRM.
 *
 * O trecho entre aspas (`Mensagem: “…”`) é removido antes de procurar os
 * rótulos. Sem isso, um cliente que escrevesse uma linha começando com
 * "Anúncio:" apareceria como se fosse a campanha dele.
 *
 * NADA é inventado: campo que a Meta não mandou simplesmente não volta daqui.
 * No Click-to-WhatsApp a Meta manda só o anúncio (headline e id) — campanha e
 * conjunto não existem nesse caminho, e por isso não aparecem.
 */
export function atribuicao(lead: CentralLead, eventos: CentralLeadEvento[]): Atribuicao {
  const fontes = [lead.observacoes, ...eventos.map((e) => e.detalhe)].filter(
    (x): x is string => !!x,
  );
  const achado: Atribuicao = {};
  for (const fonte of fontes) {
    for (const linha of fonte.replace(RE_MENSAGEM, "").split("\n")) {
      const m = linha.trim().match(RE_ROTULO);
      if (!m) continue;
      const chave = CHAVE_DO_ROTULO[m[1]];
      if (chave && !achado[chave]) achado[chave] = m[2].trim();
    }
  }
  return achado;
}

/* ---------------------------------------------------------------- interesse */

const EMOJI_PRODUTO: Record<string, string> = {
  Carro: "🚗",
  Moto: "🏍️",
  "Imóvel": "🏠",
  "Caminhão": "🚚",
  "Maquinário": "🚜",
  "Energia Solar": "☀️",
  Investimento: "💰",
};

/** Só ilustra o produto que o CRM já identificou — não identifica nada. */
export const emojiDoProduto = (p?: string) => (p && EMOJI_PRODUTO[p]) || "🎯";

/* ------------------------------------------------------------- próxima ação */

export type ProximaAcao = {
  titulo: string;
  detalhe: string;
  /** Sugere ligar? Só então os atalhos de contato aparecem. */
  contato: boolean;
};

/**
 * O que fazer agora, deduzido dos estados que a Central JÁ tem.
 *
 * Não existe fluxo novo aqui: nenhum estado é criado, nenhum é gravado. É uma
 * leitura de `status` e dos marcos (`ligacaoIniciadaEm`, `atendidoEm`) para
 * dizer em uma frase o que o consultor deveria fazer em seguida.
 */
export function proximaAcao(lead: CentralLead): ProximaAcao {
  if (lead.status === "convertido")
    return {
      titulo: "Já virou negócio",
      detalhe: "O acompanhamento deste cliente continua no Pipeline.",
      contato: false,
    };
  if (lead.status === "perdido")
    return {
      titulo: "Atendimento encerrado",
      detalhe: lead.motivoPerda ? `Motivo: ${lead.motivoPerda}` : "Lead marcado como perdido.",
      contato: false,
    };
  if (!lead.vendedorId)
    return {
      titulo: "Distribuir para um consultor",
      detalhe: "Ninguém foi designado ainda — e o cliente já mandou mensagem.",
      contato: false,
    };
  if (lead.status === "nao_atendeu")
    return {
      titulo: "Tentar de novo",
      detalhe: "A última tentativa não foi atendida. Mandar mensagem costuma funcionar melhor que insistir na ligação.",
      contato: true,
    };
  if (lead.status === "aguardando_resposta")
    return {
      titulo: "Aguardando o cliente responder",
      detalhe: "A bola está com o cliente. Se demorar, retome pela última mensagem dele.",
      contato: true,
    };
  if (lead.status === "em_atendimento")
    return {
      titulo: "Retomar a conversa",
      detalhe: "Atendimento em andamento — responda a última mensagem do cliente.",
      contato: true,
    };
  if (lead.ligacaoIniciadaEm && !lead.atendidoEm)
    return {
      titulo: "Registrar o resultado da ligação",
      detalhe: "A ligação foi iniciada e ainda não tem desfecho marcado no card.",
      contato: true,
    };
  return {
    titulo: "Entrar em contato com o cliente",
    detalhe: "Lead novo e ainda sem contato registrado.",
    contato: true,
  };
}
