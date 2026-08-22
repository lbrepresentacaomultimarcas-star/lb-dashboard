"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/store";
import { ehAdmin } from "@/lib/permissions";

/**
 * Buscador de leads da Meta enquanto o CRM está aberto.
 *
 * Por que existe: o plano da Vercel só permite UM disparo automático por dia.
 * Então, além do disparo diário (que varre a noite), o próprio navegador do
 * administrador pede uma busca a cada poucos minutos enquanto o sistema está
 * aberto — que é justamente o horário em que o lead precisa chegar rápido.
 *
 * Não desenha nada na tela e não guarda estado: só chama e ignora o resultado.
 * Erro aqui é silencioso de propósito — não pode atrapalhar quem está usando.
 */

const INTERVALO_MS = 3 * 60 * 1000;

export function SincronizacaoMeta() {
  const session = useSession();
  const admin = ehAdmin(session);

  useEffect(() => {
    if (!admin) return;

    const buscar = () => {
      void fetch("/api/integracoes/meta/sincronizar", { method: "POST" }).catch(() => {});
    };

    // primeira busca logo após abrir, e depois de tempos em tempos
    const inicial = setTimeout(buscar, 15_000);
    const timer = setInterval(buscar, INTERVALO_MS);
    return () => {
      clearTimeout(inicial);
      clearInterval(timer);
    };
  }, [admin]);

  return null;
}
