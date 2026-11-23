/**
 * Data da venda.
 *
 * O ciclo de produção lê o DIA escrito no texto da data (`2026-11-23T...`). Só
 * que `toISOString()` escreve em UTC: no Brasil, das 21h à meia-noite, ele já
 * mostra o dia seguinte. Uma venda das 22h do dia do fechamento caía na produção
 * do mês seguinte.
 *
 * Estas funções garantem que o dia gravado seja o dia em que a pessoa está.
 * Vendas antigas não são recalculadas.
 */

const doisDigitos = (n: number) => String(n).padStart(2, "0");

const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;

/** Último instante cujo texto UTC ainda mostra este dia. */
const fimDoDiaEmTexto = (dia: string) => `${dia}T23:59:59.000Z`;

/** Hoje, no fuso de quem está usando (YYYY-MM-DD). */
export function hojeLocal(agora: Date = new Date()): string {
  return diaLocal(agora);
}

/** Venda lançada com data escolhida, sem horário. 12:00 UTC é o mesmo dia no Brasil. */
export function dataDoDia(dia: string): string {
  return `${dia}T12:00:00.000Z`;
}

/** Instante de uma venda feita agora, sem deixar o texto virar o dia seguinte. */
export function instanteDaVenda(agora: Date = new Date()): string {
  const iso = agora.toISOString();
  const dia = diaLocal(agora);
  return iso.slice(0, 10) === dia ? iso : fimDoDiaEmTexto(dia);
}

/** Data e hora escolhidas na edição, mantendo o dia escolhido. */
export function combinarDataHora(dia: string, hora: string): string {
  const iso = new Date(`${dia}T${hora || "00:00"}:00`).toISOString();
  return iso.slice(0, 10) === dia ? iso : fimDoDiaEmTexto(dia);
}

/** Vendas antigas sem horário foram gravadas à meia-noite UTC. */
const semHorario = (iso: string) => /T00:00:00(\.0+)?(Z|\+00(:00)?)$/.test(iso);

/** O dia da venda como o ciclo enxerga, para preencher o formulário de edição. */
export function diaDaVenda(iso: string): string {
  return semHorario(iso) ? iso.slice(0, 10) : diaLocal(new Date(iso));
}

export function horaDaVenda(iso: string): string {
  if (semHorario(iso)) return "00:00";
  const d = new Date(iso);
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}
