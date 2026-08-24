// Conferência de duplicidade antes de distribuir.
//
// Módulo PURO — sem React, sem Supabase — porque esta é a regra que, se errar,
// entrega o mesmo cliente para dois consultores. Precisa ser testável fora do
// navegador, e é.
//
// Esta é a PRIMEIRA das duas verificações. Ela informa. A segunda, a que
// realmente impede, é a condição que viaja junto do UPDATE em `distribuir` —
// e, abaixo dela, a trigger no banco, que vale para qualquer caminho de
// escrita (webhook, site, importação).

import { chaveTelefone } from "./telefone";
import type { CentralLead, CentralLeadStatus } from "./types";

export type BloqueioDistribuicao = {
  id: string;
  nome: string;
  telefone?: string;
  motivo: "ja_distribuido" | "repetido_na_selecao";
  /** Lead ativo que já tem dono (vazio quando é repetição dentro da seleção). */
  existenteId: string;
  donoId: string;
  donoNome: string;
  status: CentralLeadStatus;
  desdeEm?: string;
};

export type VerificacaoDistribuicao = {
  liberados: string[];
  bloqueados: BloqueioDistribuicao[];
};

/** Lead que ainda disputa dono. Encerrado, excluído ou de teste não disputa. */
export const leadAtivo = (l: CentralLead) => !l.encerradoEm && !l.excluidoEm && !l.teste;

export function conferirDistribuicao(
  selecionados: CentralLead[],
  ativos: CentralLead[],
  paraVendedorId: string,
  nomeDe: (id?: string) => string,
): VerificacaoDistribuicao {
  const liberados: string[] = [];
  const bloqueados: BloqueioDistribuicao[] = [];
  const chavesDoLote = new Set<string>();

  for (const l of selecionados) {
    const chave = chaveTelefone(l.telefone);

    // Sem telefone não dá para AFIRMAR que é a mesma pessoa. Nome igual não
    // basta — "José da Silva" existe às dezenas, e bloquear cliente legítimo
    // é pior do que deixar passar um duplicado. Passa.
    if (!chave) {
      liberados.push(l.id);
      continue;
    }

    // Duas formas de o cliente já ter dono: o próprio lead é de outra pessoa,
    // ou existe OUTRO lead ativo do mesmo telefone que já tem dono. Nos dois
    // casos, trocar de responsável é REDISTRIBUIR, não distribuir.
    const dono =
      l.vendedorId && l.vendedorId !== paraVendedorId
        ? l
        : ativos.find(
            (c) =>
              c.id !== l.id &&
              chaveTelefone(c.telefone) === chave &&
              c.vendedorId &&
              c.vendedorId !== paraVendedorId,
          );

    if (dono) {
      bloqueados.push({
        id: l.id,
        nome: l.nome,
        telefone: l.telefone,
        motivo: "ja_distribuido",
        existenteId: dono.id,
        donoId: dono.vendedorId as string,
        donoNome: nomeDe(dono.vendedorId),
        status: dono.status,
        desdeEm: dono.distribuidoEm ?? dono.recebidoEm,
      });
      continue;
    }

    // Mesmo cliente marcado duas vezes na própria seleção: só o primeiro vai.
    if (chavesDoLote.has(chave)) {
      bloqueados.push({
        id: l.id,
        nome: l.nome,
        telefone: l.telefone,
        motivo: "repetido_na_selecao",
        existenteId: "",
        donoId: "",
        donoNome: "",
        status: l.status,
      });
      continue;
    }
    chavesDoLote.add(chave);
    liberados.push(l.id);
  }

  return { liberados, bloqueados };
}
