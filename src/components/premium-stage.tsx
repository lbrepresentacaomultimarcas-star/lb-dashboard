"use client";

import { cn } from "@/lib/utils";

/**
 * Palco premium reutilizável (fundo cinematográfico + partículas + vinheta).
 * Use envolvendo o conteúdo de uma página. Quebra o padding do layout com -m-*.
 */
export function PremiumStage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "lb-stage -m-4 md:-m-6 relative min-h-[calc(100vh-4rem)] overflow-hidden p-4 md:p-6 pb-24 md:pb-6",
        className,
      )}
    >
      {/* estrelas */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 60% 70%, #fff, transparent), radial-gradient(1.5px 1.5px at 80% 20%, rgba(255,255,255,.6), transparent), radial-gradient(1px 1px at 40% 80%, #fff, transparent)",
          backgroundSize: "300px 300px, 400px 400px, 500px 500px, 350px 350px",
        }}
      />
      {/* blobs de luz */}
      <div
        className="lb-drift pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(37,99,255,0.3), transparent 70%)" }}
      />
      <div
        className="lb-drift pointer-events-none absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(124,58,237,0.28), transparent 70%)", animationDelay: "5s" }}
      />
      {/* spark particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="lb-rise absolute rounded-full"
            style={{
              left: `${(i * 8.3 + 5) % 100}%`,
              bottom: `${(i % 4) * 10}%`,
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              background: i % 2 === 0 ? "rgba(59,130,246,.8)" : "rgba(124,58,237,.8)",
              boxShadow: i % 2 === 0 ? "0 0 8px rgba(59,130,246,.7)" : "0 0 8px rgba(124,58,237,.7)",
              animationDuration: `${9 + (i % 4) * 1.6}s`,
              animationDelay: `${(i % 6) * 0.9}s`,
            }}
          />
        ))}
      </div>
      {/* vinheta */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 25%, transparent 50%, rgba(0,0,0,0.45) 100%)" }}
      />

      <div className="relative space-y-6">{children}</div>
    </div>
  );
}
