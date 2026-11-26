"use client";

import { PainelDesafio } from "@/components/desafio/painel-desafio";
import { useDesafioDaRota } from "@/components/desafio/use-desafio-da-rota";

export default function DesafioPorIdPage() {
  const { desafio, carregando, bloqueio } = useDesafioDaRota();
  if (carregando) return null;
  if (!desafio) return bloqueio;
  return <PainelDesafio desafio={desafio} />;
}
