/**
 * Motor do "ciclo de produção" — fechamento configurável (padrão dia 20),
 * com prorrogação para o próximo dia útil em sábado/domingo/feriado.
 *
 * SEGURO POR PADRÃO: sem uma config válida (ou para datas anteriores ao
 * `dataInicioRegra`), tudo cai no MÊS CALENDÁRIO de sempre — ou seja, o
 * comportamento atual do sistema NÃO muda até o admin ativar a regra.
 * Isso garante a decisão B: o histórico antigo nunca é recalculado.
 */
import { monthKey } from "./utils";

export type InicioCiclo = "no_fechamento" | "dia_seguinte";

export type ConfigProducao = {
  /** Dia base do fechamento (ex.: 20). */
  diaBase: number;
  /** Se cair em dia não-útil, prorroga para o próximo dia útil. */
  prorrogarDiaUtil: boolean;
  /** Considerar sábado/domingo como não-útil. */
  considerarSabDom: boolean;
  /** Considerar feriados (tela de feriados) como não-útil. */
  considerarFeriados: boolean;
  /** O próximo ciclo começa NO dia do fechamento ou no dia SEGUINTE. */
  inicioProximoCiclo: InicioCiclo;
  /** Cutover: datas antes disso usam mês calendário (histórico intacto). "YYYY-MM-DD". */
  dataInicioRegra: string;
};

/** Padrão = regra DESLIGADA (cutover no futuro) → nada muda até configurar. */
export const CONFIG_PRODUCAO_PADRAO: ConfigProducao = {
  diaBase: 20,
  prorrogarDiaUtil: true,
  considerarSabDom: true,
  considerarFeriados: true,
  inicioProximoCiclo: "dia_seguinte",
  dataInicioRegra: "9999-12-31",
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Zera a hora (data local 00:00). */
const soData = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Converte uma data (Date ou texto "YYYY-MM-DD" / ISO) para o DIA LOCAL pretendido.
 * Datas em texto são lidas pela PARTE DA DATA (ano-mês-dia) — SEM deslocar por fuso.
 * No app, `venda.data` é gravada como `new Date(input).toISOString()`, ou seja a
 * meia-noite UTC do dia escolhido; pegar a parte da data devolve exatamente o dia
 * que o usuário escolheu (ex.: "2026-06-20T00:00:00.000Z" -> 20/06 local).
 */
function paraDataLocal(data: Date | string): Date {
  if (data instanceof Date) return soData(data);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return soData(new Date(data)); // fallback p/ formatos inesperados
}

/** Dia útil = não é fim de semana (se considerar) nem feriado (se considerar). */
export function ehDiaUtil(d: Date, config: ConfigProducao, feriados: Set<string>): boolean {
  if (config.considerarSabDom) {
    const dow = d.getDay(); // 0=domingo, 6=sábado
    if (dow === 0 || dow === 6) return false;
  }
  if (config.considerarFeriados && feriados.has(ymd(d))) return false;
  return true;
}

/** Primeiro dia útil a partir de `d` (inclusivo). */
export function proximoDiaUtil(d: Date, config: ConfigProducao, feriados: Set<string>): Date {
  const x = soData(d);
  let guard = 0;
  while (!ehDiaUtil(x, config, feriados) && guard < 60) {
    x.setDate(x.getDate() + 1);
    guard++;
  }
  return x;
}

/** Data de fechamento do mês (`mes` 0-11): dia base, prorrogado se cair em não-útil. */
export function dataFechamento(ano: number, mes: number, config: ConfigProducao, feriados: Set<string>): Date {
  const base = new Date(ano, mes, config.diaBase);
  return config.prorrogarDiaUtil ? proximoDiaUtil(base, config, feriados) : soData(base);
}

/**
 * Chave do ciclo ("AAAA-MM" do mês de fechamento) a que a data pertence.
 * Antes do cutover (`dataInicioRegra`) → mês calendário (histórico intacto).
 */
export function cicloDeData(data: Date | string, config: ConfigProducao, feriados: Set<string>): string {
  const d = paraDataLocal(data);
  const cutover = paraDataLocal(config.dataInicioRegra);
  // Antes do cutover: devolve EXATAMENTE o que o app já calcula hoje (monthKey do
  // valor original), pra o histórico não mudar nem um centavo (decisão B).
  if (d < cutover) return monthKey(data);

  const fechaEste = dataFechamento(d.getFullYear(), d.getMonth(), config, feriados);
  const dentroDeste =
    config.inicioProximoCiclo === "dia_seguinte" ? d <= fechaEste : d < fechaEste;
  // até/no fechamento → ciclo deste mês; depois → ciclo do mês seguinte
  const ref = dentroDeste
    ? new Date(d.getFullYear(), d.getMonth(), 1)
    : new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return monthKey(ref);
}

/** Início/fim de um ciclo identificado pela sua chave "AAAA-MM" (mês do fechamento). */
export function cicloPorChave(
  chave: string,
  config: ConfigProducao,
  feriados: Set<string>,
): { chave: string; inicio: Date; fim: Date } {
  const [y, m] = chave.split("-").map(Number); // m é 1-based
  const fim = dataFechamento(y, m - 1, config, feriados); // fechamento do mês da chave
  const fechaAnterior = dataFechamento(y, m - 2, config, feriados); // mês anterior
  const inicio = soData(fechaAnterior);
  if (config.inicioProximoCiclo === "dia_seguinte") inicio.setDate(inicio.getDate() + 1);
  return { chave, inicio, fim };
}

/** Ciclo atual (baseado em `hoje`): chave + datas de início e fim. */
export function cicloAtual(
  config: ConfigProducao,
  feriados: Set<string>,
  hoje: Date = new Date(),
): { chave: string; inicio: Date; fim: Date } {
  return cicloPorChave(cicloDeData(hoje, config, feriados), config, feriados);
}

/** Data (local) a partir da qual a regra de ciclo passa a valer (cutover). */
export function dataInicioRegraDate(config: ConfigProducao): Date {
  return paraDataLocal(config.dataInicioRegra);
}

/** Helper p/ montar o Set de feriados a partir de uma lista de "YYYY-MM-DD". */
export function setDeFeriados(datas: string[]): Set<string> {
  return new Set(datas);
}
