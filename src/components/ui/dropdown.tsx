"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        aria-label="Ações"
      >
        {trigger}
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full z-30 mt-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl",
            align === "end" ? "right-0" : "left-0",
          )}
          style={{ width }}
        >
          {header}
          <div className="py-1">{children(() => setOpen(false))}</div>
        </div>
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
