"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  /**
   * Desenhado FORA da árvore de quem chamou (portal para o <body>).
   *
   * Motivo: qualquer ancestral com `transform` (os cards do Pipeline têm a
   * animação de flutuação lb-bob-sm) vira o bloco de referência de
   * `position: fixed`. Sem o portal, o modal deixa de se posicionar pela tela
   * e se posiciona pelo card — foi o que fazia a janela aparecer por cima dos
   * outros leads da coluna.
   */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="lb-scroll lb-fade-up relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[rgba(80,120,255,0.22)] bg-[var(--color-surface)] p-6"
        style={{
          boxShadow:
            "0 30px 80px rgba(0,0,0,.6), 0 0 44px -12px rgba(37,99,255,.45), inset 0 1px 0 rgba(255,255,255,.06)",
        }}
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-brand)]/15 text-[var(--color-brand)]">
                {icon}
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold">{title}</h3>
              {subtitle && (
                <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
