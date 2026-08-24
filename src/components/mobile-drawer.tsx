"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/store";
import { filterNav } from "@/components/nav-items";
import { usePendentes } from "@/lib/use-pendentes";
import { Logo } from "@/components/logo";
import { useMobileNav } from "@/components/mobile-nav-context";

/**
 * Drawer lateral mobile (slide-in da esquerda) com a navegação completa.
 * Controlado pelo MobileNavContext — abre pelo botão hamburger da topbar
 * ou pelo "Menu" da bottom navigation.
 */
export function MobileDrawer() {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();
  const session = useSession();
  const nav = filterNav(session);
  const pendentes = usePendentes();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, setOpen]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 md:hidden",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={cn(
          "absolute inset-0 bg-black/60 transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Painel */}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--color-border)] px-4">
          <div className="flex items-center gap-2">
            <Logo size={32} />
            <span className="text-sm font-semibold">LB Representações</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-2 text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((entry, i) =>
            "items" in entry ? (
              <div key={`g-${i}`} className="pt-2">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                  {entry.label}
                </p>
                {entry.items.map((it) => {
                  const Icon = it.icon;
                  const active = pathname === it.href || pathname.startsWith(it.href + "/");
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                        active
                          ? "bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                          : "text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {it.label}
                      {it.href === "/central" && pendentes > 0 && (
                        <span
                          className="ml-auto grid min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-bold leading-5 text-white tabular-nums"
                          style={{ background: "var(--color-danger)" }}
                        >
                          {pendentes > 99 ? "99+" : pendentes}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ) : (
              (() => {
                const Icon = entry.icon;
                const active = pathname === entry.href || pathname.startsWith(entry.href + "/");
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                      active
                        ? "bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                        : "text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {entry.label}
                  </Link>
                );
              })()
            ),
          )}
        </nav>
      </aside>
    </div>
  );
}
