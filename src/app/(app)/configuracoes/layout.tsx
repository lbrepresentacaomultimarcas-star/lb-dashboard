import { RoleGuard } from "@/components/role-guard";

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard minimo="admin">{children}</RoleGuard>;
}
