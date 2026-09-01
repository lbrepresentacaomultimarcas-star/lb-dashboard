import type { Profile, Vendedor } from "./types";

/**
 * Quem pode RECEBER um negócio.
 *
 * A lista de "Compartilhar" mostrava a tabela de vendedores inteira. Isso
 * deixava escolher duas pessoas que nunca veriam o negócio:
 *
 *   • quem foi desligado (cadastro de vendedor inativo);
 *   • quem tem cadastro de vendedor mas nenhum login ligado a ele — o
 *     negócio some no banco, sem erro nenhum na tela.
 *
 * Um negócio só é visível para quem tem `profiles.vendedor_ref` apontando
 * exatamente para aquele `vendedores.id`. Então destinatário válido é:
 * cadastro ativo + login ativo apontando para ele.
 *
 * É a MESMA regra da função `distribuir_leads()` no banco, e de propósito: a
 * tela só oferece o que o banco vai aceitar. Se divergirem, o admin escolhe
 * alguém e a distribuição recusa sem explicação. Mexeu numa, confira a outra.
 */
export function consultoresQuePodemReceber(
  vendedores: Vendedor[],
  roster: Profile[],
): Vendedor[] {
  const loginAtivoPor = new Map<string, boolean>();
  for (const p of roster) {
    if (p.vendedorRef) loginAtivoPor.set(p.vendedorRef, p.ativo !== false);
  }
  return vendedores.filter((v) => v.ativo && loginAtivoPor.get(v.id) === true);
}

/**
 * Por que este vendedor NÃO pode receber — para explicar em vez de só sumir
 * com a opção da lista.
 */
export function motivoNaoRecebe(
  v: Vendedor,
  roster: Profile[],
): string | null {
  if (!v.ativo) return "cadastro inativo";
  const p = roster.find((r) => r.vendedorRef === v.id);
  if (!p) return "sem login vinculado";
  if (p.ativo === false) return "acesso bloqueado";
  return null;
}

/**
 * O consultor dono deste negócio ainda pode trabalhá-lo?
 *
 * `false` quer dizer que o negócio está PARADO: tem responsável no papel, mas
 * esse responsável não tem login ativo. Ninguém está cuidando desse cliente e
 * ninguém consegue nem vê-lo. É o caso que trava a carteira inteira de quem
 * foi bloqueado — e é dinheiro de anúncio esfriando.
 */
export function donoAtivo(
  vendedorIdDoNegocio: string | undefined | null,
  roster: Profile[],
): boolean {
  if (!vendedorIdDoNegocio) return false; // sem dono não é "parado", é livre
  const p = roster.find((r) => r.vendedorRef === vendedorIdDoNegocio);
  return !!p && p.ativo !== false;
}

/** Está preso: tem dono, mas o dono não pode mais trabalhar. */
export function negocioPreso(
  vendedorIdDoNegocio: string | undefined | null,
  roster: Profile[],
): boolean {
  return !!vendedorIdDoNegocio && !donoAtivo(vendedorIdDoNegocio, roster);
}

/**
 * Divide os negócios entre os consultores em rodízio.
 *
 * Espelha a divisão que o banco faz, só que antes de executar — é o que
 * permite mostrar "vai ficar 6 para cada" ANTES de confirmar. A conta de
 * verdade continua sendo a do banco; esta aqui é a prévia.
 */
export function previaDaDivisao(
  totalNegocios: number,
  quantosConsultores: number,
): number[] {
  if (quantosConsultores <= 0 || totalNegocios <= 0) return [];
  const base = Math.floor(totalNegocios / quantosConsultores);
  const sobra = totalNegocios % quantosConsultores;
  return Array.from({ length: quantosConsultores }, (_, i) => base + (i < sobra ? 1 : 0));
}
