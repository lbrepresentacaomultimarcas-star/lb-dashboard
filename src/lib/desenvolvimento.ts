/**
 * PLANO DE DESENVOLVIMENTO — regras puras (sem React, sem banco).
 *
 * Três peças, todas acompanhadas mês a mês pela administração:
 *  - o OBJETIVO, escrito pelo colaborador (`planos_evolucao`, já existia);
 *  - os PASSOS combinados na reunião (admin cadastra, colaborador conclui,
 *    admin valida e dá nota);
 *  - a AVALIAÇÃO MENSAL "Como a empresa te enxerga", sempre com reconhecimento.
 *
 * Nada aqui promove ninguém: evolução de cargo é decisão da administração.
 * As permissões de verdade estão no banco (RLS + gatilhos); a tela só reflete.
 */

export type StatusPasso = "pendente" | "concluido" | "aprovado" | "ajustar";

export type PassoPlano = {
  id: string;
  profileId: string;
  ordem: number;
  titulo: string;
  descricao?: string;
  /** "AAAA-MM-DD" */
  prazo?: string;
  criterio?: string;
  status: StatusPasso;
  comentario?: string;
  concluidoEm?: string;
  nota?: number;
  feedback?: string;
  validadoEm?: string;
  criadoEm?: string;
};

export type Situacao = "verde" | "amarelo" | "vermelho";

export type AvaliacaoMensal = {
  id: string;
  profileId: string;
  /** "AAAA-MM" — o mês avaliado */
  mes: string;
  situacao: Situacao;
  /** quão perto do próximo cargo, 0–100 */
  proximidade: number;
  reconhecimento: string;
  pontosFortes?: string;
  melhorar?: string;
  proximosPassos?: string;
  nota: number;
  avaliadorNome?: string;
  cienciaEm?: string;
  resposta?: string;
  respostaEm?: string;
  /** quando foi publicada pela 1ª vez */
  criadoEm?: string;
  atualizadoEm?: string;
};

export type ConfigDesenvolvimento = {
  diaAvaliacao: number;
  /** "AAAA-MM": o primeiro mês que entra na rotina de avaliação */
  primeiroMes: string;
};

export const CONFIG_DEV_PADRAO: ConfigDesenvolvimento = { diaAvaliacao: 5, primeiroMes: "2026-11" };

export const SITUACAO_INFO: Record<Situacao, { emoji: string; rotulo: string; cor: string }> = {
  verde: { emoji: "🟢", rotulo: "No caminho certo", cor: "#22c55e" },
  amarelo: { emoji: "🟡", rotulo: "Atenção", cor: "#eab308" },
  vermelho: { emoji: "🔴", rotulo: "Fora do caminho", cor: "#ef4444" },
};

