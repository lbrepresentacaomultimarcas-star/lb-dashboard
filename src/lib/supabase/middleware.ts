import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { falhaTemporaria } from "@/lib/falha-temporaria";
import { RE_COOKIE_SESSAO, umaVezPorChave, venceEm } from "@/lib/sessao-renovacao";

/**
 * RENOVAÇÃO DA SESSÃO — uma por vez, e só quando precisa.
 *
 * =========================================================================
 * O BUG QUE ESTE ARQUIVO TINHA
 * =========================================================================
 *
 * Os cookies renovados eram gravados SÓ na resposta, nunca na requisição.
 * Isso quebra a mesma requisição no meio:
 *
 *   1. o proxy roda, vê o token vencido e renova com o refresh token R1;
 *      o Supabase ROTACIONA e devolve R2. O proxy grava R2 na RESPOSTA.
 *   2. a requisição segue para a rota, cujo `cookies()` ainda tem **R1** —
 *      porque `request.cookies` nunca foi atualizado.
 *   3. a guarda (`requireSessao`/`requireAdmin`) chama `getUser()`, vê token
 *      vencido e renova DE NOVO — com o **mesmo R1**, que já foi usado.
 *   4. fora da janela de tolerância do Supabase, a resposta é
 *      **"Invalid Refresh Token: Already Used"**.
 *   5. `getUser()` devolve `{ user: null, error }`, a guarda responde 401 e o
 *      SentinelaAcesso encerra a sessão e manda para o login.
 *
 * Era esse o "CRM fechando sozinho": DUAS renovações por requisição
 * protegida, com o mesmo refresh token. E `/api/sessao/estado` é chamado a
 * cada 60 segundos e a cada vez que a aba volta ao foco.
 *
 * =========================================================================
 * AS TRÊS CORREÇÕES
 * =========================================================================
 *
 * 1. GRAVAR NOS DOIS LADOS (é o padrão oficial do Supabase para Next).
 *    Com `request.cookies` atualizado, a guarda da mesma requisição já lê o
 *    token NOVO e não renova nada. Duas renovações viram uma.
 *
 * 2. SÓ RENOVAR PERTO DE VENCER. Antes, TODA requisição casada pelo matcher
 *    chamava `getUser()` — inclusive os prefetch do Next, que nos logs de
 *    14/09/2026 pediram `/relatorios` 4x e `/dashboard`, `/analises` e
 *    `/perfil` 3x cada NO MESMO SEGUNDO. Com o token saudável, agora nenhuma
 *    delas renova: some a avalanche.
 *
 * 3. UMA RENOVAÇÃO POR VEZ. No instante em que o token vence, várias
 *    requisições chegam juntas. As que encontram uma renovação em andamento
 *    AGUARDAM e reaproveitam o resultado, em vez de cada uma gastar o mesmo
 *    refresh token.
 *
 * O que NÃO mudou: continua defensivo (nunca 500, nunca derruba a
 * requisição), continua renovando quando precisa, e sessão de verdade
 * inválida continua terminando em 401.
 */

/** Perto de vencer = vale renovar agora. Longe = não mexe. */
const MARGEM_S = 120;

type Biscoito = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Renovações em andamento NESTA instância, indexadas pelo cookie de origem.
 *
 * Escopo de módulo: sobrevive entre invocações na mesma instância serverless,
 * que é exatamente onde a rajada de requisições simultâneas cai. Instâncias
 * diferentes ainda podem coincidir, e para isso existe a janela de tolerância
 * do próprio Supabase — mas a correção nº 2 já reduz a chance a quase nada,
 * porque quase nenhuma requisição chega a pedir renovação.
 */
const emVoo = new Map<string, Promise<Biscoito[]>>();

/** Renova UMA vez, mesmo com várias requisições pedindo ao mesmo tempo. */
function renovarUmaVez(
  chave: string,
  url: string,
  key: string,
  cookiesAtuais: { name: string; value: string }[],
): Promise<Biscoito[]> {
  // nunca rejeita: falha de renovação não pode derrubar a requisição
  return umaVezPorChave(emVoo, chave, async (): Promise<Biscoito[]> => {
    const capturados: Biscoito[] = [];
    try {
      const sb = createServerClient(url, key, {
        cookies: {
          getAll: () => cookiesAtuais,
          setAll: (aGravar) => {
            capturados.push(...aGravar);
          },
        },
      });

      /*
       * `getUser()` NÃO lança quando falha — devolve `{ error }`. Era por isso
       * que o `.catch()` de antes nunca registrava nada, mesmo com os 401
       * aparecendo no log.
       */
      const { error } = await sb.auth.getUser();
      if (error) {
        console.error(
          `[proxy] renovação da sessão falhou (${falhaTemporaria(error) ? "temporária" : "definitiva"}): ${error.message}`,
        );
      }
    } catch (e) {
      console.error("[proxy] renovação da sessão estourou:", e);
    }
    return capturados;
  });
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !key) return response;

    const doSessao = request.cookies.getAll().filter((c) => RE_COOKIE_SESSAO.test(c.name));
    // Visitante sem sessão: não existe nada para renovar.
    if (doSessao.length === 0) return response;

    // CORREÇÃO 2 — token longe de vencer não é renovado. Aqui morre a rajada
    // de prefetch: várias requisições no mesmo segundo, nenhuma renovação.
    const vence = venceEm(doSessao);
    const agora = Math.floor(new Date().getTime() / 1000);
    if (vence !== null && vence - agora > MARGEM_S) return response;

    // CORREÇÃO 3 — uma renovação por vez, compartilhada entre as simultâneas.
    const chave = doSessao.map((c) => `${c.name}=${c.value}`).join("|");
    const novos = await renovarUmaVez(chave, url, key, request.cookies.getAll());

    /*
     * CORREÇÃO 1 — grava nos DOIS lados.
     *
     * Em `request.cookies` para que a guarda desta mesma requisição já leia o
     * token novo e NÃO renove de novo com o refresh token velho. Em
     * `response.cookies` para que o navegador guarde o token novo.
     *
     * A resposta é recriada depois de mexer na requisição: é assim que o Next
     * repassa os cabeçalhos alterados adiante.
     */
    if (novos.length > 0) {
      for (const { name, value } of novos) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of novos) {
        try {
          response.cookies.set(name, value, options);
        } catch {
          // Cookie setter pode falhar em alguns ambientes — não bloqueia
        }
      }
    }
  } catch (e) {
    console.error("[proxy] fatal, devolvendo response sem refresh:", e);
  }

  return response;
}
