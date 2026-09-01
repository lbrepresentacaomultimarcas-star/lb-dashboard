"use client";

/*
 * SENTINELA DE ACESSO — a aba que já estava aberta.
 *
 * O bloqueio de verdade acontece no banco e nas rotas: um colaborador
 * bloqueado não lê nem grava mais nada, mesmo pelo DevTools. Só que quem
 * estava com o CRM aberto veria a tela simplesmente parar de funcionar, sem
 * entender por quê.
 *
 * Este componente é a parte humana disso: pergunta ao servidor, de tempos em
 * tempos e sempre que a pessoa volta para a aba, se o acesso continua valendo.
 * Quando não vale mais, encerra a sessão e manda para o login com a mensagem.
 *
 * Não é ele que protege o sistema — se alguém apagar este componente pelo
 * DevTools, o bloqueio continua de pé no banco. Ele existe para o aviso
 * chegar rápido e claro.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { sessionApi, useSession } from "@/lib/store";

/** De quanto em quanto tempo perguntar, com a aba parada em segundo plano. */
const INTERVALO_MS = 60_000;

export function SentinelaAcesso() {
  const session = useSession();
  const router = useRouter();
  const logado = !!session;

  useEffect(() => {
    if (!logado) return;

    let vivo = true;
    let ultimaChecagem = 0;

    async function conferir() {
      // evita rajada quando foco e visibilidade disparam quase juntos
      const agora = new Date().getTime();
      if (agora - ultimaChecagem < 3000) return;
      ultimaChecagem = agora;

      try {
        const r = await fetch("/api/sessao/estado", { cache: "no-store" });
        if (!vivo || r.ok) return;
        if (r.status !== 401 && r.status !== 403) return; // erro de rede: não expulsa ninguém

        const bloqueado = r.status === 403;
        await sessionApi.signOut();
        if (vivo) router.replace(bloqueado ? "/login?bloqueado=1" : "/login");
      } catch {
        /* offline ou servidor fora do ar não é motivo para derrubar a sessão */
      }
    }

    const aoVoltar = () => {
      if (document.visibilityState === "visible") void conferir();
    };

    // a primeira checagem sai do corpo do efeito de propósito
    const inicial = setTimeout(() => void conferir(), 0);
    const timer = setInterval(() => void conferir(), INTERVALO_MS);
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      vivo = false;
      clearTimeout(inicial);
      clearInterval(timer);
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [logado, router]);

  return null;
}
