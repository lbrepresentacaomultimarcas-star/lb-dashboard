"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// useLayoutEffect no client, useEffect no SSR (evita warning)
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function Dropdown({
  trigger,
  children,
  align = "end",
  width = 240,
  /** Opcionalmente exibe um cabeçalho dentro do popover. */
  header,
}: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  width?: number;
  header?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  function calcLeft(r: DOMRect) {
    const left = align === "end" ? r.right - width : r.left;
    return Math.max(8, Math.min(left, window.innerWidth - width - 8));
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom + 6, left: calcLeft(r) });
    }
    setOpen(true);
  }

  // depois de renderizar o menu, mede a altura e vira pra cima se não couber
  useIsoLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 0;
    const margin = 6;
    let top = r.bottom + margin;
    if (menuH > 0 && top + menuH > window.innerHeight - 8) {
      const above = r.top - margin - menuH;
      top = above >= 8 ? above : Math.max(8, window.innerHeight - menuH - 8);
    }
    const left = calcLeft(r);
    setCoords((c) => (c && c.top === top && c.left === left ? c : { top, left }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScrollResize() {
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="rounded p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        aria-label="Ações"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open &&
        coords &&
        createPortal(
          // camada acima de tudo (portal no body → fora do stacking context dos cards)
          <div className="fixed inset-0 z-[99999]" style={{ isolation: "isolate" }}>
            {/* backdrop: captura clique/hover e impede os cards de baixo de reagir */}
            <button
              type="button"
              aria-label="Fechar menu"
              tabIndex={-1}
              className="absolute inset-0 h-full w-full cursor-default"
              onClick={() => setOpen(false)}
              onContextMenu={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
            />
            {/* menu flutuante, totalmente opaco */}
            <div
              ref={menuRef}
              role="menu"
              className="absolute z-10 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl ring-1 ring-black/40"
              style={{ top: coords.top, left: coords.left, width }}
              onClick={(e) => e.stopPropagation()}
            >
              {header}
              <div className="py-1">{children(close)}</div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function DropdownItem({
  onClick,
  icon,
  hint,
  danger = false,
  disabled = false,
  children,
}: {
  onClick?: () => void;
  icon?: React.ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
        disabled
          ? "cursor-not-allowed text-[var(--color-text-dim)]/50"
          : danger
            ? "text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
            : "text-[var(--color-text)] hover:bg-[var(--color-surface-2)]",
      )}
    >
      {icon && <span className="shrink-0 opacity-70">{icon}</span>}
      <span className="flex-1">
        {children}
        {hint && (
          <span className="ml-2 text-xs text-[var(--color-text-dim)]">{hint}</span>
        )}
      </span>
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 border-t border-[var(--color-border)]" />;
}
