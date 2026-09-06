import type { IndicadoresBrutos } from "./performance";

/**
 * MAPA DE EVOLUÇÃO — a camada que INTERPRETA o que o CRM já mede.
 *
 * Não existe número novo aqui. Tudo entra pronto de `indicadoresDoVendedor`
 * (performance-extract), que por sua vez lê o funil e a movimentação real dos
 * cards. Este arquivo só responde três perguntas humanas:
 *
 *   o que está indo bem?   onde está travando?   e o que fazer agora?
 *
 * REGRA INEGOCIÁVEL: sem dado, sem conclusão.
 *
 * Um diagnóstico inventado é pior que nenhum — o consultor age em cima dele.
 * Por isso toda função aqui devolve `null`/vazio quando os números não
 * sustentam a afirmação, e existe `temDados` para a tela dizer "ainda não dá
 * para avaliar" em vez de encher a página de frase genérica.
 *
 * Função PURA: sem React, sem store, sem banco. É o que permite testar cada
 * conclusão isoladamente.
 */

export type Comparacao = {
  atual: IndicadoresBrutos;
  /** Ciclo anterior. `null` quando é o primeiro — aí não há "evolução". */
  anterior: IndicadoresBrutos | null;
};

export type Destaque = {
  chave: string;
  titulo: string;
  /** A frase que justifica — sempre ancorada num número real. */
  detalhe: string;
};

export type Gargalo = {
  chave: string;
  /** O que está acontecendo, em linguagem de desenvolvimento. */
  situacao: string;
  /** O que fazer a respeito. */
  foco: string;
};

/* --------------------------------- apoio ---------------------------------- */

const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0);
const cresceu = (a: number, b: number) => a > b && b >= 0;
const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

/** Há movimento suficiente para dizer qualquer coisa? */
export function temDados(c: Comparacao): boolean {
  const a = c.atual;
  return a.oportunidades > 0 || a.agendamentos > 0 || a.propostas > 0 || a.fechados > 0 || a.leadsAtivos > 0;
}

/* ------------------------------- destaques -------------------------------- */

/**
 * O que a pessoa está fazendo bem.
 *
 * Só entra o que os números sustentam. Uma tela que elogia sem base ensina o
 * consultor a ignorar a tela.
 */
export function destaques(c: Comparacao): Destaque[] {
  const { atual: a, anterior: b } = c;
  const out: Destaque[] = [];

  if (b && cresceu(a.agendamentos, b.agendamentos)) {
    out.push({
      chave: "agendamentos",
      titulo: "Agendamentos em alta",
      detalhe: `Você saiu de ${b.agendamentos} para ${a.agendamentos} agendamentos.`,
    });
  }
  if (b && cresceu(a.propostas, b.propostas)) {
    out.push({
      chave: "propostas",
      titulo: "Mais propostas na rua",
      detalhe: `Seu volume de propostas subiu de ${b.propostas} para ${a.propostas}.`,
    });
  }
  if (b && cresceu(a.fechados, b.fechados)) {
    out.push({
      chave: "fechamentos",
      titulo: "Fechando mais",
      detalhe: `Você fechou ${plural(a.fechados, "negócio", "negócios")}, contra ${b.fechados} no período anterior.`,
    });
  }
  if (b && cresceu(a.oportunidades, b.oportunidades)) {
    out.push({
      chave: "oportunidades",
      titulo: "Carteira em movimento",
      detalhe: `${a.oportunidades} oportunidades trabalhadas, contra ${b.oportunidades} antes.`,
    });
  }

  // Conversão só vira elogio com base mínima: 1 fechamento em 1 oportunidade
  // seria 100% e não diz nada sobre consistência.
  const conv = pct(a.fechados, a.oportunidades);
  if (a.oportunidades >= 5 && conv >= 20) {
    out.push({
      chave: "conversao",
      titulo: "Boa conversão",
      detalhe: `${conv.toFixed(0)}% das oportunidades que você trabalhou viraram fechamento.`,
    });
  }

  const frescor = pct(a.leadsAtualizados, a.leadsAtivos);
  if (a.leadsAtivos >= 5 && frescor >= 70) {
    out.push({
      chave: "acompanhamento",
      titulo: "Acompanhamento em dia",
      detalhe: `${frescor.toFixed(0)}% da sua carteira ativa teve movimento recente.`,
    });
  }

  return out;
}

/* -------------------------------- gargalo --------------------------------- */

