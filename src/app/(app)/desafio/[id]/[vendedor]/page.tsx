"use client";

import { useParams } from "next/navigation";
import { FichaDesafio } from "@/components/desafio/ficha-desafio";
import { useDesafioDaRota } from "@/components/desafio/use-desafio-da-rota";

export default function FichaDesafioPage() {
  const { vendedor } = useParams<{ vendedor: string }>();
  const { desafio, carregando, bloqueio } = useDesafioDaRota();
  if (carregando) return null;
  if (!desafio) return bloqueio;
  return <FichaDesafio desafio={desafio} vendedorId={vendedor} />;
}
