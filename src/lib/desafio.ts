/**
 * DESAFIOS (ex.: "DESAFIO LB — META DE R$ 1 MILHÃO").
 *
 * O administrador cria, edita, ativa e desativa os desafios (tabela `desafios`).
 * Aqui ficam as regras puras (sem React, sem banco): a tela, a impressão e os
 * testes usam exatamente as mesmas contas. Nada é digitado à mão: produção,
 * saldo, percentual, status e marcação do dia saem das vendas do CRM.
 *
 * Vendas que contam: as mesmas do Ranking (tudo, menos as Canceladas). O filtro
 * de Canceladas já vem de `useVendas()`; aqui ele é repetido por segurança.
 */
import type { Venda } from "./types";

export type ParticipanteDesafio = {
  vendedorId: string;
  /** Nome exibido no desafio (pode diferir do cadastro, ex.: "William Narciso"). */
  nome: string;
  meta: number;
};

export type Desafio = {
  id: string;
  titulo: string;
  frase: string;
  /** "AAAA-MM-DD" */
  inicio: string;
  /** "AAAA-MM-DD" (inclusive) */
  fim: string;
  /** Vazio = soma das metas individuais. */
  metaColetiva?: number;
  participantes: ParticipanteDesafio[];
  ativo: boolean;
  criadoEm?: string;
};

export const FRASE_PADRAO = "Desafio · Responsabilidade · Competitividade · Espírito de equipe";
/** Depois do último dia, o desafio continua no menu por estes dias, com o resultado final. */
export const DIAS_RESULTADO_FINAL = 2;
export const MAX_DIAS_DESAFIO = 93;

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ---------------------------------------------------------------- datas

