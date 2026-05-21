"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { readFileAsDataUrl, settings, useImageSetting, type ImageSettingKey } from "@/lib/settings";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

type Slot = {
  key: ImageSettingKey;
  titulo: string;
  descricao: string;
  altura: number;
  dim: string;
};

const SLOTS: Slot[] = [
  {
    key: "logo_principal",
    titulo: "Logo principal",
    descricao: "Aparece na sidebar e no login. Recomendado: PNG/JPG quadrado ~512×512.",
    altura: 96,
    dim: "512×512px",
  },
  {
    key: "logo_ranking",
    titulo: "Logo do ranking",
    descricao: "Aparece no painel lateral do /ranking. Recomendado: 450×100px horizontal.",
    altura: 80,
    dim: "450×100px",
  },
  {
    key: "imagem_meta_1",
    titulo: "Imagem ao bater meta 1",
    descricao: "Card exibido quando o vendedor atinge a meta principal. Recomendado: 350×90px.",
    altura: 100,
    dim: "350×90px",
  },
  {
    key: "imagem_meta_2",
    titulo: "Imagem ao bater meta 2",
    descricao: "Card exibido quando o vendedor supera a meta (110%+). Recomendado: 350×90px.",
    altura: 100,
    dim: "350×90px",
  },
];

function SlotCard({ slot }: { slot: Slot }) {
  const atual = useImageSetting(slot.key);
  const inputRef = useRef<HTMLInputElement>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      notify.error("Arquivo muito grande", "Máximo 2 MB pra evitar problemas no navegador.");
      return;
    }
    setCarregando(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      settings.set(slot.key, dataUrl);
      notify.success(`${slot.titulo} salva`);
    } catch (e) {
      notify.error("Erro ao ler arquivo", e instanceof Error ? e.message : undefined);
    } finally {
      setCarregando(false);
    }
  }

  function remover() {
    if (!confirm(`Remover ${slot.titulo}?`)) return;
    settings.set(slot.key, null);
    notify.success("Removida — usando o padrão");
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>{slot.titulo}</CardTitle>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">{slot.descricao}</p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          {slot.dim}
        </span>
      </div>

      <div
        className="mt-4 flex items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"
        style={{ minHeight: slot.altura + 32 }}
      >
        {atual ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={atual}
            alt={slot.titulo}
            style={{ maxHeight: slot.altura }}
            className="rounded object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[var(--color-text-dim)]">
            <ImagePlus className="h-6 w-6" />
            <span className="text-xs">Nenhuma imagem definida — usando o padrão</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={carregando}
        >
          <Upload className="h-3.5 w-3.5" />
          {atual ? "Trocar" : "Enviar imagem"}
        </Button>
        {atual && (
          <Button variant="ghost" size="sm" onClick={remover}>
            <Trash2 className="h-3.5 w-3.5" />
            Remover
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-[var(--color-text-dim)]">
          Personalize a aparência do sistema — todas as imagens ficam salvas neste navegador.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Artes do sistema
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {SLOTS.map((s) => (
            <SlotCard key={s.key} slot={s} />
          ))}
        </div>
      </section>

      <Card className="bg-[var(--color-surface-2)]/50">
        <p className="text-xs text-[var(--color-text-dim)]">
          <strong>Dica:</strong> Para que todos os usuários da empresa vejam as mesmas imagens,
          eu posso evoluir isso pra <em>Supabase Storage</em> — assim as artes ficam no servidor
          e sincronizam entre todos. Por enquanto, cada navegador tem sua cópia local.
        </p>
      </Card>
    </div>
  );
}
