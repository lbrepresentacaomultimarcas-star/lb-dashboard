"use client";

// Quantos leads estão parados esperando a pessoa que está logada.
//
// Um único lugar responde isso para o sino, para o menu e para o app inteiro —
// se cada tela contasse do seu jeito, o sino diria 3 e o menu diria 4.

import { useMemo } from "react";
import { useCentralLeads, useSession } from "./store";
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
