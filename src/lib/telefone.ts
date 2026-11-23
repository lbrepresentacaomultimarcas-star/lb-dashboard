// Identidade do cliente por TELEFONE.
//
// Módulo PURO — testável fora do navegador, e é o mesmo cálculo que o banco faz
// na coluna gerada `telefone_chave`. Se os dois divergirem, a proteção vaza:
// por isso a regra mora aqui e está copiada em SQL na migration, com o mesmo
// nome e o mesmo comentário.
//
// O problema real que isto resolve: o mesmo número chega em formatos
// diferentes conforme a porta de entrada —
//
//   Meta Ads          → "+5579999571712"
//   Site / simulação  → "(79) 99957-1712"
//   WhatsApp          → "5579999571712"
//
// Comparar texto com texto trata os três como pessoas diferentes. Foi assim
// que um mesmo cliente foi parar com três consultores ao mesmo tempo.

/** Só os dígitos. */
export const soDigitos = (t?: string | null): string => (t ?? "").replace(/\D+/g, "");

/**
 * Chave de comparação: DDD + os 8 últimos dígitos.
 *
 * Duas decisões, ambas por causa de como o número brasileiro varia:
 *
 *  • O DDI (55) sai. "+5579…" e "79…" são a mesma pessoa.
 *  • O nono dígito sai. "(79) 9957-1712" (antigo) e "(79) 99957-1712" (novo)
 *    são a mesma linha — comparar os 8 finais resolve sem depender de saber
 *    qual formato a operadora usou naquele cadastro.
 *
 * O DDD é mantido de propósito: só os 8 finais fariam um número de Aracaju
 * colidir com um de São Paulo, e bloquear cliente legítimo é pior do que
 * deixar passar um duplicado.
 *
 * Número que não couber no formato brasileiro volta como veio (só dígitos) —
 * melhor comparar algo do que devolver vazio e liberar tudo.
 */
export function chaveTelefone(t?: string | null): string {
  let d = soDigitos(t);
  if (!d) return "";
  // prefixo internacional discado ("00" + DDI), quando alguém salvou assim
  if (d.length > 13 && d.startsWith("00")) d = d.slice(2);
  // DDI do Brasil, quando presente
  if (d.length >= 12 && d.length <= 13 && d.startsWith("55")) d = d.slice(2);
  // esperado: 10 (DDD + 8) ou 11 (DDD + 9 + 8)
  if (d.length === 10 || d.length === 11) return d.slice(0, 2) + d.slice(-8);
  return d;
}

/** Duas linhas são da mesma pessoa? Sem telefone, não dá para afirmar. */
export function mesmoTelefone(a?: string | null, b?: string | null): boolean {
  const ka = chaveTelefone(a);
  const kb = chaveTelefone(b);
  return ka !== "" && ka === kb;
}

/** Formato de leitura para telas e avisos: (79) 99957-1712. */
export function telefoneBonito(t?: string | null): string {
  let d = soDigitos(t);
  if (d.length > 13 && d.startsWith("00")) d = d.slice(2);
  if (d.length >= 12 && d.length <= 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t ?? "";
}

/**
 * Número completo para WhatsApp e ligação (DDI + DDD + número), ou null quando
 * não dá para discar com segurança. Só calcula para o link: o dado salvo não muda.
 *
 * O tamanho decide, nunca o começo do número: "(55) 99999-1234" é um celular do
 * DDD 55 (RS), com 11 dígitos, e não um número que "já tem DDI". Sem DDD (8 ou 9
 * dígitos) não existe como adivinhar a cidade, então não gera link errado.
 */
export function numeroDiscavel(t?: string | null): string | null {
  const original = (t ?? "").trim();
  let d = soDigitos(original);
  if (!d) return null;
  if (d.length > 13 && d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if (original.startsWith("+") && !d.startsWith("55")) return d.length >= 8 ? d : null;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if (d.length < 10) return null;
  return d;
}

export function linkWhatsapp(t?: string | null, texto?: string): string | null {
  const n = numeroDiscavel(t);
  if (!n) return null;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

export function linkLigacao(t?: string | null): string | null {
  const n = numeroDiscavel(t);
  return n ? `tel:+${n}` : null;
}
