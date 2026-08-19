// Central de Oportunidades — motor de análise 100% DERIVADO dos dados que o
// CRM já tem (leads: status, observações carimbadas, datas). Não grava nada,
// não move cards, não altera o funil: apenas identifica oportunidades e
// sugere ações.
//
// CADA negócio é analisado INDIVIDUALMENTE:
//  • o histórico de observações é separado em entradas pelo carimbo
//    "[dd/mm/aaaa - hh:mm - Nome]" e os gatilhos rodam no TEXTO de cada
//    entrada (nunca no carimbo — era isso que fazia "13" de data/hora
//    disparar "Cliente aguardava 13º" em vários cards ao mesmo tempo);
//  • a entrada mais RECENTE manda; menção antiga (>60 dias) vira contexto
//    ("em conversa mais antiga") em vez de certeza;
//  • diagnóstico e recomendação são montados com os dados DAQUELE lead
//    (nome, datas, dias parado, valor, tipo, etapa) com redação variada por
//    lead — dois cards nunca saem com o mesmo texto por acaso;
//  • sem informação suficiente, o motor diz isso com todas as letras em vez
//    de inventar.

import type { Lead, LeadStatus } from "./types";
import { LEAD_STATUS_INFO, LEAD_TIPO_INFO } from "./types";

export type OportunidadePrioridade = 1 | 2 | 3; // 3 = mais urgente

export type Oportunidade = {
  lead: Lead;
  /** Motivo detectado (curto, com emoji 🟢 — título do card). */
  motivo: string;
  /** Diagnóstico EXCLUSIVO do negócio (frase completa, dados reais). */
  diagnostico: string;
  /** Ação sugerida ao consultor (única por card). */
  sugestao: string;
  prioridade: OportunidadePrioridade;
  diasParado: number;
  /** Trecho da observação DESTE lead que gerou o gatilho (quando houver). */
  trecho?: string;
  /** true = não havia observação útil; a recomendação usa só etapa + tempo. */
  baseLimitada?: boolean;
};

/** Dias parado aceitáveis por etapa — acima disso vira oportunidade.
 *  `null` = etapa fora da análise de "tempo parado" (fechamento sai da Central;
 *  perdido é tratado à parte, como recuperação). Exportado: a IA de risco usa
 *  exatamente a mesma régua. */
export const LIMITE_DIAS: Record<LeadStatus, number | null> = {
  oportunidade: 5,
  primeiro_contato: 3,
  nao_responde: 3, // silêncio de 3+ dias já pede uma nova tentativa
  reuniao_agendada: 3,
  reuniao: 4, // "Fazer e passar proposta"
  acompanhamento: 7,
  fechamento: null, // cliente FECHADO não aparece na Central
  perdido: null, // tratado como recuperação (ver abaixo)
};

/** Ordem de prioridade comercial da LB (1 = topo da lista). */
const ETAPA_PRIORIDADE: Record<LeadStatus, number> = {
  reuniao: 1, // Fazer proposta
  acompanhamento: 2, // Acompanhamento para fechar
  reuniao_agendada: 3, // Reunião agendada
  primeiro_contato: 4, // Primeiro contato
  oportunidade: 5, // Oportunidade
  nao_responde: 5.5, // Não responde (entra antes dos perdidos)
  perdido: 6, // Perdidos (recuperação)
  fechamento: 99, // não entra na Central
};

/* ------------------------------ util de texto ------------------------------ */

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function diasDesde(iso: string | undefined, agora: Date): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - t) / 86400000));
}

function diasDesdeData(d: Date | null, agora: Date): number | null {
  if (!d) return null;
  return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86400000));
}

const ddmm = (d: Date | null) =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : null;

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Seed determinístico por lead: cada card ganha SUA redação (e ela evolui
 *  com o passar dos dias) — nunca a mesma frase copiada em todos. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Mesma semântica do `variar` da Análise Comercial (local pra manter este
 *  módulo puro/sem dependências além de types). */
const escolher = (opcoes: string[], seed: number) => opcoes[Math.abs(seed) % opcoes.length];

/* -------------------- histórico de observações carimbadas ------------------- */

