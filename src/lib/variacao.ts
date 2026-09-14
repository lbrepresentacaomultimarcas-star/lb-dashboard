import { pct } from "./utils";

/**
 * VARIAÇÃO ENTRE DOIS PERÍODOS — o número e o que ele significa, juntos.
 *
 * O cartão do Pipeline mostrava `Math.abs(crescimento)`: uma queda de 46,1%
 * aparecia como **"CRESCIMENTO 46,1%"** com seta para baixo e cor vermelha. A
 * seta dizia uma coisa, a palavra dizia outra, e o número não dizia nada — quem
 * lesse rápido entendia que o Pipeline cresceu 46%.
 *
 * Aqui o sinal, a direção e a palavra saem do MESMO cálculo, então não há como
 * discordarem.
 *
 * A fórmula é a de sempre e não mudou:
 *
 *     (atual − anterior) / anterior × 100
 */

export type Direcao = "alta" | "baixa" | "estavel" | "sem-base";

export type Variacao = {
  /** Percentual COM sinal, já arredondado como a tela mostra. `null` = sem base. */
  pct: number | null;
  direcao: Direcao;
  /** O título do cartão: "Crescimento", "Queda", "Estável". */
  rotulo: string;
  /** O que aparece como valor: "+46,1%", "-46,1%", "0%", "sem base anterior". */
  texto: string;
};

export function variacaoPeriodo(atual: number, anterior: number): Variacao {
  /*
   * SEM BASE ANTERIOR.
   *
   * Crescer a partir de zero não tem percentual — dividir por zero daria
   * Infinity, e o código antigo devolvia `100`, um número inventado. De R$ 0
   * para R$ 50 mil não é "100% a mais": é a primeira base de comparação.
   * Dizer isso é mais honesto que exibir um número que ninguém consegue
   * conferir.
   */
  if (anterior <= 0) {
    return atual === anterior
      ? { pct: 0, direcao: "estavel", rotulo: "Estável", texto: "0%" }
      : { pct: null, direcao: "sem-base", rotulo: "Crescimento", texto: "sem base anterior" };
  }

  /*
   * Arredonda ANTES de decidir a direção, na mesma precisão que a tela usa.
   *
   * Sem isso, uma variação de −0,04% seria "baixa": seta para baixo, cor
   * vermelha e a palavra "Queda" ao lado de um "0%" — a mesma incoerência que
   * esta correção existe para acabar, só menor.
   */
  const bruto = ((atual - anterior) / anterior) * 100;
  const p = Math.round(bruto * 10) / 10;

  if (p === 0) return { pct: 0, direcao: "estavel", rotulo: "Estável", texto: "0%" };
  if (p > 0) return { pct: p, direcao: "alta", rotulo: "Crescimento", texto: `+${pct(p)}` };
  // `pct` já traz o sinal negativo do próprio número
  return { pct: p, direcao: "baixa", rotulo: "Queda", texto: pct(p) };
}
