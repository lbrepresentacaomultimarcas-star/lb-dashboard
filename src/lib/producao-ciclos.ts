/**
 * CICLOS DE PRODUÇÃO DA LB — os dois ciclos do mês e quando o dinheiro entra.
 *
 * Este arquivo é SÓ do financeiro. Ele NÃO mexe em `lib/ciclo.ts`, que é o
 * ciclo mensal de fechamento dia 20 usado pelo ranking, pelas metas, pelo
 * Índice de Performance e pelo histórico de produção. São duas coisas
 * diferentes no mesmo CRM, de propósito:
 *
 *   `lib/ciclo.ts`        um ciclo por mês, fecha dia 20 → ranking e metas
 *   este arquivo          DOIS ciclos por mês, 20→5 e 5→20 → quando recebe
 *
 * A REGRA REAL DA EMPRESA
 *
 *   CICLO A   produção de 20 a 5    →  recebe no dia 21 (ou 22) do mês do
 *                                      fechamento; se não for dia útil, no
 *                                      próximo dia útil
 *   CICLO B   produção de 5 a 20    →  recebe até o 5º DIA ÚTIL do mês
 *                                      seguinte ao fechamento
 *
 * COMO UMA VENDA NÃO CAI EM DOIS CICLOS
 *
 * O dia 5 ENCERRA o ciclo A e o dia 20 ENCERRA o ciclo B. Então a faixa de
 * cada um é fechada em cima do dia do fechamento e aberta embaixo:
 *
 *   dia 21 até dia 5   → ciclo A (fecha no dia 5)
 *   dia 6  até dia 20  → ciclo B (fecha no dia 20)
 *
 * Todo dia do calendário cai em exatamente um dos dois — há teste cobrindo
 * ano inteiro. O rótulo continua sendo escrito como a empresa fala
 * ("20/09 → 05/10"), mas o dia 20 em si pertence ao ciclo que ele fecha.
 *
 * DATA DA VENDA NÃO É DATA DO RECEBIMENTO. Nada aqui devolve dinheiro
 * recebido: só devolve QUANDO é esperado. O recebido é fato, vem do banco.
 */

import { ehDiaUtil, proximoDiaUtil, type ConfigProducao } from "./ciclo";

/**
 * Config usada só para decidir dia útil. Fim de semana e feriado SEMPRE
 * contam aqui — a administradora não paga no sábado, independente de como o
 * ciclo do ranking está configurado.
 */
const UTEIS: ConfigProducao = {
  diaBase: 20,
  prorrogarDiaUtil: true,
  considerarSabDom: true,
  considerarFeriados: true,
  inicioProximoCiclo: "dia_seguinte",
  dataInicioRegra: "1900-01-01",
};

/** Regra de recebimento, editável pelo admin. */
export type ConfigRecebimento = {
  /** Dia do mês em que o ciclo A costuma cair (21 ou 22). */
  diaRecebimentoA: number;
  /** Quantos dias úteis para o ciclo B (a empresa usa 5). */
  diasUteisB: number;
};

export const CONFIG_RECEBIMENTO_PADRAO: ConfigRecebimento = {
  diaRecebimentoA: 21,
  diasUteisB: 5,
};

export type Letra = "A" | "B";

export type CicloProducao = {
  /** "2026-10-A" fecha dia 5 de outubro · "2026-10-B" fecha dia 20 de outubro. */
  chave: string;
  letra: Letra;
  /** Primeiro dia que conta para este ciclo. */
  inicio: Date;
  /** Dia do fechamento — último que conta. */
  fim: Date;
  /** Como a empresa escreve: "20/09 → 05/10". */
  rotulo: string;
  /** Quando o dinheiro é esperado. */
  previsao: Date;
  /** A regra em uma frase, para a tela não precisar explicar. */
  regra: string;
};

const soData = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Texto "YYYY-MM-DD" (ou ISO) vira o DIA LOCAL pretendido, sem deslocar por
 * fuso — mesma leitura que `lib/ciclo.ts` faz, pelo mesmo motivo: `venda.data`
 * é gravada como meia-noite UTC do dia escolhido.
 */
export function paraDataLocal(data: Date | string): Date {
  if (data instanceof Date) return soData(data);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return soData(new Date(data));
}

const dd = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

const chaveDe = (ano: number, mes1: number, letra: Letra) =>
  `${ano}-${String(mes1).padStart(2, "0")}-${letra}`;

/**
 * O N-ésimo dia útil do mês (`mes` 0-11).
 *
 * Existe porque "até o 5º dia útil" NÃO é dia 5: em novembro de 2026, com o
 * dia 1 caindo no domingo, o 5º dia útil é dia 6. Contar na mão é justamente
 * o tipo de conta que o admin não deveria ter que fazer.
 */
export function nDiaUtilDoMes(ano: number, mes: number, n: number, feriados: Set<string>): Date {
  const quantos = Math.max(1, Math.min(20, Math.trunc(n)));
  let contados = 0;
  const d = new Date(ano, mes, 1);
  for (let guarda = 0; guarda < 62; guarda++) {
    if (ehDiaUtil(d, UTEIS, feriados)) {
      contados++;
      if (contados === quantos) return soData(d);
    }
    d.setDate(d.getDate() + 1);
  }
  return soData(new Date(ano, mes, 1));
}