type EntradaHistorico = {
  data: Date | null; // null = texto legado sem carimbo
  autor: string | null;
  texto: string; // SÓ o texto da anotação (sem carimbo)
};

const RE_CARIMBO = /\[(\d{2})\/(\d{2})\/(\d{4}) - (\d{2}):(\d{2}) - ([^\]]+)\]/g;

/** Divide a observação acumulada em entradas individuais pelo carimbo
 *  "[dd/mm/aaaa - hh:mm - Nome]". Mais recente primeiro. */
export function parsearHistorico(observacao: string | undefined): EntradaHistorico[] {
  const bruto = (observacao ?? "").trim();
  if (!bruto) return [];
  const marcas: { idx: number; fim: number; data: Date; autor: string }[] = [];
  const re = new RegExp(RE_CARIMBO.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(bruto)) !== null) {
    marcas.push({
      idx: m.index,
      fim: m.index + m[0].length,
      data: new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])),
      autor: m[6].trim(),
    });
  }
  if (marcas.length === 0) return [{ data: null, autor: null, texto: bruto }];

  const entradas: EntradaHistorico[] = [];
  for (let i = 0; i < marcas.length; i++) {
    const fimTexto = i + 1 < marcas.length ? marcas[i + 1].idx : bruto.length;
    const texto = bruto.slice(marcas[i].fim, fimTexto).trim();
    if (texto) entradas.push({ data: marcas[i].data, autor: marcas[i].autor, texto });
  }
  // Texto anterior ao primeiro carimbo = anotação legada (a mais antiga).
  const legado = bruto.slice(0, marcas[0].idx).trim();
  if (legado) entradas.push({ data: null, autor: null, texto: legado });

  // Mais recente primeiro (entradas sem data vão pro fim).
  return entradas.sort(
    (a, b) => (b.data?.getTime() ?? -Infinity) - (a.data?.getTime() ?? -Infinity),
  );
}

/* --------------------------------- gatilhos --------------------------------- */

/** "13" só conta como 13º salário com ORDINAL explícito (13º/13o/décimo
 *  terceiro) ou com verbo de espera na MESMA frase — e nunca colado em
 *  dígitos, "/" ou ":" (datas, horas e valores não disparam mais). */
function detecta13(textoNorm: string): string | null {
  // Obs.: \b não funciona após "º" (não é caractere de palavra em JS) — por
  // isso o fim do ordinal usa lookahead negativo em vez de \b.
  const ordinal = textoNorm.match(/\b13\s?[ºo°](?![a-z0-9])|decimo\s+terceiro|\b13\s?salario\b/);
  if (ordinal) return ordinal[0];
  for (const frase of textoNorm.split(/[.;\n!?]+/)) {
    if (!/(aguard|esper|receb|cair|sair|apos o|depois do)/.test(frase)) continue;
    const solto = frase.match(/(?:^|[^\d.,:/])(13)(?:$|[^\d.,:/ºo°])/);
    if (solto) return "13";
  }
  return null;
}

type Ctx = {
  nome: string; // primeiro nome do cliente
  dias: number; // dias parado (última movimentação)
  diasAnot: number | null; // dias desde a anotação que casou o gatilho
  data: string | null; // "dd/mm" da anotação que casou
  valor: string | null; // BRL ou null quando 0
  etapa: string;
  tipo: string | null; // "Imóvel", "Carro"…
  antiga: boolean; // anotação com mais de 60 dias
};

type Gatilho = {
  id: string;
  detectar: (textoNorm: string) => string | null; // trecho casado ou null
  motivo: string;
  /** Como citar o assunto numa frase ("o 13º", "o FGTS", "a proposta enviada"). */
  rotulo: string;
  prioridade: OportunidadePrioridade;
  diagnosticos: (c: Ctx) => string[];
  sugestoes: (c: Ctx) => string[];
};

const qd = (c: Ctx) => (c.data ? `em ${c.data}` : "na última anotação");
const haDias = (n: number | null) => (n == null ? "" : n === 0 ? " (hoje)" : ` (há ${n} dia${n === 1 ? "" : "s"})`);
const doValor = (c: Ctx) => (c.valor ? ` — negócio de ${c.valor}` : "");
const doTipo = (c: Ctx) => (c.tipo ? ` de ${c.tipo}` : "");

