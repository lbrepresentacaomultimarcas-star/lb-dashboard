/**
 * DESAFIO LB — META DE R$ 1 MILHÃO (26/11/2026 a 07/12/2026).
 *
 * Regras puras (sem React, sem banco): a tela, a impressão e os testes usam
 * exatamente as mesmas contas. Nada aqui é digitado à mão: produção, saldo,
 * percentual, status e marcação do dia saem das vendas do CRM.
 *
 * Vendas que contam: as mesmas do Ranking (tudo, menos as Canceladas). O filtro
 * de Canceladas já vem de `useVendas()`; aqui ele é repetido por segurança.
 */
import type { Venda, Vendedor } from "./types";

export const DESAFIO = {
  titulo: "DESAFIO LB — META DE R$ 1 MILHÃO",
  inicio: "2026-11-26",
  fim: "2026-12-07",
  metaColetiva: 1_000_000,
  metaIndividual: 200_000,
  /** Nomes oficiais do desafio — não alterar. */
  participantes: ["Adriel", "Joyce Santos", "Juliana", "Kathiely Santos", "William Narciso"],
} as const;

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Os 12 dias do desafio, em "AAAA-MM-DD". */
export const DIAS_DESAFIO: string[] = (() => {
  const out: string[] = [];
  const [y, m, d] = DESAFIO.inicio.split("-").map(Number);
  const fim = DESAFIO.fim;
  for (let i = 0; i < 40; i++) {
    const k = chaveDia(new Date(y, m - 1, d + i));
    out.push(k);
    if (k === fim) break;
  }
  return out;
})();

/** Meta diária de referência (R$ 200.000 / 12 dias). */
export const META_DIARIA = DESAFIO.metaIndividual / DIAS_DESAFIO.length;

export function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dia efetivo da venda: a parte de data do registro (mesma regra do ciclo de produção). */
export function diaDaVenda(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : chaveDia(new Date(data));
}

export function rotuloDia(chave: string): { data: string; semana: string } {
  const [y, m, d] = chave.split("-").map(Number);
  return { data: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`, semana: DIAS_SEMANA[new Date(y, m - 1, d).getDay()] };
}

export function slugDe(nome: string): string {
  return normalizar(nome).replace(/ /g, "-");
}

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type Participante = {
  nome: string;
  slug: string;
  vendedorId?: string;
  /** Preenchido quando o vínculo com o cadastro não é seguro. */
  problema?: string;
};

/**
 * Liga cada nome oficial ao cadastro que já existe em `vendedores` (nunca cria).
 * 1º nome completo igual; senão, cadastros que começam pelo nome oficial
 * ("Adriel" → "Adriel Souza"). Entre vários, fica com o único ativo. Se ainda
 * sobrar mais de um, ou nenhum, NÃO adivinha: devolve o problema.
 */
export function resolverParticipantes(vendedores: Pick<Vendedor, "id" | "nome" | "ativo">[]): Participante[] {
  return DESAFIO.participantes.map((nome) => {
    const alvo = normalizar(nome);
    const base = { nome, slug: slugDe(nome) };
    const exatos = vendedores.filter((v) => normalizar(v.nome) === alvo);
    const candidatos = exatos.length ? exatos : vendedores.filter((v) => normalizar(v.nome).startsWith(alvo + " "));
    const escolhidos = candidatos.length > 1 ? candidatos.filter((v) => v.ativo) : candidatos;
    if (escolhidos.length === 1) return { ...base, vendedorId: escolhidos[0].id };
    if (candidatos.length === 0) return { ...base, problema: "Cadastro não encontrado em Vendedores." };
    return {
      ...base,
      problema: `Mais de um cadastro possível: ${candidatos.map((c) => c.nome).join(", ")}.`,
    };
  });
}

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

export type FichaVendedor = Participante & {
  dias: LinhaDia[];
  total: number;
  falta: number;
  pct: number;
  status: StatusDesafio;
  posicao: number;
};

/**
 * Marcação do dia: vendeu → ✓; dia que já passou com zero → X;
 * hoje ainda sem venda e dias futuros → em branco.
 */
export function resultadoDoDia(chave: string, valor: number, hoje: string): ResultadoDia {
  if (valor > 0) return "vendeu";
  return chave < hoje ? "nao_vendeu" : "aguardando";
}

export function statusDe(total: number): StatusDesafio {
  if (total >= DESAFIO.metaIndividual) return "META BATIDA ✓";
  return total > 0 ? "EM ANDAMENTO" : "SEM VENDAS";
}

const arred = (n: number) => Math.round(n * 100) / 100;

/** Fichas de todos os participantes, já com a posição no ranking do desafio. */
export function calcularDesafio(
  participantes: Participante[],
  vendas: Pick<Venda, "vendedorId" | "valor" | "data" | "status">[],
  hoje: string,
): FichaVendedor[] {
  const dentro = new Set(DIAS_DESAFIO);
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

  const fichas = participantes.map((p) => {
    const porDia = (p.vendedorId && soma.get(p.vendedorId)) || new Map<string, number>();
    let acumulado = 0;
    const dias = DIAS_DESAFIO.map((chave) => {
      const valor = porDia.get(chave) ?? 0;
      acumulado = arred(acumulado + valor);
      return {
        chave,
        valor,
        acumulado,
        falta: Math.max(0, arred(DESAFIO.metaIndividual - acumulado)),
        resultado: resultadoDoDia(chave, valor, hoje),
        futuro: chave > hoje,
      };
    });
    const total = acumulado;
    return {
      ...p,
      dias,
      total,
      falta: Math.max(0, arred(DESAFIO.metaIndividual - total)),
      pct: (total / DESAFIO.metaIndividual) * 100,
      status: statusDe(total),
      posicao: 0,
    };
  });

  const ordem = [...fichas].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  ordem.forEach((f, i) => {
    f.posicao = i + 1;
  });
  return ordem;
}

export function totaisDaEquipe(fichas: Pick<FichaVendedor, "total">[]) {
  const total = arred(fichas.reduce((a, f) => a + f.total, 0));
  return {
    total,
    falta: Math.max(0, arred(DESAFIO.metaColetiva - total)),
    pct: (total / DESAFIO.metaColetiva) * 100,
  };
}

/** Contagem regressiva até 07/12 (contando hoje). */
export function diasRestantes(hoje: string): { dias: number; texto: string } {
  if (hoje > DESAFIO.fim) return { dias: 0, texto: "Desafio encerrado" };
  const [y, m, d] = hoje.split("-").map(Number);
  const [fy, fm, fd] = DESAFIO.fim.split("-").map(Number);
  const dias = Math.round((Date.UTC(fy, fm - 1, fd) - Date.UTC(y, m - 1, d)) / 86_400_000) + 1;
  if (hoje < DESAFIO.inicio) {
    const [iy, im, id] = DESAFIO.inicio.split("-").map(Number);
    const ate = Math.round((Date.UTC(iy, im - 1, id) - Date.UTC(y, m - 1, d)) / 86_400_000);
    return { dias: DIAS_DESAFIO.length, texto: `Começa em ${ate} dia${ate === 1 ? "" : "s"}` };
  }
  if (dias === 1) return { dias, texto: "ÚLTIMO DIA!" };
  return { dias, texto: `Faltam ${dias} dias (contando hoje)` };
}
