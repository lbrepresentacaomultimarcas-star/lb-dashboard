/**
 * "NÃO CONSEGUI VERIFICAR" versus "VOCÊ NÃO ESTÁ LOGADO".
 *
 * Os dois chegam como erro do Supabase, e tratá-los igual foi o que expulsava
 * quem estava trabalhando. Mas o contrário também é armadilha: tratar TODO erro
 * como temporário faria quem não está logado nunca ser mandado para o login.
 *
 * `getUser()` devolve erro em três situações bem diferentes:
 *
 *   AuthSessionMissingError   não há sessão          → está deslogado MESMO
 *   AuthApiError (400/401/403) token inválido/expirado → está deslogado MESMO
 *   AuthRetryableFetchError   não alcançou o Supabase → NÃO DEU PARA SABER
 *
 * Só o terceiro caso é temporário. A regra abaixo é conservadora de propósito:
 * na dúvida, responde como antes (deslogado). Assim a correção nunca deixa uma
 * sessão inválida passar — no máximo deixa de expulsar alguém por engano.
 */

const REDE = /fetch failed|failed to fetch|network|timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up/i;

/** É falha de infraestrutura (e não "você não está autenticado")? */
export function falhaTemporaria(causa: unknown): boolean {
  if (!causa || typeof causa !== "object") return false;

  const e = causa as { name?: string; status?: number; code?: string; message?: string };

  // O próprio Supabase marca o caso retentável.
  if (e.name === "AuthRetryableFetchError") return true;

  // status 0 = nem saiu da máquina. 5xx = o outro lado caiu.
  if (typeof e.status === "number" && (e.status === 0 || e.status >= 500)) return true;

  // PostgREST não usa `status`; erro de rede chega como mensagem de fetch.
  if (e.message && REDE.test(e.message)) return true;

  // Códigos de rede do Node, quando o erro vem cru.
  if (e.code && REDE.test(e.code)) return true;

  return false;
}
