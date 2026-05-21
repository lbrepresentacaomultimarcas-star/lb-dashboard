import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-bg)] p-4 text-center">
      <div className="max-w-md">
        <FileQuestion className="mx-auto mb-4 h-16 w-16 text-[var(--color-text-dim)]" />
        <h1 className="text-3xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">
          A URL que você tentou acessar não existe ou foi movida.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-brand-hover)]"
        >
          Voltar ao dashboard
        </Link>
      </div>
    </div>
  );
}
