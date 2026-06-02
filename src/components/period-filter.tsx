"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import {
  type Period,
  type PeriodPreset,
  PERIOD_LABELS,
  PRESET_ORDER,
  dateToInputValue,
  formatPeriodLabel,
  periodFromCustomDates,
  periodFromPreset,
} from "@/lib/period";
import { cn } from "@/lib/utils";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const POPOVER_W = 280;

type Props = {
  period: Period;
  onChange: (p: Period) => void;
  /** Classe extra pro botão (opcional). */
  className?: string;
  /** Lado de abertura. Default "end" (alinha pela direita do trigger). */
  align?: "start" | "end";
};

/**
 * Filtro global de período. Dropdown com 7 presets +
 * intervalo personalizado via 2 inputs de data.
 *
 * Visual: pill premium com ícone calendário + label do período + chevron.
 * Quando aberto, mostra opções estilo radio-list e (se "Personalizado")
 * dois inputs de data com botão "Aplicar".
 */
export function PeriodFilter({ period, onChange, className, align = "end" }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Estado local dos inputs do "Personalizado". Inicializa a partir do
  // período atual e só é atualizado em event handlers (nada de useEffect
  // sincronizando com prop — anti-pattern do React 19).
  const [customFrom, setCustomFrom] = useState(() => dateToInputValue(period.from));
  const [customTo, setCustomTo] = useState(() => dateToInputValue(period.to));

  function calcLeft(r: DOMRect) {
    const left = align === "end" ? r.right - POPOVER_W : r.left;
    return Math.max(8, Math.min(left, window.innerWidth - POPOVER_W - 8));
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

  // se não couber abaixo, abre pra cima
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

  function pickPreset(p: PeriodPreset) {
    if (p === "personalizado") {
      // Ao entrar em "Personalizado", inicia os inputs a partir do
      // período atual (snapshot do que o usuário estava vendo).
      const fromValue = dateToInputValue(period.from);
      const toValue = dateToInputValue(period.to);
      setCustomFrom(fromValue);
      setCustomTo(toValue);
      onChange(periodFromCustomDates(fromValue, toValue));
      return;
    }
    onChange(periodFromPreset(p));
    setOpen(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    if (new Date(customFrom) > new Date(customTo)) return;
    onChange(periodFromCustomDates(customFrom, customTo));
    setOpen(false);
  }

  const isCustom = period.preset === "personalizado";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "lb-glass inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-medium text-white/90 transition-colors hover:border-white/30 hover:bg-white/[0.06]",
          className,
        )}
      >
        <CalendarRange className="h-4 w-4 text-indigo-300" />
        <span className="hidden sm:inline text-white/55 text-[11px] uppercase tracking-wider">
          Período
        </span>
        <span className="text-white">{formatPeriodLabel(period)}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-white/55 transition-transform", open && "rotate-180")}
        />
      </button>

      {open &&
        coords &&
        createPortal(
          <div className="fixed inset-0 z-[99999]" style={{ isolation: "isolate" }}>
            <button
              type="button"
              aria-label="Fechar"
              tabIndex={-1}
              className="absolute inset-0 h-full w-full cursor-default"
              onClick={() => setOpen(false)}
              onContextMenu={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
            />
            <div
              ref={menuRef}
              role="menu"
              onClick={(e) => e.stopPropagation()}
              className="absolute z-10 overflow-hidden rounded-2xl border border-white/15 bg-[#0f1320]/95 shadow-2xl backdrop-blur-md ring-1 ring-black/40"
              style={{ top: coords.top, left: coords.left, width: POPOVER_W }}
            >
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/55">
                  Filtrar por período
                </p>
                <p className="mt-0.5 text-xs text-white/40">{formatPeriodLabel(period)}</p>
              </div>

              <div className="py-1">
                {PRESET_ORDER.map((p) => {
                  const active = period.preset === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => pickPreset(p)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-indigo-500/15 text-indigo-200"
                          : "text-white/85 hover:bg-white/[0.05]",
                      )}
                    >
                      <span>{PERIOD_LABELS[p]}</span>
                      {active && <Check className="h-4 w-4 text-indigo-300" />}
                    </button>
                  );
                })}
              </div>

              {isCustom && (
                <div className="border-t border-white/10 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="period-from"
                        className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-white/55"
                      >
                        De
                      </label>
                      <input
                        id="period-from"
                        type="date"
                        value={customFrom}
                        max={customTo || undefined}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="h-9 w-full rounded-lg border border-white/15 bg-white/[0.04] px-2 text-xs text-white focus:border-indigo-400/60 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="period-to"
                        className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-white/55"
                      >
                        Até
                      </label>
                      <input
                        id="period-to"
                        type="date"
                        value={customTo}
                        min={customFrom || undefined}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="h-9 w-full rounded-lg border border-white/15 bg-white/[0.04] px-2 text-xs text-white focus:border-indigo-400/60 focus:outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={applyCustom}
                    disabled={
                      !customFrom ||
                      !customTo ||
                      new Date(customFrom) > new Date(customTo)
                    }
                    className="mt-3 h-9 w-full rounded-lg bg-indigo-500 text-xs font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Aplicar período
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