/**
 * O PRINCIPAL ponto de atenção — um só.
 *
 * A ordem abaixo não é arbitrária: percorre o funil de trás para frente, do
 * problema mais caro para o mais barato. Cliente parado sem retorno é dinheiro
 * já gasto esfriando; falta de agendamento é o começo do funil e se resolve
 * com volume.
 *
 * Listar dez problemas paralisa. Um problema, com um foco, move.
 */
export function gargalo(c: Comparacao): Gargalo | null {
  const { atual: a, anterior: b } = c;
  if (!temDados(c)) return null;

  // 1) Carteira parada — o mais caro: cliente que já chegou e está esfriando.
  const parados = a.leadsAtivos - a.leadsAtualizados;
  if (a.leadsAtivos >= 5 && pct(parados, a.leadsAtivos) >= 50) {
    return {
      chave: "parados",
      situacao: `Você tem ${plural(parados, "cliente", "clientes")} da sua carteira sem movimento recente.`,
      foco: "Priorize quem está aguardando retorno antes de buscar cliente novo — esse já demonstrou interesse.",
    };
  }

  // 2) Proposta que não fecha.
  if (a.propostas >= 3 && a.fechados === 0) {
    return {
      chave: "proposta_sem_fechar",
      situacao: `Você apresentou ${a.propostas} propostas e ainda não converteu nenhuma neste período.`,
      foco: "Trabalhe a condução do fechamento: entenda a objeção real e volte com uma resposta.",
    };
  }
  if (a.propostas >= 4 && pct(a.fechados, a.propostas) < 25) {
    return {
      chave: "conversao_proposta",
      situacao: `De ${a.propostas} propostas, ${plural(a.fechados, "virou fechamento", "viraram fechamento")}.`,
      foco: "O cliente está ouvindo sua proposta. Falta conduzir até a decisão.",
    };
  }

  // 3) Agendou e não avançou.
  if (a.agendamentos >= 3 && a.propostas === 0) {
    return {
      chave: "agendou_sem_proposta",
      situacao: `Você fez ${a.agendamentos} agendamentos, mas nenhum virou proposta.`,
      foco: "Chegue na reunião com a proposta pronta para apresentar — o agendamento é meio, não fim.",
    };
  }

  // 4) Oportunidade que não vira agenda.
  if (a.oportunidades >= 5 && a.agendamentos === 0) {
    return {
      chave: "sem_agendar",
      situacao: `Você trabalhou ${a.oportunidades} oportunidades e não agendou nenhuma reunião.`,
      foco: "Todo contato deve terminar com um próximo passo marcado — dia e hora.",
    };
  }

  // 5) Ritmo caiu. Só se houver com o que comparar.
  if (b && b.oportunidades >= 3 && a.oportunidades < b.oportunidades * 0.6) {
    return {
      chave: "ritmo",
      situacao: `Seu volume caiu: ${a.oportunidades} oportunidades agora, contra ${b.oportunidades} no período anterior.`,
      foco: "Retomar o ritmo de contato. Constância pesa mais que picos.",
    };
  }

  return null;
}

/* ------------------------------- seu momento ------------------------------ */

/**
 * O parágrafo curto de conversa. Junta o que vai bem com o que trava.
 * Sem dado, diz isso — não enche linguiça.
 */
export function momento(c: Comparacao): string {
  if (!temDados(c)) {
    return "Ainda não há movimento suficiente no seu funil para uma leitura. Comece registrando seus atendimentos — é deles que sai todo o resto.";
  }
  const bons = destaques(c);
  const g = gargalo(c);

  if (bons.length > 0 && g) {
    return `${bons[0].detalhe} Seu próximo desafio: ${g.foco.toLowerCase()}`;
  }
  if (bons.length > 0) {
    return `${bons[0].detalhe} Mantenha a constância — é ela que transforma um bom mês em um bom ano.`;
  }
  if (g) {
    return `${g.situacao} ${g.foco}`;
  }
  return "Sua operação está estável. Um passo a mais em cada etapa do funil já muda o resultado do mês.";
}

/* ------------------------------ foco de hoje ------------------------------ */

/**
 * A frase do dia, ancorada no momento REAL da pessoa.
 *
 * Genérico é o último recurso, não o primeiro: quando há número, a frase cita
 * o número. É a diferença entre a empresa falando com você e um cartaz na
 * parede.
 */
