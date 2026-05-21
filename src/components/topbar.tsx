"use client";

import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { sessionApi, useSession } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/avatar";

export function Topbar() {
  const session = useSession();
  const router = useRouter();
  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          className="rounded-md p-2 text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] md:hidden"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        {session && <Avatar id={session.id} nome={session.nome} size={36} />}
        <div>
          <p className="text-xs text-[var(--color-text-dim)]">Olá,</p>
          <p className="text-sm font-medium">{session?.nome ?? "Convidado"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-[var(--color-text-dim)] sm:inline">
          {session?.email}
        </span>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await sessionApi.signOut();
            router.push("/login");
          }}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </header>
  );
}