export function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataDe(chave: string): Date {
  const [y, m, d] = chave.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function somarDias(chave: string, n: number): string {
  const d = dataDe(chave);
  return chaveDia(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Dias corridos de `a` até `b` (b - a). */
export function diferencaDias(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Dia efetivo da venda: a parte de data do registro (mesma regra do ciclo de produção). */
export function diaDaVenda(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : chaveDia(new Date(data));
}

export function rotuloDia(chave: string): { data: string; semana: string } {
  const [, m, d] = chave.split("-");
  return { data: `${d}/${m}`, semana: DIAS_SEMANA[dataDe(chave).getDay()] };
}

/** "26/11/2026" */
export function dataBR(chave: string): string {
  const [y, m, d] = chave.split("-");
  return `${d}/${m}/${y}`;
}

/** "26/11/2026 a 07/12/2026" */
export function periodoBR(d: Pick<Desafio, "inicio" | "fim">): string {
  return `${dataBR(d.inicio)} a ${dataBR(d.fim)}`;
}

/** Todos os dias do desafio, em "AAAA-MM-DD". */
export function diasDoDesafio(d: Pick<Desafio, "inicio" | "fim">): string[] {
  const n = Math.min(MAX_DIAS_DESAFIO, Math.max(0, diferencaDias(d.inicio, d.fim) + 1));
  return Array.from({ length: n }, (_, i) => somarDias(d.inicio, i));
}

// ---------------------------------------------------------------- metas

export function metaColetivaDe(d: Pick<Desafio, "metaColetiva" | "participantes">): number {
  if (d.metaColetiva && d.metaColetiva > 0) return d.metaColetiva;
  return arred(d.participantes.reduce((a, p) => a + (Number(p.meta) || 0), 0));
}

export function metaDiaria(meta: number, d: Pick<Desafio, "inicio" | "fim">): number {
  const n = diasDoDesafio(d).length;
  return n ? meta / n : 0;
}

/** Todas as metas individuais iguais? Devolve o valor; senão, null. */
export function metaUnica(d: Pick<Desafio, "participantes">): number | null {
  const metas = new Set(d.participantes.map((p) => Number(p.meta)));
  return metas.size === 1 ? [...metas][0] : null;
}

// ---------------------------------------------------------------- tempo

export type EstadoDesafio = "inativo" | "agendado" | "em_andamento" | "resultado_final" | "encerrado";

export function estadoDoDesafio(d: Pick<Desafio, "ativo" | "inicio" | "fim">, hoje: string): EstadoDesafio {
  if (!d.ativo) return "inativo";
  if (hoje < d.inicio) return "agendado";
  if (hoje <= d.fim) return "em_andamento";
  if (diferencaDias(d.fim, hoje) <= DIAS_RESULTADO_FINAL) return "resultado_final";
  return "encerrado";
}

export const ESTADO_INFO: Record<EstadoDesafio, { rotulo: string; cor: string }> = {
  inativo: { rotulo: "Desativado", cor: "#64748b" },
  agendado: { rotulo: "Agendado", cor: "#0ea5e9" },
  em_andamento: { rotulo: "Em andamento", cor: "#16a34a" },
  resultado_final: { rotulo: "Resultado final", cor: "#C9A227" },
  encerrado: { rotulo: "Encerrado", cor: "#64748b" },
};

/** Aparece para a equipe (menu e tela): ativo, do 1º dia até o resultado final. */
export function visivelParaEquipe(d: Pick<Desafio, "ativo" | "inicio" | "fim">, hoje: string): boolean {
  const e = estadoDoDesafio(d, hoje);
  return e === "em_andamento" || e === "resultado_final";
}

/** Contagem regressiva até o último dia (contando hoje). */
export function diasRestantes(d: Pick<Desafio, "inicio" | "fim">, hoje: string): { dias: number; texto: string } {
  if (hoje > d.fim) return { dias: 0, texto: "Desafio encerrado — resultado final" };
  if (hoje < d.inicio) {
    const ate = diferencaDias(hoje, d.inicio);
    return { dias: diasDoDesafio(d).length, texto: `Começa em ${ate} dia${ate === 1 ? "" : "s"}` };
  }
  const dias = diferencaDias(hoje, d.fim) + 1;
  if (dias === 1) return { dias, texto: "ÚLTIMO DIA!" };
  return { dias, texto: `Faltam ${dias} dias (contando hoje)` };
}

/** Próxima rodada: começa no dia seguinte ao fim, com a mesma duração. */
export function proximaRodada(d: Desafio): Omit<Desafio, "id" | "criadoEm"> {
  const dur = diferencaDias(d.inicio, d.fim);
  const inicio = somarDias(d.fim, 1);
  return {
    titulo: d.titulo,
    frase: d.frase,
    inicio,
    fim: somarDias(inicio, dur),
    metaColetiva: d.metaColetiva,
    participantes: d.participantes.map((p) => ({ ...p })),
    ativo: true,
  };
}

/** Problemas que impedem salvar (lista vazia = ok). */
export function validarDesafio(d: Omit<Desafio, "id">): string[] {
  const erros: string[] = [];
  if (!d.titulo.trim()) erros.push("Informe o nome do desafio.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(d.fim)) erros.push("Informe as datas de início e fim.");
  else if (d.fim < d.inicio) erros.push("A data final não pode ser antes da inicial.");
  else if (diferencaDias(d.inicio, d.fim) + 1 > MAX_DIAS_DESAFIO) erros.push(`O período pode ter no máximo ${MAX_DIAS_DESAFIO} dias.`);
  if (d.participantes.length === 0) erros.push("Escolha pelo menos um vendedor.");
  if (new Set(d.participantes.map((p) => p.vendedorId)).size !== d.participantes.length) erros.push("Há vendedor repetido.");
  for (const p of d.participantes) {
    if (!p.nome.trim()) erros.push("Todo participante precisa de um nome de exibição.");
    if (!(Number(p.meta) > 0)) erros.push(`Informe a meta de ${p.nome || "todos os participantes"}.`);
  }
  if (d.metaColetiva !== undefined && d.metaColetiva !== null && !(d.metaColetiva > 0)) erros.push("A meta da equipe precisa ser maior que zero.");
  return [...new Set(erros)];
}

// ---------------------------------------------------------------- cálculo

export type ResultadoDia = "vendeu" | "nao_vendeu" | "aguardando";

export type LinhaDia = {
  chave: string;
  valor: number;
  acumulado: number;
  falta: number;
  resultado: ResultadoDia;
  /** Dia que ainda não chegou: a tela mostra "—" em vez de repetir o acumulado. */
  futuro: boolean;
};

export type StatusDesafio = "META BATIDA ✓" | "EM ANDAMENTO" | "SEM VENDAS";

export type FichaVendedor = ParticipanteDesafio & {
  dias: LinhaDia[];
  total: number;
  falta: number;
  pct: number;
  status: StatusDesafio;
  posicao: number;
};

/** Vendeu → ✓; dia que já passou com zero → X; hoje ainda sem venda e dias futuros → em branco. */
export function resultadoDoDia(chave: string, valor: number, hoje: string): ResultadoDia {
  if (valor > 0) return "vendeu";
  return chave < hoje ? "nao_vendeu" : "aguardando";
}

export function statusDe(total: number, meta: number): StatusDesafio {
  if (total >= meta) return "META BATIDA ✓";
  return total > 0 ? "EM ANDAMENTO" : "SEM VENDAS";
}

function arred(n: number) {
  return Math.round(n * 100) / 100;
}

/** Fichas de todos os participantes, já com a posição no ranking do desafio. */
export function calcularDesafio(
  d: Pick<Desafio, "inicio" | "fim" | "participantes">,
  vendas: Pick<Venda, "vendedorId" | "valor" | "data" | "status">[],
  hoje: string,
): FichaVendedor[] {
  const dias = diasDoDesafio(d);
  const dentro = new Set(dias);
  // soma por vendedor e dia — cada venda vai só para o vendedor dela
  const soma = new Map<string, Map<string, number>>();
  for (const v of vendas) {
    if ((v.status ?? "Confirmada") === "Cancelada" || !v.vendedorId) continue;
    const dia = diaDaVenda(v.data);
    if (!dentro.has(dia)) continue;
    const porDia = soma.get(v.vendedorId) ?? new Map<string, number>();
    porDia.set(dia, arred((porDia.get(dia) ?? 0) + (Number(v.valor) || 0)));
    soma.set(v.vendedorId, porDia);
  }

  const fichas = d.participantes.map((p) => {
    const meta = Number(p.meta) || 0;
    const porDia = soma.get(p.vendedorId) ?? new Map<string, number>();
    let acumulado = 0;
    const linhas = dias.map((chave) => {
      const valor = porDia.get(chave) ?? 0;
      acumulado = arred(acumulado + valor);
      return {
        chave,
        valor,
        acumulado,
        falta: Math.max(0, arred(meta - acumulado)),
        resultado: resultadoDoDia(chave, valor, hoje),
        futuro: chave > hoje,
      };
    });
    return {
      ...p,
      meta,
      dias: linhas,
      total: acumulado,
      falta: Math.max(0, arred(meta - acumulado)),
      pct: meta > 0 ? (acumulado / meta) * 100 : 0,
      status: statusDe(acumulado, meta),
      posicao: 0,
    };
  });

  const ordem = [...fichas].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  ordem.forEach((f, i) => {
    f.posicao = i + 1;
  });
  return ordem;
}

export function totaisDaEquipe(fichas: Pick<FichaVendedor, "total">[], metaColetiva: number) {
  const total = arred(fichas.reduce((a, f) => a + f.total, 0));
  return {
    total,
    falta: Math.max(0, arred(metaColetiva - total)),
    pct: metaColetiva > 0 ? (total / metaColetiva) * 100 : 0,
  };
}

/** Rótulo curto para as marcas do termômetro: "100 mil", "1,5 MI". */
export function valorCurto(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MI`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** 11 marcas de 0 até a meta (0%, 10%, … 100%). */
export function marcasTermometro(meta: number): string[] {
  return Array.from({ length: 11 }, (_, i) => (i === 0 ? "R$ 0" : i === 10 ? `R$ ${valorCurto(meta)}` : valorCurto((meta * i) / 10)));
}

// ---------------------------------------------------------------- banco

export type DbDesafio = {
  id: string;
  titulo: string;
  frase: string | null;
  inicio: string;
  fim: string;
  meta_coletiva: number | string | null;
  participantes: { vendedor_id: string; nome: string; meta: number | string }[] | null;
  ativo: boolean | null;
  criado_em?: string | null;
};

export function desafioFromDb(r: DbDesafio): Desafio {
  return {
    id: r.id,
    titulo: r.titulo,
    frase: r.frase ?? "",
    inicio: String(r.inicio).slice(0, 10),
    fim: String(r.fim).slice(0, 10),
    metaColetiva: r.meta_coletiva === null || r.meta_coletiva === undefined ? undefined : Number(r.meta_coletiva),
    participantes: (r.participantes ?? []).map((p) => ({ vendedorId: p.vendedor_id, nome: p.nome, meta: Number(p.meta) })),
    ativo: r.ativo ?? true,
    criadoEm: r.criado_em ?? undefined,
  };
}

export function desafioToDb(d: Partial<Omit<Desafio, "id" | "criadoEm">>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (d.titulo !== undefined) out.titulo = d.titulo.trim();
  if (d.frase !== undefined) out.frase = d.frase.trim();
  if (d.inicio !== undefined) out.inicio = d.inicio;
  if (d.fim !== undefined) out.fim = d.fim;
  if ("metaColetiva" in d) out.meta_coletiva = d.metaColetiva && d.metaColetiva > 0 ? d.metaColetiva : null;
  if (d.participantes !== undefined)
    out.participantes = d.participantes.map((p) => ({ vendedor_id: p.vendedorId, nome: p.nome.trim(), meta: Number(p.meta) }));
  if (d.ativo !== undefined) out.ativo = d.ativo;
  return out;
}
