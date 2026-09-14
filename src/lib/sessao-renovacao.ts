/**
 * As duas peças da renovação de sessão, fora do middleware para poderem ser
 * testadas sem rede e sem runtime do Next.
 *
 * Nada aqui fala com o Supabase: uma peça LÊ quando a sessão vence, a outra
 * garante que uma operação rode UMA vez por chave. Quem junta as duas com o
 * `getUser()` é `supabase/middleware.ts`.
 */

/** Só o cookie de sessão. `-code-verifier` fica de fora de propósito. */
export const RE_COOKIE_SESSAO = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Decodifica base64 sem `Buffer`.
 *
 * O middleware do Next roda no runtime Edge, onde `Buffer` pode não existir.
 * `atob` existe nos dois, e o `TextDecoder` é necessário porque `atob` devolve
 * bytes como string binária — nome de usuário com acento sairia corrompido se
 * lido direto.
 */
function deBase64(b64: string): string {
  const normal = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(normal);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Quando esta sessão vence (epoch em segundos), lido do próprio cookie.
 *
 * `null` = não deu para saber. Nesse caso o chamador deve renovar — que é o
 * comportamento antigo. Melhor renovar à toa do que deixar a sessão vencer.
 *
 * O cookie grande é partido pelo `@supabase/ssr` em `.0`, `.1`… e precisa ser
 * remontado EM ORDEM; fora de ordem o JSON não fecha e a leitura falha em
 * silêncio, levando a renovar sempre.
 */
export function venceEm(cookies: { name: string; value: string }[]): number | null {
  try {
    const bruto = [...cookies]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => c.value)
      .join("");
    if (!bruto) return null;
    const json = bruto.startsWith("base64-") ? deBase64(bruto.slice("base64-".length)) : bruto;
    const sessao = JSON.parse(json) as { expires_at?: number };
    return typeof sessao.expires_at === "number" ? sessao.expires_at : null;
  } catch {
    return null;
  }
}

/**
 * Roda `fabrica()` UMA vez por chave. Quem chegar enquanto ainda está rodando
 * aguarda e recebe o MESMO resultado.
 *
 * É isso que impede duas requisições simultâneas de gastarem o mesmo refresh
 * token — o erro "Invalid Refresh Token: Already Used".
 *
 * O registro é limpo quando a promessa termina (deu certo ou não), então a
 * próxima renovação legítima não fica presa a um resultado velho.
 */
export function umaVezPorChave<T>(
  emVoo: Map<string, Promise<T>>,
  chave: string,
  fabrica: () => Promise<T>,
): Promise<T> {
  const jaEmAndamento = emVoo.get(chave);
  if (jaEmAndamento) return jaEmAndamento;

  const tentativa = fabrica();
  emVoo.set(chave, tentativa);
  // `catch` vazio para a limpeza não virar rejeição sem dono
  void tentativa.then(
    () => emVoo.delete(chave),
    () => emVoo.delete(chave),
  );
  return tentativa;
}
