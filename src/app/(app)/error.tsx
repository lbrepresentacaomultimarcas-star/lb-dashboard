"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro na app:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="max-w-md text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-[var(--color-danger)]" />
        <CardTitle>Algo deu errado</CardTitle>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">
          {error.message || "Erro inesperado. Tente novamente."}
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs text-[var(--color-text-dim)]">
            #{error.digest}
          </p>
        )}
        <Button onClick={reset} className="mt-4">
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      </Card>
    </div>
  );
}