export const STATUS_PASSO_INFO: Record<StatusPasso, { rotulo: string; cor: string }> = {
  pendente: { rotulo: "A fazer", cor: "#94a3b8" },
  concluido: { rotulo: "Concluído — aguardando validação", cor: "#38bdf8" },
  aprovado: { rotulo: "Validado", cor: "#22c55e" },
  ajustar: { rotulo: "Precisa ajustar", cor: "#f59e0b" },
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "26/11/2026 às 14:35" (horário de Brasília). Vazio sem data. */
export function dataHoraBR(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const data = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
}

export function chaveHoje(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-11" → "Novembro/2026" */
export function mesRotulo(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1] ?? "?"}/${y}`;
}

/** "2026-11" → "11/2026" */
export function mesCurto(mes: string): string {
  const [y, m] = mes.split("-");
  return `${m}/${y}`;
}

export function somarMeses(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * O mês que JÁ deveria estar avaliado hoje (mesma regra do banco):
 * a partir do dia fixo, o mês anterior; antes dele, o retrasado.
 * Ex.: dia 5 → em 05/12 cobra novembro; em 04/12 ainda cobra outubro.
 */
export function mesDevido(hoje: string, diaAvaliacao: number): string {
  const [y, m, d] = hoje.split("-").map(Number);
  const atual = `${y}-${String(m).padStart(2, "0")}`;
  return somarMeses(atual, d >= diaAvaliacao ? -1 : -2);
}

/** O mês sugerido para uma nova avaliação: o último mês fechado. */
export function mesParaAvaliar(hoje: string): string {
  return somarMeses(hoje.slice(0, 7), -1);
}

/** Próxima data da avaliação mensal ("AAAA-MM-DD"). */
export function proximaDataAvaliacao(hoje: string, diaAvaliacao: number): string {
  const [y, m, d] = hoje.split("-").map(Number);
  const base = d <= diaAvaliacao ? new Date(y, m - 1, diaAvaliacao) : new Date(y, m, diaAvaliacao);
  return chaveHoje(base);
}

/** A rotina já cobra avaliação deste mês? */
export function avaliacaoEmDia(mes: string, cfg: ConfigDesenvolvimento): boolean {
  return mes >= cfg.primeiroMes;
}

// ------------------------------------------------------------------ passos

export function progressoPassos(passos: Pick<PassoPlano, "status">[]) {
  const total = passos.length;
  const validados = passos.filter((p) => p.status === "aprovado").length;
  return { validados, total, pct: total ? Math.round((validados / total) * 100) : 0 };
}

export function passoAtrasado(p: Pick<PassoPlano, "status" | "prazo">, hoje: string): boolean {
  return Boolean(p.prazo) && p.prazo! < hoje && (p.status === "pendente" || p.status === "ajustar");
}

export function mediaNotas(passos: Pick<PassoPlano, "status" | "nota">[]): number | null {
  const notas = passos.filter((p) => p.status === "aprovado" && typeof p.nota === "number").map((p) => p.nota!);
  return notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null;
}

export function validarPasso(p: Pick<PassoPlano, "titulo">): string[] {
  return p.titulo.trim() ? [] : ["Informe o título do passo."];
}

// --------------------------------------------------------------- avaliação

export function validarAvaliacao(a: Omit<AvaliacaoMensal, "id" | "profileId">): string[] {
  const e: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(a.mes)) e.push("Escolha o mês avaliado.");
  if (!a.situacao) e.push("Escolha a situação geral.");
  if (!a.reconhecimento.trim()) e.push("O reconhecimento (parabéns) é obrigatório: toda avaliação tem pelo menos um elogio.");
  if (!(a.nota >= 0 && a.nota <= 10)) e.push("A nota do mês vai de 0 a 10.");
  if (!(a.proximidade >= 0 && a.proximidade <= 100)) e.push("A proximidade do próximo cargo vai de 0% a 100%.");
  return e;
}

/** A avaliação mais recente (por mês). */
export function ultimaAvaliacao<T extends Pick<AvaliacaoMensal, "mes">>(lista: T[]): T | undefined {
  return [...lista].sort((a, b) => b.mes.localeCompare(a.mes))[0];
}

// -------------------------------------------------------------- indicadores

export type Funil = { oportunidades: number; agendamentos: number; propostas: number; fechados: number };

function taxa(de: number, para: number): number | null {
  return de > 0 ? Math.round((para / de) * 1000) / 10 : null;
}

/** Conversões oportunidade → agendamento → proposta → fechado (em %). */
export function taxasConversao(f: Funil) {
  return {
    opAg: taxa(f.oportunidades, f.agendamentos),
    agProp: taxa(f.agendamentos, f.propostas),
    propFech: taxa(f.propostas, f.fechados),
    opFech: taxa(f.oportunidades, f.fechados),
  };
}

/** Variação em % em relação ao mês anterior. `null` sem base de comparação. */
export function variacao(atual: number, anterior: number): { pct: number; sentido: "subiu" | "caiu" | "igual" } | null {
  if (anterior === 0) return atual === 0 ? { pct: 0, sentido: "igual" } : null;
  const pct = Math.round(((atual - anterior) / anterior) * 1000) / 10;
  return { pct, sentido: pct > 0 ? "subiu" : pct < 0 ? "caiu" : "igual" };
}

// ------------------------------------------------------------------- banco

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null || v === "" ? undefined : String(v));
const n = (v: unknown) => (v == null || v === "" ? undefined : Number(v));

export function passoFromDb(r: Row): PassoPlano {
  return {
    id: String(r.id),
    profileId: String(r.profile_id),
    ordem: Number(r.ordem ?? 0),
    titulo: String(r.titulo ?? ""),
    descricao: s(r.descricao),
    prazo: s(r.prazo)?.slice(0, 10),
    criterio: s(r.criterio),
    status: (s(r.status) ?? "pendente") as StatusPasso,
    comentario: s(r.comentario),
    concluidoEm: s(r.concluido_em),
    nota: n(r.nota),
    feedback: s(r.feedback),
    validadoEm: s(r.validado_em),
    criadoEm: s(r.criado_em),
  };
}

export function passoToDb(p: Partial<PassoPlano>): Row {
  const o: Row = {};
  if (p.profileId !== undefined) o.profile_id = p.profileId;
  if (p.ordem !== undefined) o.ordem = p.ordem;
  if (p.titulo !== undefined) o.titulo = p.titulo.trim();
  if (p.descricao !== undefined) o.descricao = p.descricao?.trim() || null;
  if (p.prazo !== undefined) o.prazo = p.prazo || null;
  if (p.criterio !== undefined) o.criterio = p.criterio?.trim() || null;
  if (p.status !== undefined) o.status = p.status;
  if (p.comentario !== undefined) o.comentario = p.comentario?.trim() || null;
  if (p.nota !== undefined) o.nota = p.nota ?? null;
  if (p.feedback !== undefined) o.feedback = p.feedback?.trim() || null;
  return o;
}

export function avaliacaoFromDb(r: Row): AvaliacaoMensal {
  return {
    id: String(r.id),
    profileId: String(r.profile_id),
    mes: String(r.mes),
    situacao: String(r.situacao) as Situacao,
    proximidade: Number(r.proximidade ?? 0),
    reconhecimento: String(r.reconhecimento ?? ""),
    pontosFortes: s(r.pontos_fortes),
    melhorar: s(r.melhorar),
    proximosPassos: s(r.proximos_passos),
    nota: Number(r.nota ?? 0),
    avaliadorNome: s(r.avaliador_nome),
    cienciaEm: s(r.ciencia_em),
    resposta: s(r.resposta),
    respostaEm: s(r.resposta_em),
    criadoEm: s(r.criado_em),
    atualizadoEm: s(r.atualizado_em),
  };
}

export function avaliacaoToDb(a: Partial<AvaliacaoMensal>): Row {
  const o: Row = {};
  if (a.profileId !== undefined) o.profile_id = a.profileId;
  if (a.mes !== undefined) o.mes = a.mes;
  if (a.situacao !== undefined) o.situacao = a.situacao;
  if (a.proximidade !== undefined) o.proximidade = Math.round(a.proximidade);
  if (a.reconhecimento !== undefined) o.reconhecimento = a.reconhecimento.trim();
  if (a.pontosFortes !== undefined) o.pontos_fortes = a.pontosFortes?.trim() || null;
  if (a.melhorar !== undefined) o.melhorar = a.melhorar?.trim() || null;
  if (a.proximosPassos !== undefined) o.proximos_passos = a.proximosPassos?.trim() || null;
  if (a.nota !== undefined) o.nota = a.nota;
  return o;
}
