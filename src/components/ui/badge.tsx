import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warn" | "danger" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-[var(--color-surface-2)] text-[var(--color-text-dim)] border-[var(--color-border)]",
  success: "bg-[var(--color-success)]/15 text-[var(--color-success)] border-[var(--color-success)]/30",
  warn: "bg-[var(--color-warn)]/15 text-[var(--color-warn)] border-[var(--color-warn)]/30",
  danger: "bg-[var(--color-danger)]/15 text-[var(--color-danger)] border-[var(--color-danger)]/30",
  brand: "bg-[var(--color-brand)]/15 text-[var(--color-brand)] border-[var(--color-brand)]/30",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
