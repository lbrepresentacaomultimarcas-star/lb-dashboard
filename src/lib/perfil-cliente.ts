/**
 * Perfil comportamental do cliente no Pipeline. Regras puras (sem React, sem
 * banco), para a tela e os testes usarem exatamente a mesma decisão.
 */
import type { Lead, LeadStatus } from "./types";

export type PerfilCliente = {
  id: string;
  chave: string;
  nome: string;
  emoji: string;
  cor: string;
  dica: string;
  ordem: number;
  ativo: boolean;
};

/** Os 4 perfis de fábrica. No banco eles são editáveis; aqui servem ao modo demonstração. */
export const PERFIS_PADRAO: PerfilCliente[] = [
  {
    id: "padrao-confianca",
    chave: "confianca",
    nome: "Confiança",
    emoji: "🤝",
    cor: "#38bdf8",
    dica: "Precisa de relacionamento, segurança e prova social. Tenha calma, seja transparente, mostre depoimentos e explique cada etapa do processo.",
    ordem: 1,
    ativo: true,
  },
  {
    id: "padrao-pressao",
    chave: "pressao",
    nome: "Pressão",
    emoji: "⚡",
    cor: "#f59e0b",
    dica: "Decidido e com urgência. Seja objetivo, apresente uma condição com prazo claro e vá direto para a proposta.",
    ordem: 2,
    ativo: true,
  },
  {
    id: "padrao-pesquisador",
    chave: "pesquisador",
    nome: "Pesquisador",
    emoji: "🔍",
    cor: "#a78bfa",
    dica: "Compara, pede números e simulações e demora a decidir. Leve dados, simulação detalhada e comparativo, e agende o próximo contato.",
    ordem: 3,
    ativo: true,
  },
  {
    id: "padrao-so-conhecendo",
    chave: "so_conhecendo",
    nome: "Só conhecendo",
    emoji: "👀",
    cor: "#94a3b8",
    dica: "Curioso, sem intenção clara de compra agora. Nutra a relação, não pressione e combine quando retomar.",
    ordem: 4,
    ativo: true,
  },
];

/** Etapas em que o cliente ainda não foi atendido. */
const ANTES_DO_ATENDIMENTO = new Set<LeadStatus>(["oportunidade", "primeiro_contato"]);
/** Etapas que só existem depois de o cliente responder. */
const DEPOIS_DO_ATENDIMENTO = new Set<LeadStatus>(["reuniao_agendada", "reuniao", "acompanhamento", "fechamento"]);
/** Onde um perfil vazio vira "pendente" (o negócio ainda está em andamento). */
const EM_ANDAMENTO = new Set<LeadStatus>(["reuniao_agendada", "reuniao", "acompanhamento"]);

/**
 * Mover de `de` para `para` exige escolher o perfil?
 * Só na passagem do "antes" para o "depois" do primeiro atendimento, e só se
 * ainda não houver perfil. Não responde e Perdido nunca exigem.
 * Negócio novo (`de` vazio) conta como saindo de Oportunidade.
 */
export function exigePerfil(de: LeadStatus | undefined, para: LeadStatus, temPerfil: boolean): boolean {
  if (temPerfil) return false;
  return ANTES_DO_ATENDIMENTO.has(de ?? "oportunidade") && DEPOIS_DO_ATENDIMENTO.has(para);
}

/** Negócio já atendido, em andamento e ainda sem perfil. */
export function perfilPendente(l: Pick<Lead, "status" | "perfilClienteId">): boolean {
  return !l.perfilClienteId && EM_ANDAMENTO.has(l.status);
}

export function ordenarPerfis(lista: PerfilCliente[]): PerfilCliente[] {
  return lista.filter((p) => p.ativo).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}