const GATILHOS: Gatilho[] = [
  {
    id: "ferias",
    rotulo: "as férias",
    detectar: (t) => t.match(/\bferias\b/)?.[0] ?? null,
    motivo: "🟢 Cliente aguardava férias",
    prioridade: 3,
    diagnosticos: (c) => [
      `${c.nome} disse ${qd(c)}${haDias(c.diasAnot)} que aguardava as férias${doValor(c)}.`,
      `Anotação ${qd(c)}: cliente esperando as férias saírem. Sem retorno desde então${haDias(c.diasAnot)}.`,
      `${c.nome} condicionou a decisão às férias (registro ${qd(c)}); o negócio${doTipo(c)} segue parado há ${c.dias} dias.`,
    ],
    sugestoes: (c) => [
      `Ligar hoje pra ${c.nome} e confirmar se as férias já saíram — se sim, retomar a proposta.`,
      `Chamar ${c.nome} no WhatsApp perguntando das férias e já oferecer horário pra fechar.`,
      `Confirmar com ${c.nome} se as férias caíram e atualizar as condições${doValor(c)}.`,
    ],
  },
  {
    id: "fgts",
    rotulo: "o FGTS",
    detectar: (t) => t.match(/\bfgts\b/)?.[0] ?? null,
    motivo: "🟢 Cliente aguardava FGTS",
    prioridade: 3,
    diagnosticos: (c) => [
      `${c.nome} aguardava a liberação do FGTS (anotado ${qd(c)}${haDias(c.diasAnot)})${doValor(c)}.`,
      `Registro ${qd(c)}: decisão dependia do FGTS. Nada foi atualizado desde então.`,
      `O FGTS era a condição de ${c.nome} pra avançar (${qd(c)}); ${c.dias} dias parado desde a última movimentação.`,
    ],
    sugestoes: (c) => [
      `Perguntar a ${c.nome} se o FGTS foi liberado e reapresentar a proposta no mesmo contato.`,
      `Ligar hoje: se o FGTS caiu, ${c.nome} tem a entrada na mão — hora de fechar.`,
      `Mandar mensagem pra ${c.nome} confirmando o FGTS e já sugerir a próxima parcela de lance.`,
    ],
  },
  {
    id: "decimo",
    rotulo: "o 13º",
    detectar: detecta13,
    motivo: "🟢 Cliente aguardava 13º",
    prioridade: 3,
    diagnosticos: (c) => [
      `${c.nome} disse ${qd(c)}${haDias(c.diasAnot)} que esperava o 13º pra decidir${doValor(c)}.`,
      `Anotação ${qd(c)}: cliente aguardando o 13º. O negócio${doTipo(c)} está há ${c.dias} dias sem movimentação.`,
      `Registro ${qd(c)} aponta o 13º como condição de ${c.nome}; sem contato desde então${haDias(c.diasAnot)}.`,
    ],
    sugestoes: (c) => [
      `Ligar hoje pra ${c.nome} e perguntar se o 13º caiu — retomar a proposta na sequência.`,
      `Chamar ${c.nome} no WhatsApp: se o 13º entrou, apresentar de novo as condições${doValor(c)}.`,
      `Retomar com ${c.nome} agora e usar o 13º como gancho pra fechar ainda esta semana.`,
    ],
  },
  {
    id: "vender_bem",
    rotulo: "a venda de um bem",
    detectar: (t) =>
      t.match(/vender\s+(?:o\s+|a\s+)?(?:carro|veiculo|moto|caminhao|casa|imovel|terreno|apartamento)/)?.[0] ?? null,
    motivo: "🟢 Cliente aguardava vender um bem",
    prioridade: 3,
    diagnosticos: (c) => [
      `${c.nome} precisava vender um bem antes de fechar (anotado ${qd(c)}${haDias(c.diasAnot)}).`,
      `Registro ${qd(c)}: a decisão dependia da venda de um bem. ${c.dias} dias parado desde a última movimentação.`,
      `A condição de ${c.nome} era vender um bem (${qd(c)}); nenhuma atualização desde então.`,
    ],
    sugestoes: (c) => [
      `Perguntar a ${c.nome} se conseguiu vender — e reapresentar a proposta atualizada.`,
      `Ligar hoje: se a venda saiu, ${c.nome} tem o valor da entrada; se não, oferecer plano com lance menor.`,
      `Chamar ${c.nome} e sugerir alternativa sem depender da venda (parcela que caiba agora).`,
    ],
  },
  {
    id: "retorno",
    rotulo: "o retorno combinado",
    detectar: (t) =>
      t.match(/pediu (?:retorno|pra ligar)|retornar|ligar (?:depois|semana|mes)|me chama|chamar (?:depois|semana)/)?.[0] ?? null,
    motivo: "🟢 Cliente pediu retorno",
    prioridade: 3,
    diagnosticos: (c) => [
      `${c.nome} pediu retorno (combinado ${qd(c)}${haDias(c.diasAnot)}) e o contato ainda não aconteceu.`,
      `Anotação ${qd(c)}: ficou combinado retornar. Já se passaram ${c.diasAnot ?? c.dias} dia${(c.diasAnot ?? c.dias) === 1 ? "" : "s"}.`,
      `Follow-up prometido a ${c.nome} ${qd(c)} segue pendente${doValor(c)}.`,
    ],
    sugestoes: (c) => [
      `Fazer HOJE o retorno combinado com ${c.nome} — atraso aqui esfria a confiança.`,
      `Ligar pra ${c.nome} agora cumprindo o combinado e já propor o próximo passo.`,
      `Cumprir o follow-up com ${c.nome} hoje e registrar o resultado na observação.`,
    ],
  },
  {
    id: "proposta",
    rotulo: "a proposta enviada",
    detectar: (t) =>
      t.match(/(?:mandei|enviei|passei|apresentei)\s+(?:a\s+)?proposta|proposta enviada/)?.[0] ?? null,
    motivo: "🟢 Proposta enviada sem retorno",
    prioridade: 2,
    diagnosticos: (c) => [
      `${c.nome} recebeu a proposta ${qd(c)}${haDias(c.diasAnot)} e ainda não respondeu.`,
      `Proposta apresentada ${qd(c)}; sem resposta de ${c.nome} desde então${doValor(c)}.`,
      `A proposta${doTipo(c)} está na mão de ${c.nome} desde ${c.data ?? "a última anotação"} — ${c.diasAnot ?? c.dias} dia${(c.diasAnot ?? c.dias) === 1 ? "" : "s"} sem retorno.`,
    ],
    sugestoes: (c) => [
      `Perguntar a ${c.nome} o que achou da proposta e tratar a objeção na hora.`,
      `Reenviar a proposta atualizada pra ${c.nome} com um resumo dos benefícios e pedir um sim/não.`,
      `Ligar pra ${c.nome}: proposta parada${haDias(c.diasAnot)} — oferecer revisão de valor ou prazo.`,
    ],
  },
  {
    id: "pensar",
    rotulo: "que ficou de responder",
    detectar: (t) => t.match(/vai pensar|ficou de (?:ver|pensar|responder)|analisando|avaliar/)?.[0] ?? null,
    motivo: "🟢 Cliente ficou de responder",
    prioridade: 2,
    diagnosticos: (c) => [
      `${c.nome} ficou de responder (anotado ${qd(c)}${haDias(c.diasAnot)}) e o prazo já passou do razoável.`,
      `Registro ${qd(c)}: cliente analisando. ${c.dias} dias parado — o "vou pensar" esfriou.`,
      `${c.nome} pediu um tempo pra avaliar ${qd(c)}; sem resposta desde então${doValor(c)}.`,
    ],
    sugestoes: (c) => [
      `Confirmar o interesse de ${c.nome} com uma pergunta direta e um benefício novo.`,
      `Ligar pra ${c.nome} e criar urgência saudável (condição da campanha, vaga no grupo).`,
      `Agendar conversa curta com ${c.nome} pra resolver as dúvidas que travaram a decisão.`,
    ],
  },
  {
    id: "conjuge",
    rotulo: "a decisão junto com o cônjuge",
    detectar: (t) => t.match(/\b(?:conjuge|esposa|esposo|marido|mulher)\b/)?.[0] ?? null,
    motivo: "🟢 Decisão depende do cônjuge",
    prioridade: 2,
    diagnosticos: (c) => [
      `${c.nome} informou ${qd(c)} que a decisão depende do cônjuge.`,
      `Anotação ${qd(c)}: falta o aval do cônjuge de ${c.nome} pra avançar${doValor(c)}.`,
      `A negociação com ${c.nome} aguarda conversa com o cônjuge desde ${c.data ?? "a última anotação"}.`,
    ],
    sugestoes: (c) => [
      `Propor uma conversa com ${c.nome} e o cônjuge juntos (presencial ou vídeo) pra decidir em conjunto.`,
      `Enviar material resumido pra ${c.nome} mostrar em casa — e agendar retorno pro dia seguinte.`,
      `Oferecer simulação em dupla titularidade e marcar horário com os dois.`,
    ],
  },
  {
    id: "aprovacao",
    rotulo: "a aprovação financeira",
    detectar: (t) =>
      t.match(/aprovacao|analise de credito|analise financeira|aguardando (?:o )?banco|liberacao do credito/)?.[0] ?? null,
    motivo: "🟢 Aguardando aprovação financeira",
    prioridade: 2,
    diagnosticos: (c) => [
      `${c.nome} aguarda aprovação financeira (registro ${qd(c)}${haDias(c.diasAnot)}).`,
      `Anotação ${qd(c)}: análise/aprovação em andamento. Sem atualização há ${c.diasAnot ?? c.dias} dia${(c.diasAnot ?? c.dias) === 1 ? "" : "s"}.`,
      `A liberação financeira era o próximo passo de ${c.nome} (${qd(c)}); confira o status.`,
    ],
    sugestoes: (c) => [
      `Checar com ${c.nome} se a aprovação saiu — e destravar o que estiver faltando de documento.`,
      `Acompanhar a análise com ${c.nome} hoje; se negou, oferecer o consórcio como alternativa sem juros.`,
      `Ligar pra ${c.nome} e reforçar que no consórcio a aprovação é mais simples — retomar a proposta.`,
    ],
  },
  {
    id: "simulacao",
    rotulo: "uma nova simulação",
    detectar: (t) => t.match(/(?:nova|outra|refazer|atualizar)\s+simulacao|pediu (?:uma )?simulacao/)?.[0] ?? null,
    motivo: "🟢 Cliente pediu nova simulação",
    prioridade: 3,
    diagnosticos: (c) => [
      `${c.nome} pediu uma nova simulação ${qd(c)}${haDias(c.diasAnot)} e ainda não recebeu.`,
      `Registro ${qd(c)}: simulação solicitada por ${c.nome} — pendente até agora.`,
      `Há um pedido de simulação de ${c.nome} em aberto desde ${c.data ?? "a última anotação"}${doValor(c)}.`,
    ],
    sugestoes: (c) => [
      `Enviar a nova simulação pra ${c.nome} ainda hoje — pedido do cliente é prioridade.`,
      `Montar 2 cenários de simulação (crédito maior e parcela menor) e mandar pra ${c.nome} escolher.`,
      `Enviar a simulação atualizada e já propor call de 10 minutos pra fechar com ${c.nome}.`,
    ],
  },
];