/**
 * A qual ciclo de produção uma venda pertence.
 *
 * Só olha o DIA do mês — e é por isso que nenhuma venda entra em dois ciclos:
 * as três faixas (21-31, 1-5, 6-20) não se sobrepõem e cobrem o mês inteiro.
 */
export function chaveDoCiclo(data: Date | string): string {
  const d = paraDataLocal(data);
  const dia = d.getDate();
  if (dia >= 21) {
    // depois do fechamento do dia 20: já é o ciclo A que fecha dia 5 do mês seguinte
    const ref = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return chaveDe(ref.getFullYear(), ref.getMonth() + 1, "A");
  }
  if (dia <= 5) return chaveDe(d.getFullYear(), d.getMonth() + 1, "A");
  return chaveDe(d.getFullYear(), d.getMonth() + 1, "B");
}

/** Quebra "2026-10-A" em ano, mês (1-12) e letra. */
function partes(chave: string): { ano: number; mes1: number; letra: Letra } | null {
  const m = /^(\d{4})-(\d{2})-([AB])$/.exec(chave);
  if (!m) return null;
  return { ano: Number(m[1]), mes1: Number(m[2]), letra: m[3] as Letra };
}

/** O ciclo inteiro (janela, rótulo, previsão de recebimento) pela chave. */
export function cicloPorChave(
  chave: string,
  feriados: Set<string>,
  cfg: ConfigRecebimento = CONFIG_RECEBIMENTO_PADRAO,
): CicloProducao {
  const p = partes(chave);
  if (!p) throw new Error(`Ciclo inválido: ${chave}`);
  const { ano, mes1, letra } = p;
  const mes0 = mes1 - 1;

  if (letra === "A") {
    // produção de 21 do mês anterior até 5 deste mês
    const inicio = new Date(ano, mes0 - 1, 21);
    const fim = new Date(ano, mes0, 5);
    const bruta = new Date(ano, mes0, Math.max(1, Math.min(28, cfg.diaRecebimentoA)));
    const previsao = proximoDiaUtil(bruta, UTEIS, feriados);
    const mudou = previsao.getDate() !== bruta.getDate();
    return {
      chave,
      letra,
      inicio,
      fim,
      rotulo: `${dd(new Date(ano, mes0 - 1, 20))} → ${dd(fim)}`,
      previsao,
      regra: mudou
        ? `dia ${cfg.diaRecebimentoA} não é dia útil — passa para o próximo dia útil`
        : `dia ${cfg.diaRecebimentoA} do mês, ou o próximo dia útil`,
    };
  }

  // ciclo B: produção de 6 a 20 deste mês, recebimento até o 5º dia útil do mês seguinte
  const inicio = new Date(ano, mes0, 6);
  const fim = new Date(ano, mes0, 20);
  const seguinte = new Date(ano, mes0 + 1, 1);
  const previsao = nDiaUtilDoMes(seguinte.getFullYear(), seguinte.getMonth(), cfg.diasUteisB, feriados);
  return {
    chave,
    letra,
    inicio,
    fim,
    rotulo: `${dd(new Date(ano, mes0, 5))} → ${dd(fim)}`,
    previsao,
    regra: `até o ${cfg.diasUteisB}º dia útil do mês seguinte`,
  };
}

/** O ciclo de produção de uma data. */
export function cicloDaData(
  data: Date | string,
  feriados: Set<string>,
  cfg: ConfigRecebimento = CONFIG_RECEBIMENTO_PADRAO,
): CicloProducao {
  return cicloPorChave(chaveDoCiclo(data), feriados, cfg);
}

/**
 * Anda `passos` ciclos a partir de uma chave (aceita negativo).
 * A sequência alterna A → B → A do mês seguinte → B…
 */
export function andarCiclo(chave: string, passos: number): string {
  const p = partes(chave);
  if (!p) return chave;
  // posição absoluta: dois ciclos por mês
  const pos = p.ano * 24 + (p.mes1 - 1) * 2 + (p.letra === "A" ? 0 : 1) + passos;
  const ano = Math.floor(pos / 24);
  const resto = pos - ano * 24;
  const mes1 = Math.floor(resto / 2) + 1;
  const letra: Letra = resto % 2 === 0 ? "A" : "B";
  return chaveDe(ano, mes1, letra);
}

/** Lista de ciclos em volta de uma data: `antes` para trás, `depois` para frente. */
export function ciclosEmVolta(
  data: Date,
  feriados: Set<string>,
  cfg: ConfigRecebimento = CONFIG_RECEBIMENTO_PADRAO,
  antes = 1,
  depois = 2,
): CicloProducao[] {
  const atual = chaveDoCiclo(data);
  const lista: CicloProducao[] = [];
  for (let i = -Math.abs(antes); i <= Math.abs(depois); i++) {
    lista.push(cicloPorChave(andarCiclo(atual, i), feriados, cfg));
  }
  return lista;
}
