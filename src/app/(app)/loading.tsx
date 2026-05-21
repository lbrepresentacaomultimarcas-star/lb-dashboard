export default function AppLoading() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-[var(--color-text-dim)]">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-brand)] border-t-transparent" />
        <span className="text-sm">Carregando…</span>
      </div>
    </div>
  );
}
