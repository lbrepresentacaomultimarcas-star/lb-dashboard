import "server-only";

export { falhaTemporaria } from "../falha-temporaria";

/**
 * "NÃO CONSEGUI VERIFICAR" NÃO É "VOCÊ NÃO ESTÁ LOGADO".
 *
 * `sb.auth.getUser()` não lança exceção quando falha: ele devolve
 * `{ data: { user: null }, error }`. Lendo só o `data`, uma falha momentânea
 * entre o servidor e o Supabase virava a MESMA resposta 401 de quem está
 * deslogado de verdade.
 *
 * E o `SentinelaAcesso` reage a 401 encerrando a sessão e mandando para o
 * login. Ou seja: um soluço de rede expulsava quem estava trabalhando.
 *
 * ISSO NÃO É HIPÓTESE — está nos logs de produção de 14/09/2026:
 *
 *     08:18:08  GET /api/sessao/estado   200
 *     08:19:08  GET /api/sessao/estado   200
 *     08:20:01  GET /api/sessao/estado   401
 *     08:20:14  GET /login               200   <- usuário expulso
 *
 * 54 segundos entre o 200 e o 401. Token do Supabase dura uma hora, então
 * aquilo não foi expiração: foi renovação que falhou em silêncio.
 *
 * IMPORTANTE: só vale 503 quando a falha é de INFRAESTRUTURA. `getUser()`
 * também devolve erro quando simplesmente não há sessão
 * (`AuthSessionMissingError`) — e esse caso continua sendo 401, senão quem não
 * está logado nunca seria mandado para o login. Quem separa os dois é
 * `falhaTemporaria` (em `lib/falha-temporaria.ts`).
 *
 * A PARTIR DAQUI:
 *   401 → não está logado        · o sentinela expulsa, e está certo
 *   403 → bloqueado pelo admin   · o sentinela expulsa, e está certo
 *   503 → não deu para verificar · o sentinela IGNORA (ele só age em 401/403),
 *                                  a tela mostra um erro comum e a próxima
 *                                  tentativa resolve
 *
 * Fica num arquivo só porque `requireSessao` e `requireAdmin` precisam
 * responder IGUAL. Se cada uma tivesse a própria regra, um dia uma expulsaria
 * e a outra não, no mesmo soluço de rede.
 */

/**
 * Resposta para "não deu para confirmar o acesso".
 *
 * Registra a causa REAL no log do servidor — era justamente ela que estava
 * sendo descartada, e por isso o diagnóstico não aparecia em lugar nenhum.
 */
export function naoConsegui(onde: string, causa?: unknown): Response {
  const motivo =
    causa instanceof Error ? causa.message : typeof causa === "string" ? causa : JSON.stringify(causa);
  console.error(`[sessao] não deu para verificar o acesso (${onde}): ${motivo}`);

  return Response.json(
    {
      error:
        "Não consegui confirmar seu acesso agora. Costuma ser instabilidade momentânea — tente de novo em alguns segundos.",
      indeterminado: true,
      onde,
    },
    { status: 503, headers: { "Retry-After": "5" } },
  );
}