export function focoDeHoje(c: Comparacao): string {
  const { atual: a, anterior: b } = c;
  if (!temDados(c)) {
    return "Todo resultado começa no primeiro contato. Registre seus atendimentos e o mapa se desenha sozinho.";
  }

  const parados = a.leadsAtivos - a.leadsAtualizados;
  if (a.leadsAtivos >= 5 && pct(parados, a.leadsAtivos) >= 50) {
    return `${plural(parados, "cliente está esperando", "clientes estão esperando")} seu retorno. Comece por eles hoje.`;
  }
  if (a.propostas > 0 && a.fechados === 0) {
    return `Você tem ${plural(a.propostas, "proposta na rua", "propostas na rua")}. Não pare na apresentação — conduza até a decisão. 🚀`;
  }
  if (a.agendamentos > 0 && a.propostas === 0) {
    return `${plural(a.agendamentos, "agendamento mostra", "agendamentos mostram")} que sua carteira está se movendo. Agora transforme em proposta.`;
  }
  if (b && a.oportunidades > b.oportunidades) {
    return "Você está acima do seu ritmo anterior. Continue acelerando. 🔥";
  }
  if (b && b.oportunidades >= 3 && a.oportunidades < b.oportunidades * 0.6) {
    return "Seu ritmo caiu nos últimos dias. Bora reagir hoje e recuperar o movimento.";
  }
  if (a.fechados > 0) {
    return `${plural(a.fechados, "fechamento no período", "fechamentos no período")}. Hoje pode ser o dia de superar sua melhor marca.`;
  }
  return "Seu próximo nível começa no que você faz hoje.";
}

/* ------------------------------ reconhecimento ---------------------------- */

export type Conquista = { emoji: string; titulo: string; detalhe: string };

/**
 * Conquistas — só com prova.
 *
 * `melhores` é o histórico de ciclos anteriores; um recorde só é recorde se
 * for maior que TODOS eles, e se houver histórico com o que comparar.
 */
export function conquistas(c: Comparacao, historico: IndicadoresBrutos[]): Conquista[] {
  const { atual: a, anterior: b } = c;
  const out: Conquista[] = [];
  const anteriores = historico.filter((h) => h !== a);

  const recorde = (valor: number, campo: keyof IndicadoresBrutos, rotulo: string) => {
    if (anteriores.length < 2 || valor <= 0) return;
    const maior = Math.max(...anteriores.map((h) => Number(h[campo] ?? 0)));
    if (valor > maior) {
      out.push({
        emoji: "🏆",
        titulo: "Novo recorde pessoal",
        detalhe: `Você superou sua melhor marca de ${rotulo}: ${valor}.`,
      });
    }
  };
  recorde(a.fechados, "fechados", "fechamentos");
  recorde(a.agendamentos, "agendamentos", "agendamentos");

  if (b && cresceu(a.propostas, b.propostas)) {
    out.push({
      emoji: "📈",
      titulo: "Evolução",
      detalhe: `Seu volume de propostas cresceu em relação ao período anterior.`,
    });
  }

  // Boa fase = três ciclos seguidos crescendo em oportunidades.
  if (historico.length >= 3) {
    const [x, y, z] = historico.slice(-3);
    if (z.oportunidades > y.oportunidades && y.oportunidades > x.oportunidades) {
      out.push({
        emoji: "🔥",
        titulo: "Boa fase",
        detalhe: "Você vem crescendo de forma consistente há três períodos.",
      });
    }
  }

  return out.slice(0, 3);
}

/* ------------------------------ plano pessoal ----------------------------- */

/** As métricas que dá para medir de verdade. Meta em texto livre não vira %. */
export const METRICAS_PLANO = [
  { chave: "fechados", rotulo: "Fechamentos" },
  { chave: "agendamentos", rotulo: "Agendamentos" },
  { chave: "propostas", rotulo: "Propostas" },
  { chave: "oportunidades", rotulo: "Oportunidades" },
] as const;

export type MetricaPlano = (typeof METRICAS_PLANO)[number]["chave"];

/**
 * Progresso da meta pessoal.
 *
 * `null` quando a meta é texto livre ou não tem alvo: inventar um percentual
 * em cima de uma frase seria mentir com aparência de precisão.
 */
export function progressoPlano(
  atual: IndicadoresBrutos,
  metrica: MetricaPlano | null | undefined,
  alvo: number | null | undefined,
): { realizado: number; alvo: number; pct: number } | null {
  if (!metrica || !alvo || alvo <= 0) return null;
  const realizado = Number(atual[metrica] ?? 0);
  return { realizado, alvo, pct: Math.min(100, (realizado / alvo) * 100) };
}
