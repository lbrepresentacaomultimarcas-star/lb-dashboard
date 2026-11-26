"use client";

// Quantos leads estão parados esperando a pessoa que está logada.
//
// Um único lugar responde isso para o sino, para o menu e para o app inteiro —
// se cada tela contasse do seu jeito, o sino diria 3 e o menu diria 4.

import { useMemo } from "react";
import { notificacoesApi, useCentralLeads, useNotificacoes, useSession } from "./store";
import type { Notificacao } from "./types";
import { temPermissao } from "./permissions";
import { pendentesDe } from "./pendencias";

export function usePendentes(): number {
  const session = useSession();
  const centralLeads = useCentralLeads();
  const admin = temPermissao(session, "admin");
  // Admin conta o que falta distribuir; consultor, o que falta atender.
  return useMemo(
    () => pendentesDe(centralLeads, admin ? undefined : session?.vendedorId).length,
    [centralLeads, admin, session?.vendedorId],
  );
}

/**
 * Avisos do Plano de Desenvolvimento ainda não lidos — o pontinho vermelho do
 * menu, o mesmo número que está no sino:
 *  - `perfil`: o que é do PRÓPRIO usuário (avaliação, passos, promoção) → "Meu Perfil";
 *  - `equipe`: o que o admin precisa ver de alguém da equipe → "Desenvolvimento da equipe".
 */
export function usePendentesDesenvolvimento(): { perfil: number; equipe: number } {
  const notificacoes = useNotificacoes();
  const eu = useSession()?.id;
  return useMemo(() => {
    let perfil = 0;
    let equipe = 0;
    for (const n of notificacoes) {
      // Admin e supervisor também carregam os avisos da EQUIPE: só conta o que é desta pessoa.
      if (n.userId !== eu || n.lida || n.entidade !== "desenvolvimento") continue;
      const link = n.link ?? "";
      if (link === "/perfil") perfil++;
      else if (link.startsWith("/perfil?de=") || link.startsWith("/admin/desenvolvimento")) equipe++;
    }
    return { perfil, equipe };
  }, [notificacoes, eu]);
}

/**
 * Marca como lidos os avisos de desenvolvimento DESTA pessoa cujo link bate
 * (ao abrir a tela). Nunca mexe nos avisos de outra pessoa — admin e supervisor
 * carregam os da equipe também.
 */
export async function lerAvisosDesenvolvimento(
  notificacoes: Notificacao[],
  eu: string | undefined,
  bate: (link: string) => boolean,
) {
  if (!eu) return;
  const alvo = notificacoes.filter(
    (n) => n.userId === eu && !n.lida && n.entidade === "desenvolvimento" && bate(n.link ?? ""),
  );
  await Promise.all(alvo.map((n) => notificacoesApi.marcarLida(n.id).catch(() => undefined)));
}