/* --------------------------- frases de tempo parado -------------------------- */

const DIAG_TEMPO = (c: Ctx) => [
  `Lead sem movimentação há ${c.dias} dias na etapa ${c.etapa}.`,
  `${c.nome} está há ${c.dias} dias parado em ${c.etapa}${doValor(c)}.`,
  `Nenhuma atualização há ${c.dias} dias — negociação${doTipo(c)} esfriando na etapa ${c.etapa}.`,
];

const SUGESTAO_TEMPO: Record<string, (c: Ctx) => string[]> = {
  oportunidade: (c) => [
    `Fazer o primeiro contato com ${c.nome} hoje, antes que a oportunidade esfrie.`,
    `Ligar pra ${c.nome} e se apresentar — oportunidade parada há ${c.dias} dias.`,
    `Abrir conversa com ${c.nome} no WhatsApp e qualificar o interesse.`,
  ],
  primeiro_contato: (c) => [
    `Fazer follow-up com ${c.nome} e tentar agendar uma reunião.`,
    `Retomar o papo com ${c.nome} — segundo contato decide a maioria dos avanços.`,
    `Mandar mensagem pra ${c.nome} com um benefício concreto e propor reunião.`,
  ],
  reuniao_agendada: (c) => [
    `Confirmar a reunião com ${c.nome} (agendada e sem confirmação há ${c.dias} dias).`,
    `Reconfirmar dia e hora com ${c.nome} hoje — e ter um plano B de horário.`,
    `Enviar lembrete da reunião pra ${c.nome} com o que será apresentado.`,
  ],
  reuniao: (c) => [
    `Enviar a proposta prometida pra ${c.nome} — o cliente está esperando.`,
    `Fechar a proposta de ${c.nome} hoje${doValor(c)} e enviar com resumo claro.`,
    `Priorizar a proposta de ${c.nome}: cada dia sem enviar esfria a reunião feita.`,
  ],
  acompanhamento: (c) => [
    `Retomar o acompanhamento de ${c.nome} e atualizar as condições.`,
    `Ligar pra ${c.nome} com uma novidade real (resultado, condição, contemplação) pra reaquecer.`,
    `Rever a proposta de ${c.nome}${doValor(c)} e apresentar um ajuste que destrave.`,
  ],
};

