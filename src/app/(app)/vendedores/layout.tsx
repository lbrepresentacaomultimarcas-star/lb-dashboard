import { RoleGuard } from "@/components/role-guard";

export default function VendedoresLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard minimo="supervisor">{children}</RoleGuard>;
}
