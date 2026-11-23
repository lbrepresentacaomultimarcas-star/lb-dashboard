"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { temasApi, useSession, useTemas } from "@/lib/store";
import { SLUG_NATAL, SLUG_NEON } from "@/lib/tema-visual";
import { iconeApelido } from "@/lib/apelidos-tema";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** O consultor escolhe entre os apelidos que o administrador autorizou. */
export function MeuApelidoCard() {
  const session = useSession();
  const temas = useTemas();
  const [aba, setAba] = useState<"natal" | "neon">("natal");
  const [pref, setPref] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const id = session?.vendedorId;
  if (!id) return null;

  const slug = aba === "natal" ? SLUG_NATAL : SLUG_NEON;
  const conf = temas.find((t) => t.slug === slug)?.estilo.apelidos?.[id];
  const opcoes = conf?.opcoes ?? [];
  const preferencia = pref[slug] ?? conf?.preferencia ?? "";

  async function enviar(apelido?: string, novaPreferencia?: string) {
    if (!id) return;
    setSalvando(true);
    try {
      await temasApi.escolherMeuApelido(slug, id, apelido, novaPreferencia);
      notify.success(apelido ? `Apelido "${apelido}" escolhido` : "Preferência enviada ao administrador");
    } catch (e) {
      notify.error("Não foi possível salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-[var(--color-brand)]" aria-hidden /> Meu apelido no ranking
        </h2>
        <div className="flex gap-1 rounded-lg bg-[var(--color-surface-2)] p-1">
          {(["natal", "neon"] as const).map((a) => (
            <button key={a} type="button" aria-pressed={aba === a} onClick={() => setAba(a)} className={cn("rounded-md px-3 py-1 text-xs font-medium", aba === a ? "bg-[var(--color-brand)] text-white" : "text-[var(--color-text-dim)]")}>
              {a === "natal" ? "Natal" : "Neon City"}
            </button>
          ))}
        </div>
      </div>

      {opcoes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {opcoes.map((o) => (
            <button
              key={o}
              type="button"
              disabled={salvando}
              aria-pressed={conf?.apelido === o}
              onClick={() => void enviar(o)}
              className={cn("rounded-full border px-3 py-1 text-sm", conf?.apelido === o ? "border-[var(--color-success)] text-[var(--color-success)]" : "border-[var(--color-border)] text-[var(--color-text-dim)]")}
            >
              {iconeApelido(aba, o)} {o}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-text-dim)]">
          {conf?.apelido ? `Seu apelido: ${conf.apelido}.` : "O administrador ainda não liberou opções para você."}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Minha preferência de apelido"
          maxLength={120}
          value={preferencia}
          placeholder="Conte do que você gosta, por exemplo: carros, liderança, velocidade"
          onChange={(e) => setPref((p) => ({ ...p, [slug]: e.target.value }))}
        />
        <Button variant="secondary" disabled={salvando} onClick={() => void enviar(undefined, preferencia)}>
          Enviar
        </Button>
      </div>
    </section>
  );
}
