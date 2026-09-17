/**
 * MOTOR DO FINANCEIRO ESTRATÉGICO — regra de distribuição do faturamento.
 *
 * Tudo aqui é cálculo puro: entra número, sai número. Não consulta banco, não
 * grava nada e não conhece tela. É de propósito — é o único lugar onde a regra
 * dos percentuais existe, então a tela, a projeção e o fechamento do mês não
 * podem discordar entre si.
 *
 * A REGRA DA LB, sobre o faturamento REALIZADO de cada mês:
 *
 *   10%  guardar para a empresa (lucro intocável)
 *   50%  LIMITE do pró-labore   ← limite, não obrigação de retirada
 *   18%  separar para impostos
 *   22%  LIMITE dos gastos da operação
 *   ---
 *   100%
 *
 * Os dois LIMITES são a parte que mais se entende errado. Não retirar os 50%
 * inteiros não é sobra perdida: o que não sai continua na empresa, e é isso que
 * o indicador "valor mantido na empresa" mostra.
 */

/** Os quatro percentuais. Fecham 100% — há teste garantindo isso. */
export const PERCENTUAIS = {
  guardar: 10,
  prolabore: 50,
  impostos: 18,
  operacao: 22,
} as const;

export type Destino = keyof typeof PERCENTUAIS;

/** Os rótulos que o usuário lê. Nada de "retido", "provisão" ou "forecast". */
export const ROTULOS: Record<Destino, string> = {
  guardar: "Guardar para a empresa",
  prolabore: "Limite do pró-labore",
  impostos: "Separar para impostos",
  operacao: "Limite para a operação",
};

/** Centavos, para o dinheiro não escorregar no arredondamento. */
const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Quanto vai para cada destino, a partir do faturamento do mês.
 *
 * O último destino recebe a SOBRA em vez do próprio percentual. Sem isso,
 * quatro arredondamentos independentes podem somar um centavo a mais ou a
 * menos que o faturamento — e aí a tela mostra uma conta que não fecha.
 */
export function distribuir(faturamento: number): Record<Destino, number> {
  const base = Math.max(0, cent(faturamento));
  const guardar = cent((base * PERCENTUAIS.guardar) / 100);
  const prolabore = cent((base * PERCENTUAIS.prolabore) / 100);
  const impostos = cent((base * PERCENTUAIS.impostos) / 100);
  const operacao = cent(base - guardar - prolabore - impostos);
  return { guardar, prolabore, impostos, operacao };
}

export type Situacao = "ok" | "atencao" | "acima";

export type LinhaPlano = {
  destino: Destino;
  rotulo: string;
  /** O que a regra manda (meta, no caso de guardar/impostos; limite nos outros). */
  planejado: number;
  /** O que de fato aconteceu. */
  realizado: number;
  /**
   * `true` = os 50%/22% são TETO (gastar menos é bom).
   * `false` = os 10%/18% são META (separar menos é problema).
   */
  ehLimite: boolean;
  /** Positivo = falta separar (meta) ou sobrou do limite (teto). */
  diferenca: number;
  situacao: Situacao;
  /** A frase que a tela mostra. */
  estado: string;
};

/**
 * Meta e teto se avaliam ao contrário, e tratar os dois igual é o erro clássico
 * deste tipo de painel:
 *
 *   IMPOSTOS (meta 18%)  separar MENOS que a meta é problema
 *   OPERAÇÃO (teto 22%)  gastar MENOS que o teto é bom
 *
 * Por isso `ehLimite` existe, e por isso "sobrou" e "falta" são coisas
 * diferentes na mesma tabela.
 */
export function linhaDoPlano(
  destino: Destino,
  planejado: number,
  realizado: number,
): LinhaPlano {
  const ehLimite = destino === "prolabore" || destino === "operacao";
  const p = cent(planejado);
  const r = cent(realizado);
  const base = { destino, rotulo: ROTULOS[destino], planejado: p, realizado: r, ehLimite };

  if (ehLimite) {
    const sobra = cent(p - r);
    if (sobra < 0) {
      return { ...base, diferenca: cent(-sobra), situacao: "acima", estado: "Acima do limite" };
    }
    return { ...base, diferenca: sobra, situacao: "ok", estado: "Dentro do limite" };
  }

  const falta = cent(p - r);
  // Sem meta (faturamento zero) nada está em falta.
  if (p === 0) return { ...base, diferenca: 0, situacao: "ok", estado: "Sem meta neste mês" };
  if (falta <= 0) return { ...base, diferenca: 0, situacao: "ok", estado: "Feito" };
  // Faltando mais de 5% da meta já é aviso; abaixo disso é arredondamento.
  const grave = falta > p * 0.05;
  return {
    ...base,
    diferenca: falta,
    situacao: grave ? "atencao" : "ok",
    estado: grave ? "Falta separar" : "Praticamente feito",
  };
}

export type Realizado = {
  /** Quanto foi efetivamente guardado para a empresa. */
  guardado: number;
  /** Quanto o dono retirou de pró-labore. */
  prolaboreUsado: number;
  /** Quanto foi separado para impostos. */
  impostoSeparado: number;
  /** Quanto a operação gastou (soma dos gastos do mês marcados como operação). */
  operacaoGasta: number;
};

