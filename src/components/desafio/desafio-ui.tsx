"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useDesafios, useSession, useVendas } from "@/lib/store";
import { temPermissao } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { calcularDesafio, chaveDia, visivelParaEquipe, type Desafio, type FichaVendedor } from "@/lib/desafio";
import { htmlDesafio, imprimirDesafio } from "@/lib/desafio-impressao";
import { cn } from "@/lib/utils";

export const NAVY = "#0B1F3A";
export const GOLD = "#C9A227";

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pct = (n: number) =>
  `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** "Hoje" no fuso do aparelho; vira sozinho à meia-noite. Nulo até montar (evita divergência no SSR). */
export function useHoje(): string | null {
  const [hoje, setHoje] = useState<string | null>(null);
  useEffect(() => {
    const atualizar = () => setHoje(chaveDia(new Date()));
    atualizar();
    const t = setInterval(atualizar, 60_000);
    return () => clearInterval(t);
  }, []);
  return hoje;
}

/** Quem pode o quê nas telas do desafio. */
export function usePermissoesDesafio() {
  const session = useSession();
  return {
    gestor: temPermissao(session, "supervisor"),
    /** Gerenciar e imprimir / PDF é só do administrador (o representante). */
    admin: temPermissao(session, "admin"),
  };
}

/** Desafios que a equipe vê agora (ativos, do 1º dia até o resultado final). */
export function useDesafiosVisiveis(): Desafio[] {
  const desafios = useDesafios();
  const hoje = useHoje();
  return useMemo(
    () => (hoje ? desafios.filter((d) => visivelParaEquipe(d, hoje)).sort((a, b) => a.fim.localeCompare(b.fim)) : []),
    [desafios, hoje],
  );
}

/** Fichas do desafio, calculadas a partir das vendas do CRM (mesmas do Ranking: sem Canceladas). */
export function useFichas(desafio: Desafio | undefined, hoje: string | null): FichaVendedor[] {
  const vendas = useVendas();
  return useMemo(() => (desafio && hoje ? calcularDesafio(desafio, vendas, hoje) : []), [desafio, vendas, hoje]);
}

export function imprimir(desafio: Desafio, painel: boolean, fichas: FichaVendedor[], todas: FichaVendedor[]) {
  if (!imprimirDesafio(htmlDesafio(desafio, { painel, fichas, todas }))) {
    notify.error("Pop-up bloqueado", "Libere pop-ups deste site para imprimir ou salvar em PDF.");
  }
}

export function BotaoImprimir({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition hover:brightness-110"
      style={{ borderColor: GOLD, color: GOLD, background: "rgba(201,162,39,.08)" }}
    >
      <Printer className="h-4 w-4" aria-hidden /> {children}
    </button>
  );
}

/** Faixa azul-marinho com o dourado embaixo, como no material oficial. */
export function TopoDesafio({
  titulo,
  subtitulo,
  objetivo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  objetivo: string;
  children?: React.ReactNode;
}) {
  return (
    <header
      className="overflow-hidden rounded-2xl text-white"
      style={{ background: NAVY, borderBottom: `6px solid ${GOLD}` }}
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl font-black"
            style={{ border: `2px solid ${GOLD}`, color: GOLD }}
            aria-hidden
          >
            LB
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.3em]" style={{ color: GOLD }}>
              LB REPRESENTAÇÕES
            </p>
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">{titulo}</h1>
            <p className="text-sm text-white/80">{subtitulo}</p>
          </div>
        </div>
        <div className="sm:ml-auto">
          <div className="rounded-xl px-4 py-2 text-center" style={{ border: `1.5px solid ${GOLD}` }}>
            <p className="text-[10px] font-bold tracking-[0.3em]" style={{ color: GOLD }}>
              OBJETIVO
            </p>
            <p className="text-lg font-black">{objetivo}</p>
          </div>
        </div>
      </div>
      {children}
    </header>
  );
}

export function Cartao({
  rotulo,
  valor,
  tom = "creme",
  grande = false,
}: {
  rotulo: string;
  valor: React.ReactNode;
  tom?: "navy" | "creme" | "branco";
  grande?: boolean;
}) {
  return (
    <div
      className={cn("rounded-xl px-4 py-3", grande && "py-4")}
      style={
        tom === "navy"
          ? { background: NAVY, color: "#fff", border: `1.5px solid ${GOLD}` }
          : tom === "creme"
            ? { background: "#F6ECD0", color: NAVY, border: `1.5px solid ${GOLD}` }
            : { background: "#fff", color: NAVY, border: `1.5px solid ${NAVY}` }
      }
    >
      <p
        className="text-[11px] font-extrabold uppercase tracking-[0.15em]"
        style={{ color: tom === "navy" ? GOLD : "#8a6d12" }}
      >
        {rotulo}
      </p>
      <p className={cn("font-black tabular-nums", grande ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl")}>{valor}</p>
    </div>
  );
}

export function SeloStatus({ status }: { status: FichaVendedor["status"] }) {
  const estilo =
    status === "META BATIDA ✓"
      ? { background: "#dcfce7", color: "#166534", borderColor: "#16a34a" }
      : status === "EM ANDAMENTO"
        ? { background: "#fef3c7", color: "#92400e", borderColor: GOLD }
        : { background: "#f1f5f9", color: "#475569", borderColor: "#cbd5e1" };
  return (
    <span className="inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-extrabold" style={estilo}>
      {status}
    </span>
  );
}

/** Barra até a meta, com marcas a cada 10%. */
export function Termometro({ pctAtingido, marcas }: { pctAtingido: number; marcas?: string[] }) {
  const largura = Math.max(0, Math.min(100, pctAtingido));
  return (
    <div>
      <div
        className="relative h-7 overflow-hidden rounded-lg bg-white"
        style={{ border: `2px solid ${NAVY}` }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(largura)}
      >
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-700"
          style={{ width: `${largura}%`, background: `linear-gradient(90deg, ${GOLD}, #e8c95a)` }}
        />
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="absolute inset-y-0 w-px bg-[#0B1F3A]/15" style={{ left: `${(i + 1) * 10}%` }} />
        ))}
      </div>
      {marcas && (
        <div className="mt-1 hidden justify-between text-[11px] font-bold sm:flex" style={{ color: NAVY }}>
          {marcas.map((m, i) => (
            <span key={m} style={i === marcas.length - 1 ? { color: "#8a6d12" } : undefined}>
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
