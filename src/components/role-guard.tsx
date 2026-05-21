"use client";

import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { useSession } from "@/lib/store";
import { temPermissao } from "@/lib/permissions";
import type { Papel } from "@/lib/types";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Bloqueia renderização se o usuário não tem papel suficiente.
 * Use dentro de páginas protegidas (depois do AuthGuard).
 */
export function RoleGuard({
  minimo,
  children,
}: {
  minimo: Papel;
  children: React.ReactNode;
}) {
  const session = useSession();
  if (!temPermissao(session, minimo)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md text-center">
          <ShieldOff className="mx-auto mb-3 h-10 w-10 text-[var(--color-warn)]" />
          <CardTitle>Acesso restrito</CardTitle>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            Esta área só pode ser acessada por administradores. Se acha que isso é
            um erro, fale com o admin da sua empresa.
          </p>
          <Link href="/dashboard">
            <Button variant="secondary" className="mt-4">
              Voltar ao dashboard
            </Button>
          </Link>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
