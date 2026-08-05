"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Award,
  BarChart3,
  Bot,
  BrainCircuit,
  CalendarClock,
  ChevronDown,
  History,
  Inbox,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Palette,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Target,
  Trophy,
  UserCircle,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabaseEnabled } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
import { useSession } from "@/lib/store";
import { temPermissao } from "@/lib/permissions";
import type { Papel } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Papel mínimo pra ver esse item. Default: vendedor. */
  minimo?: Papel;
};

type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  minimo?: Papel;
};

const NAV: (NavItem | NavGroup)[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "Central de Leads",
    icon: Inbox,
    items: [
      { href: "/central", label: "Fila de Leads", icon: Inbox },
      { href: "/central/painel", label: "Painel do Gestor", icon: BarChart3, minimo: "supervisor" },
    ],
  },
  { href: "/equipe", label: "Minha Equipe", icon: UsersRound, minimo: "lider" },
  { href: "/analise", label: "Análise Comercial", icon: BrainCircuit, minimo: "admin" },
  { href: "/ia", label: "Central de IA", icon: Bot, minimo: "admin" },
  {
    label: "Gameficação",
    icon: Trophy,
    items: [
      { href: "/ranking", label: "Rankings", icon: Trophy },
      { href: "/performance", label: "Performance", icon: Sparkles },
      { href: "/configuracoes/temporadas", label: "Temporadas", icon: Palette, minimo: "admin" },
      { href: "/metas", label: "Metas mensais", icon: Target, minimo: "supervisor" },
    ],
  },
  {
    label: "Negócios",
    icon: ShoppingCart,
    items: [
      { href: "/vendas", label: "Vendas", icon: ShoppingCart },
      { href: "/leads", label: "Pipeline / Leads", icon: Sparkles },
      { href: "/oportunidades", label: "Oportunidades", icon: Lightbulb },
      { href: "/consorcio", label: "Consórcio", icon: Landmark },
      { href: "/resultados", label: "Resultados LB", icon: Award },
      { href: "/clientes", label: "Clientes", icon: UserCircle },
    ],
  },
  {
    label: "Administrativo",
    icon: Users,
    minimo: "admin",
    items: [
      { href: "/admin/colaboradores", label: "Colaboradores", icon: Shield, minimo: "admin" },
      { href: "/admin/equipes", label: "Equipes", icon: Users, minimo: "admin" },
      { href: "/admin/producoes", label: "Produções", icon: BarChart3, minimo: "admin" },
      { href: "/admin/fechamento", label: "Fechamento", icon: CalendarClock, minimo: "admin" },
      { href: "/admin/performance", label: "Índice de Performance", icon: Trophy, minimo: "admin" },
      { href: "/vendedores", label: "Vendedores", icon: Users, minimo: "supervisor" },
    ],
  },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, minimo: "coordenador" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/historico", label: "Histórico", icon: History, minimo: "supervisor" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, minimo: "admin" },
];

function isGroupActive(group: NavGroup, pathname: string) {
  return group.items.some(
    (it) => pathname === it.href || pathname.startsWith(it.href + "/"),
  );
}

function Item({
  item,
  pathname,
  indent = false,
}: {
  item: NavItem;
  pathname: string;
  indent?: boolean;
}) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg py-2 text-sm transition-colors",
        indent ? "pl-9 pr-3" : "px-3",
        active
          ? "bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
          : "text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function Group({ group, pathname }: { group: NavGroup; pathname: string }) {
  const active = isGroupActive(group, pathname);
  const [open, setOpen] = useState(active);
  const Icon = group.icon;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          active
            ? "text-[var(--color-text)]"
            : "text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {group.items.map((it) => (
            <Item key={it.href} item={it} pathname={pathname} indent />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const session = useSession();

  // Filtra NAV pelo papel: itens com `minimo` definido só aparecem se permissão suficiente
  const navVisivel: (NavItem | NavGroup)[] = [];
  for (const entry of NAV) {
    if ("items" in entry) {
      const filhos = entry.items.filter(
        (it) => !it.minimo || temPermissao(session, it.minimo),
      );
      if (filhos.length > 0) navVisivel.push({ ...entry, items: filhos });
    } else if (!entry.minimo || temPermissao(session, entry.minimo)) {
      navVisivel.push(entry);
    }
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex">
      <div className="flex h-16 items-center gap-3 border-b border-[var(--color-border)] px-5">
        <Logo size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            LB Representações
          </p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Dashboard v2.0
          </p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navVisivel.map((entry, i) =>
          "items" in entry ? (
            <Group key={`g-${i}`} group={entry} pathname={pathname} />
          ) : (
            <Item key={entry.href} item={entry} pathname={pathname} />
          ),
        )}
      </nav>
      <div className="border-t border-[var(--color-border)] p-4 text-xs text-[var(--color-text-dim)]">
        {supabaseEnabled ? (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-success)] align-middle" />{" "}
            Conectado ao Supabase
          </>
        ) : (
          "Modo demo — dados locais"
        )}
      </div>
    </aside>
  );
}
