"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useReady, useSession } from "@/lib/store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const ready = useReady();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  if (!ready || !session) {
    return (
      <div className="flex h-screen items-center justify-center text-[var(--color-text-dim)]">
        Carregando…
      </div>
    );
  }
  return <>{children}</>;
}
