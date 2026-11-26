"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/store";
import { gerarLembretesDesenvolvimento } from "@/lib/desenvolvimento-api";

/**
 * Ao abrir o CRM, pede ao banco os lembretes do dia do Plano de
 * Desenvolvimento (avaliações pendentes para o admin; objetivo, passos
 * atrasados e avaliação sem ciência para o colaborador). O banco não repete
 * o mesmo aviso; aqui só evitamos chamar mais de uma vez por dia e aparelho.
 */
export function LembretesDesenvolvimento() {
  const session = useSession();
  const id = session?.id;
  useEffect(() => {
    if (!id) return;
    const chave = `lb:dev_lembretes:${id}:${new Date().toDateString()}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, "1");
    } catch {
      /* sem armazenamento: chama mesmo assim, o banco não duplica */
    }
    const t = setTimeout(() => {
      gerarLembretesDesenvolvimento().catch(() => {
        /* antes da migração a função não existe: sem lembretes, sem erro */
      });
    }, 4000);
    return () => clearTimeout(t);
  }, [id]);
  return null;
}
