"use client";

/**
 * Boundary global — captura erros que estouram no root layout (onde o error.tsx
 * de segmento não alcança). Precisa renderizar a própria <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#06070d",
          color: "#e8e8f0",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Algo deu muito errado
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, opacity: 0.7 }}>
            {error.message || "Erro inesperado na aplicação."}
          </p>
          {error.digest && (
            <p style={{ marginTop: 4, fontSize: 12, fontFamily: "monospace", opacity: 0.5 }}>
              #{error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 18px",
              borderRadius: 10,
              border: "1px solid #2a2a3a",
              background: "#6366f1",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