export type PlanoDoMes = {
  faturamento: number;
  limites: Record<Destino, number>;
  linhas: LinhaPlano[];
  /**
   * O que ficou na empresa: a parte do limite de pró-labore que não foi
   * retirada. É este número que o indicador "valor mantido na empresa" mostra.
   */
  mantidoNaEmpresa: number;
  /** Quanto ainda cabe gastar na operação. Nunca negativo. */
  operacaoDisponivel: number;
  /** Quanto a operação passou do teto. Zero quando está dentro. */
  operacaoExcedente: number;
};

export function planoDoMes(faturamento: number, feito: Realizado): PlanoDoMes {
  const limites = distribuir(faturamento);
  const linhas: LinhaPlano[] = [
    linhaDoPlano("guardar", limites.guardar, feito.guardado),
    linhaDoPlano("prolabore", limites.prolabore, feito.prolaboreUsado),
    linhaDoPlano("impostos", limites.impostos, feito.impostoSeparado),
    linhaDoPlano("operacao", limites.operacao, feito.operacaoGasta),
  ];
  return {
    faturamento: cent(Math.max(0, faturamento)),
    limites,
    linhas,
    mantidoNaEmpresa: cent(Math.max(0, limites.prolabore - feito.prolaboreUsado)),
    operacaoDisponivel: cent(Math.max(0, limites.operacao - feito.operacaoGasta)),
    operacaoExcedente: cent(Math.max(0, feito.operacaoGasta - limites.operacao)),
  };
}

/* ------------------------------------------------------------------- caixa */

export type Caixa = {
  /** Dinheiro que já entrou menos o que já saiu. Só o que aconteceu. */
  disponivel: number;
  /** Entradas previstas que ainda NÃO entraram. */
  aReceber: number;
  /** Saídas previstas que ainda NÃO saíram. */
  aPagar: number;
  /** disponivel + aReceber − aPagar. É previsão, não saldo. */
  projetado: number;
};

/**
 * O caixa NUNCA soma o que ainda não entrou.
 *
 * Misturar "tenho" com "vou ter" é como se perde dinheiro sem perceber: o
 * painel mostra folga que não existe e o compromisso vence antes do
 * recebimento. `disponivel` e `projetado` ficam em campos separados de
 * propósito, e a tela mostra os dois lado a lado.
 */
export function caixaDe(mov: {
  recebido: number;
  pago: number;
  previstoEntrar: number;
  previstoSair: number;
}): Caixa {
  const disponivel = cent(mov.recebido - mov.pago);
  const aReceber = cent(Math.max(0, mov.previstoEntrar));
  const aPagar = cent(Math.max(0, mov.previstoSair));
  return { disponivel, aReceber, aPagar, projetado: cent(disponivel + aReceber - aPagar) };
}

/* --------------------------------------------------------------- projeção */

export type MesProjetado = {
  chave: string;
  entradas: number;
  saidas: number;
  resultado: number;
  /** Saldo acumulado ao fim deste mês, partindo do caixa de hoje. */
  saldo: number;
};

/**
 * Projeção mês a mês, partindo do caixa disponível de HOJE.
 *
 * O saldo é acumulado: o resultado de um mês entra no seguinte. Um mês
 * negativo no meio aparece no saldo dos próximos, que é justamente o aviso que
 * interessa — dá para ver o aperto antes de ele chegar.
 */
export function projetar(
  caixaHoje: number,
  meses: { chave: string; entradas: number; saidas: number }[],
): MesProjetado[] {
  let saldo = cent(caixaHoje);
  return meses.map((m) => {
    const entradas = cent(Math.max(0, m.entradas));
    const saidas = cent(Math.max(0, m.saidas));
    const resultado = cent(entradas - saidas);
    saldo = cent(saldo + resultado);
    return { chave: m.chave, entradas, saidas, resultado, saldo };
  });
}

/* ------------------------------------------------------------- diagnóstico */

export type Diagnostico = {
  situacao: Situacao;
  titulo: string;
  /** O que exatamente saiu do plano. Vazio quando está tudo certo. */
  pontos: string[];
};

/** O resumo do mês em uma frase, e a lista do que saiu do plano. */
export function diagnosticar(plano: PlanoDoMes): Diagnostico {
  if (plano.faturamento <= 0) {
    return {
      situacao: "atencao",
      titulo: "Faturamento do mês ainda não informado",
      pontos: ["Informe o faturamento para o sistema calcular as destinações."],
    };
  }

  const pontos: string[] = [];
  for (const l of plano.linhas) {
    if (l.situacao === "acima") {
      pontos.push(`${l.rotulo}: passou em ${fmt(l.diferenca)}`);
    } else if (l.situacao === "atencao") {
      pontos.push(`${l.rotulo}: falta separar ${fmt(l.diferenca)}`);
    }
  }

  if (pontos.length === 0) {
    return { situacao: "ok", titulo: "Mês dentro do plano", pontos: [] };
  }
  const acima = plano.linhas.some((l) => l.situacao === "acima");
  return {
    situacao: acima ? "acima" : "atencao",
    titulo: acima ? "Mês fora do plano" : "Mês com pontos de atenção",
    pontos,
  };
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
