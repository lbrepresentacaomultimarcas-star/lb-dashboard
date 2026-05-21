"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu, ShoppingCart, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNav } from "@/components/mobile-nav-context";

const ITEMS = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/leads", label: "Pipeline", icon: Sparkles },
  { href: "/ranking", label: "Ranking", icon: Trophy },
  { href: "/vendas", label: "Vendas", icon: ShoppingCart },
];

/**
 * Bottom navigation estilo app nativo — só aparece no mobile (< md).
 * O botão "Menu" abre o drawer com a navegação completa.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { setOpen } = useMobileNav();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {ITEMS.map((it) => {
        const Icon = it.icon;
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              active ? "text-[var(--color-brand)]" : "text-[var(--color-text-dim)]",
            )}
          >
            <Icon className="h-5 w-5" />
            {it.label}
          </Link>
        );
      })}
      <button
        onClick={() => setOpen(true)}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-[var(--color-text-dim)]"
      >
        <Menu className="h-5 w-5" />
        Menu
      </button>
    </nav>
  );
}
