import { RoleGuard } from "@/components/role-guard";

export default function RelatoriosLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard minimo="coordenador">{children}</RoleGuard>;
}
