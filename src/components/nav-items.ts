import {
  BarChart3,
  BrainCircuit,
  CalendarClock,
  History,
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
  Wallet,
} from "lucide-react";
import type { Papel, SessionUser } from "@/lib/types";
import { temPermissao } from "@/lib/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  minimo?: Papel;
};

export type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  minimo?: Papel;
};

export const NAV: (NavItem | NavGroup)[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analise", label: "Análise Comercial", icon: BrainCircuit, minimo: "admin" },
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
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, minimo: "coordenador" },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/configuracoes", label: "Configurações", icon: Settings, minimo: "admin" },
];

export function filterNav(session: SessionUser | null): (NavItem | NavGroup)[] {
  const out: (NavItem | NavGroup)[] = [];
  for (const entry of NAV) {
    if ("items" in entry) {
      const filhos = entry.items.filter((it) => !it.minimo || temPermissao(session, it.minimo));
      if (filhos.length > 0) out.push({ ...entry, items: filhos });
    } else if (!entry.minimo || temPermissao(session, entry.minimo)) {
      out.push(entry);
    }
  }
  return out;
}
