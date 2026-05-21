"use client";

import { useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

/**
 * Upload de foto de avatar (admin only).
 * - Renderiza preview circular
 * - Botão "Trocar foto" abre seletor de arquivo
 * - Envia pro endpoint /api/upload/avatar com targetId = id do vendedor/usuário
 * - Botão "Remover" apaga a foto
 */
export function AvatarUploader({
  targetId,
  nome,
  size = 96,
  onChange,
}: {
  targetId: string;
  nome: string;
  size?: number;
  onChange?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  // bust = força refresh do <img> após upload (URL é a mesma)
  const [bust, setBust] = useState(0);

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notify.error("Arquivo maior que 2MB");
      return;
    }
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("targetId", targetId);
      const r = await fetch("/api/upload/avatar", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao enviar");
      notify.success("Foto atualizada");
      setBust(Date.now());
      onChange?.();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setEnviando(false);
      e.target.value = "";
    }
  }

  async function remover() {
    if (!confirm("Remover a foto deste vendedor?")) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/upload/avatar?targetId=${targetId}`, {
        method: "DELETE",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao remover");
      notify.success("Foto removida");
      setBust(Date.now());
      onChange?.();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        {/* key força React a re-renderizar Avatar e o <img> a re-fetchar */}
        <Avatar key={bust} id={targetId} nome={nome} size={size} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-brand)] text-white shadow hover:bg-[var(--color-brand-hover)] disabled:opacity-60"
          aria-label="Trocar foto"
          title="Trocar foto"
        >
          <Camera className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
        >
          <Upload className="h-3.5 w-3.5" />
          {enviando ? "Enviando…" : "Trocar foto"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={remover}
          disabled={enviando}
          className="text-[var(--color-danger)]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remover
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={escolher}
        className="hidden"
      />
    </div>
  );
}
