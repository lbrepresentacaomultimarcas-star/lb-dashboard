import { RoleGuard } from "@/components/role-guard";

export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard minimo="coordenador">{children}</RoleGuard>;
}
