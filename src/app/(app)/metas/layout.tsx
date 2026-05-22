import { RoleGuard } from "@/components/role-guard";

export default function MetasLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard minimo="supervisor">{children}</RoleGuard>;
}
