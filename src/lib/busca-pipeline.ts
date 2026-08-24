// Localizador de negócios da Pipeline.
//
// Módulo PURO (sem React, sem browser, sem Supabase) para poder ser testado
// isolado — é a parte que erra em silêncio se ninguém olhar: acento, telefone
// formatado, nome do meio.
//
// Não lê nem escreve nada: recebe a lista que a tela já tem (que por sua vez
// já veio filtrada pelo escopo do usuário) e devolve quais entram. Pesquisar
// nunca alcança negócio fora do escopo de quem está logado.

import { LEAD_TIPO_INFO, type Lead } from "./types";

/** Minúsculas e sem acento: quem digita "joao" tem que achar "João". */
export const normalizar = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Telefone comparável: "(79) 99999-9999" vira "79999999999". */
export const soDigitos = (t: string) => t.replace(/\D+/g, "");

/**
 * Um texto normalizado por negócio, pronto para comparar.
 *
 * Construído uma vez por mudança de dados — nunca a cada tecla. É isso que
 * segura o crescimento: digitar custa uma comparação por card, em vez de
 * normalizar todos os campos de todos os cards a cada letra.
 *
 * O telefone entra duas vezes: como está e só com dígitos, para achar tanto
 * quem digita "99999-9999" quanto quem cola "79999999999".
 */
export function indexarLeads(leads: Lead[], nomeDoVendedor: (id?: string) => string): Map<string, string> {
  const idx = new Map<string, string>();
  for (const l of leads) {
    const partes = [
      l.nome,
      l.telefone,
      soDigitos(l.telefone ?? ""),
      l.email,
      l.origem,
      l.tipo ? LEAD_TIPO_INFO[l.tipo].label : "",
      l.vendedorId ? nomeDoVendedor(l.vendedorId) : "sem vendedor",
    ];
    idx.set(l.id, normalizar(partes.filter(Boolean).join(" ")));
  }
  return idx;
}

/**
 * Quebra o que foi digitado em palavras.
 *
 * A busca exige TODAS elas, e não o trecho inteiro: é o que faz "joao silva"
 * achar "João da Silva" — com busca por trecho, o "da" no meio derrubaria o
 * resultado. De quebra, "joao carro" vira um filtro cruzado de graça.
 */
export function termosDaBusca(texto: string): string[] {
  return normalizar(texto.trim()).split(/\s+/).filter(Boolean);
}

/** O negócio atende à busca? */
export function casa(alvo: string | undefined, termos: string[]): boolean {
  if (termos.length === 0) return true;
  if (!alvo) return false;
  return termos.every((t) => alvo.includes(t));
}
