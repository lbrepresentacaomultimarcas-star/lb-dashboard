import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  value: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "success" | "warn" | "danger" | "brand";
}) {
  const toneRing: Record<string, string> = {
    neutral: "bg-[var(--color-surface-2)] text-[var(--color-text-dim)]",
    success: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
    warn: "bg-[var(--color-warn)]/15 text-[var(--color-warn)]",
    danger: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
    brand: "bg-[var(--color-brand)]/15 text-[var(--color-brand)]",
  };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardValue>{value}</CardValue>
          {hint && (
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">{hint}</p>
          )}
        </div>
        {Icon && (
          <div className={cn("grid h-10 w-10 place-items-center rounded-lg", toneRing[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  );
}
