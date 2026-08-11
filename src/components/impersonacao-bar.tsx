"use client";

import { useState } from "react";
import { Eye, LogOut } from "lucide-react";
import { impersonacaoApi, useImpersonacao, useSession } from "@/lib/store";
import { notify } from "@/lib/notify";

/**
 * Faixa de aviso do "Entrar como consultor".
 *
 * Só aparece quando o admin está visualizando o sistema como outra pessoa —
 * fora disso não renderiza nada (zero impacto no layout normal).
 */
export function ImpersonacaoBar() {
  const admin = useImpersonacao();
  const atual = useSession();
  const [saindo, setSaindo] = useState(false);

  if (!admin || !atual) return null;

  async function voltar() {
    setSaindo(true);
    try {
      await impersonacaoApi.sair();
      notify.success("Você voltou para a sua conta de administrador");
    } catch {
      notify.error("Não foi possível voltar — recarregue a página");
    } finally {
      setSaindo(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-400/40 bg-amber-400/12 px-3 py-2 md:px-5">
      <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-amber-200 sm:text-sm">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="truncate">
          VOCÊ ESTÁ ACESSANDO COMO:{" "}
          <strong className="text-amber-100">{atual.nome.toUpperCase()}</strong>
        </span>
      </p>
      <button
        type="button"
        onClick={() => void voltar()}
        disabled={saindo}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-[#1a1300] transition hover:bg-amber-300 disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5" />
        {saindo ? "Voltando…" : "VOLTAR PARA ADMIN"}
      </button>
    </div>
  );
}
