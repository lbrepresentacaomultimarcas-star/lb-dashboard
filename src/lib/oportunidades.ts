// Central de Oportunidades — motor de análise 100% DERIVADO dos dados que o
// CRM já tem (leads: status, observação, datas). Não grava nada, não move
// cards, não altera o funil: apenas identifica oportunidades e sugere ações.

import type { Lead, LeadStatus } from "./types";

export type OportunidadePrioridade = 1 | 2 | 3; // 3 = mais urgente

export type Oportunidade = {
  lead: Lead;
  /** Motivo detectado (curto, com emoji 🟢). */
  motivo: string;
  /** Ação sugerida ao consultor. */
  sugestao: string;
  prioridade: OportunidadePrioridade;
  diasParado: number;
  /** Trecho da observação que gerou o gatilho (quando houver). */
  trecho?: string;
};

/** Dias parado aceitáveis por etapa — acima disso vira oportunidade.
 *  `null` = etapa fora da análise de "tempo parado" (fechamento sai da Central;
 *  perdido é tratado à parte, como recuperação). */
const LIMITE_DIAS: Record<LeadStatus, number | null> = {
  oportunidade: 5,
  primeiro_contato: 3,
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
  perdido: 6, // Perdidos (recuperação)
  fechamento: 99, // não entra na Central
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function diasDesde(iso: string | undefined, agora: Date): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - t) / 86400000));
}

type Gatilho = {
  regex: RegExp;
  motivo: string;
  sugestao: string;
  prioridade: OportunidadePrioridade;
};

/** Gatilhos por palavra-chave na observação do lead (acento-insensível). */
const GATILHOS: Gatilho[] = [
  {
    regex: /\bferias\b/,
    motivo: "🟢 Cliente aguardava férias",
    sugestao: "Confirmar se as férias saíram e retomar a conversa.",
    prioridade: 3,
  },
  {
    regex: /\bfgts\b/,
    motivo: "🟢 Cliente aguardava FGTS",
    sugestao: "Perguntar se o FGTS foi liberado e atualizar as condições.",
    prioridade: 3,
  },
  {
    regex: /\b(13o?|decimo terceiro)\b/,
    motivo: "🟢 Cliente aguardava 13º",
    sugestao: "Retomar contato — o 13º pode ter caído.",
    prioridade: 3,
  },
  {
    regex: /vender\s+(o\s+|a\s+)?(carro|veiculo|moto|caminhao|casa|imovel|terreno|apartamento)/,
    motivo: "🟢 Cliente aguardava vender um bem",
    sugestao: "Perguntar se conseguiu vender e reapresentar a proposta.",
    prioridade: 3,
  },
  {
    regex: /(pediu (retorno|pra ligar)|retornar|ligar (depois|semana|mes)|me chama|chamar (depois|semana))/,
    motivo: "🟢 Cliente pediu retorno",
    sugestao: "Fazer o follow-up combinado agora.",
    prioridade: 3,
  },
  {
    regex: /(mandei|enviei|passei|apresentei)\s+(a\s+)?proposta|proposta enviada/,
    motivo: "🟢 Proposta enviada sem retorno",
    sugestao: "Enviar proposta atualizada e reforçar a exclusividade da condição.",
    prioridade: 2,
  },
  {
    regex: /(vai pensar|ficou de (ver|pensar|responder)|analisando|avaliar)/,
    motivo: "🟢 Cliente ficou de responder",
    sugestao: "Agendar nova conversa e criar senso de urgência saudável.",
    prioridade: 2,
  },
];

/** Sugestão padrão por etapa quando o gatilho é só o tempo parado. */
const SUGESTAO_POR_STATUS: Partial<Record<LeadStatus, string>> = {
  oportunidade: "Fazer o primeiro contato antes que a oportunidade esfrie.",
  primeiro_contato: "Fazer follow-up e tentar agendar uma reunião.",
  reuniao_agendada: "Confirmar a reunião agendada com o cliente.",
  reuniao: "Enviar a proposta prometida — o cliente está esperando.",
  acompanhamento: "Retomar o acompanhamento e atualizar as condições.",
  fechamento: "Priorizar: negociação em fechamento parada — ligar hoje.",
};

/** Analisa os leads e devolve as oportunidades detectadas (mais urgentes
 *  primeiro). Função pura: mesma entrada → mesma saída. */
export function analisarOportunidades(leads: Lead[], agora: Date = new Date()): Oportunidade[] {
  const out: Oportunidade[] = [];

  for (const lead of leads) {
    // Cliente fechado sai da Central de Oportunidades.
    if (lead.status === "fechamento") continue;

    const diasParado = diasDesde(lead.atualizadoEm ?? lead.criadoEm, agora);

    // Perdidos entram apenas para RECUPERAÇÃO de oportunidade.
    if (lead.status === "perdido") {
      out.push({
        lead,
        motivo: "🟢 Recuperação de oportunidade",
        sugestao: "Reabrir a conversa com uma nova condição ou proposta atualizada.",
        prioridade: 1,
        diasParado,
      });
      continue;
    }

    const limite = LIMITE_DIAS[lead.status];
    if (limite === null) continue; // segurança (não deveria ocorrer aqui)
    const obs = norm(lead.observacao ?? "");

    // 1) Gatilhos por palavra-chave (o mais forte vence)
    let porTexto: Oportunidade | null = null;
    for (const g of GATILHOS) {
      const m = obs.match(g.regex);
      if (m && diasParado >= 1) {
        porTexto = {
          lead,
          motivo: g.motivo,
          sugestao: g.sugestao,
          prioridade: g.prioridade,
          diasParado,
          trecho: m[0],
        };
        break;
      }
    }

    // 2) Tempo parado além do aceitável pra etapa
    let porTempo: Oportunidade | null = null;
    if (diasParado >= limite) {
      const muitoParado = diasParado >= limite * 2;
      porTempo = {
        lead,
        motivo: muitoParado ? "🟢 Negociação parada" : "🟢 Hora de retomar contato",
        sugestao: SUGESTAO_POR_STATUS[lead.status] ?? "Fazer follow-up com o cliente.",
        prioridade: muitoParado ? 3 : 2,
        diasParado,
      };
    }

    // Escolhe o sinal mais relevante (texto explica melhor; tempo desempata)
    const escolhida = porTexto && porTempo
      ? (porTexto.prioridade >= porTempo.prioridade ? porTexto : { ...porTempo, trecho: porTexto.trecho })
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
