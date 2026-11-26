"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useDesafios, useReady } from "@/lib/store";
import { visivelParaEquipe, type Desafio } from "@/lib/desafio";
import { GOLD, useHoje, usePermissoesDesafio } from "./desafio-ui";

/**
 * O desafio do endereço (/desafio/[id]). A equipe só abre o que está no ar;
 * o administrador abre qualquer um (agendados e histórico).
 */
export function useDesafioDaRota(): { desafio?: Desafio; carregando: boolean; bloqueio?: React.ReactNode } {
  const { id } = useParams<{ id: string }>();
  const ready = useReady();
  const hoje = useHoje();
  const desafios = useDesafios();
  const { admin } = usePermissoesDesafio();
  if (!ready || !hoje) return { carregando: true };
  const desafio = desafios.find((d) => d.id === id);
  if (!desafio || (!admin && !visivelParaEquipe(desafio, hoje))) {
    return {
      carregando: false,
      bloqueio: (
        <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
          <p className="text-lg font-bold">Este desafio não está disponível.</p>
          <Link href="/desafio" className="font-bold underline" style={{ color: GOLD }}>
            Ver o desafio em andamento
          </Link>
        </div>
      ),
    };
  }
  return { desafio, carregando: false };
}