const DIAG_PERDIDO = (c: Ctx) => [
  `Negócio marcado como perdido; sem contato há ${c.dias} dias${doValor(c)}.`,
  `${c.nome} saiu do funil há ${c.dias} dias — cenário pode ter mudado.`,
  `Perdido há ${c.dias} dias; vale um novo contato${doTipo(c)}.`,
];

const SUG_PERDIDO = (c: Ctx) => [
  `Recuperar a negociação: reabrir a conversa com ${c.nome} com uma condição nova.`,
  `Mandar mensagem leve pra ${c.nome} (novidade/resultado recente) e medir a reação.`,
  `Oferecer a ${c.nome} uma proposta reformulada — objeção antiga pode não existir mais.`,
];

// Strings EXATAS de validação (exibidas quando não há base suficiente):
export const SEM_INFO = "Sem informação suficiente para gerar um diagnóstico detalhado.";
export const NOTA_BASE_LIMITADA = "Recomendação baseada apenas na etapa atual e no tempo parado.";

/* --------------------------------- análise ---------------------------------- */

/** Analisa os leads e devolve as oportunidades detectadas (mais urgentes
 *  primeiro). Função pura: mesma entrada → mesma saída. */
export function analisarOportunidades(leads: Lead[], agora: Date = new Date()): Oportunidade[] {
  const out: Oportunidade[] = [];

  for (const lead of leads) {
    // Cliente fechado sai da Central de Oportunidades.
    if (lead.status === "fechamento") continue;

    const diasParado = diasDesde(lead.atualizadoEm ?? lead.criadoEm, agora);
    const historico = parsearHistorico(lead.observacao);
    const recente = historico[0] ?? null;

    const ctxBase: Omit<Ctx, "diasAnot" | "data" | "antiga"> = {
      nome: lead.nome.split(" ")[0],
      dias: diasParado,
      valor: lead.valorEstimado > 0 ? brl(lead.valorEstimado) : null,
      etapa: LEAD_STATUS_INFO[lead.status]?.label ?? lead.status,
      tipo: lead.tipo ? (LEAD_TIPO_INFO[lead.tipo]?.label ?? null) : null,
    };
    const seed = hashStr(lead.id) + diasParado;

    // Perdidos entram apenas para RECUPERAÇÃO de oportunidade.
    if (lead.status === "perdido") {
      const c: Ctx = { ...ctxBase, diasAnot: diasDesdeData(recente?.data ?? null, agora), data: ddmm(recente?.data ?? null), antiga: false };
      out.push({
        lead,
        motivo: "🟢 Recuperação de oportunidade",
        diagnostico: recente
          ? `${escolher(DIAG_PERDIDO(c), seed)} Último registro${c.data ? ` em ${c.data}` : ""}: “${recente.texto.slice(0, 90)}${recente.texto.length > 90 ? "…" : ""}”`
          : `${SEM_INFO} Negócio perdido há ${diasParado} dias.`,
        sugestao: escolher(SUG_PERDIDO(c), seed + 1),
        prioridade: 1,
        diasParado,
        baseLimitada: !recente,
      });
      continue;
    }

    const limite = LIMITE_DIAS[lead.status];
    if (limite === null) continue; // segurança (não deveria ocorrer aqui)

    // 1) Gatilhos — SÓ no texto das anotações DESTE lead (sem carimbos).
    //    A entrada mais recente vence; menção antiga vira contexto.
    let porTexto: Oportunidade | null = null;
    busca: for (const entrada of historico) {
      const textoNorm = norm(entrada.texto);
      for (const g of GATILHOS) {
        const trecho = g.detectar(textoNorm);
        if (!trecho || diasParado < 1) continue;
        const diasAnot = diasDesdeData(entrada.data, agora);
        const antiga = diasAnot != null && diasAnot > 60;
        const c: Ctx = { ...ctxBase, diasAnot, data: ddmm(entrada.data), antiga };
        const diagnostico = antiga
          ? `Em conversa mais antiga${c.data ? ` (${c.data})` : ""}, ${c.nome} mencionou ${g.rotulo} — o negócio segue parado há ${c.dias} dias. Confirme se essa condição ainda vale.`
          : escolher(g.diagnosticos(c), seed);
        porTexto = {
          lead,
          motivo: g.motivo,
          diagnostico,
          sugestao: escolher(g.sugestoes(c), seed + 1),
          prioridade: antiga ? (Math.max(2, g.prioridade - 1) as OportunidadePrioridade) : g.prioridade,
          diasParado,
          trecho,
        };
        break busca;
      }
    }

    // 2) Tempo parado além do aceitável pra etapa
    let porTempo: Oportunidade | null = null;
    if (diasParado >= limite) {
      const muitoParado = diasParado >= limite * 2;
      const diasAnot = diasDesdeData(recente?.data ?? null, agora);
      const c: Ctx = { ...ctxBase, diasAnot, data: ddmm(recente?.data ?? null), antiga: false };
      const temAnotacao = Boolean(recente);
      const diagBase = escolher(DIAG_TEMPO(c), seed);
      porTempo = {
        lead,
        motivo: muitoParado ? "🟢 Negociação parada" : "🟢 Hora de retomar contato",
        diagnostico: temAnotacao
          ? `${diagBase} Última anotação${c.data ? ` em ${c.data}` : ""}: “${recente!.texto.slice(0, 90)}${recente!.texto.length > 90 ? "…" : ""}”`
          : `${SEM_INFO} ${diagBase}`,
        sugestao: escolher((SUGESTAO_TEMPO[lead.status] ?? SUGESTAO_TEMPO.acompanhamento)(c), seed + 2),
        prioridade: muitoParado ? 3 : 2,
        diasParado,
        baseLimitada: !temAnotacao,
      };
    }

    // Escolhe o sinal mais relevante (texto explica melhor; tempo desempata)
    const escolhida =
      porTexto && porTempo
        ? porTexto.prioridade >= porTempo.prioridade
          ? porTexto
          : { ...porTempo, trecho: porTexto.trecho, diagnostico: porTexto.diagnostico, baseLimitada: false }
        : (porTexto ?? porTempo);
    if (escolhida) out.push(escolhida);
  }

  // Ordem: prioridade da ETAPA (regra LB) → urgência → dias parado → valor.
  return out.sort(
    (a, b) =>
      ETAPA_PRIORIDADE[a.lead.status] - ETAPA_PRIORIDADE[b.lead.status] ||
      b.prioridade - a.prioridade ||
      b.diasParado - a.diasParado ||
      b.lead.valorEstimado - a.lead.valorEstimado,
  );
}

/** Link do WhatsApp com mensagem pronta pro lead (null sem telefone). */
export function whatsappDoLead(lead: Lead): string | null {
  const digitos = (lead.telefone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  const msg = `Olá, ${lead.nome.split(" ")[0]}! Tudo bem? Aqui é da LB Representações. Podemos retomar nossa conversa?`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
}
