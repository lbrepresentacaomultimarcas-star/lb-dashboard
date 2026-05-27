"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { sessionApi, useReady, useSession } from "@/lib/store";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/logo";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const ready = useReady();
  const session = useSession();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) {
      setErro("A senha precisa de pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirma) {
      setErro("As senhas não conferem.");
      return;
    }
    setLoading(true);
    try {
      await sessionApi.updatePassword(senha);
      notify.success("Senha atualizada", "Você já pode usar a nova senha.");
      router.replace("/dashboard");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao atualizar a senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center">
            <Logo size={96} className="drop-shadow-lg" />
          </div>
          <h1 className="text-2xl font-semibold">Definir nova senha</h1>
          <p className="mt-1 text-sm text-[var(--color-text-dim)]">
            Escolha uma nova senha pra sua conta.
          </p>
        </div>

        {ready && !session ? (
          <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-dim)]">
              Link inválido ou expirado. Peça um novo link de recuperação na tela de login.
            </p>
            <Button className="w-full" onClick={() => router.replace("/login")}>
              Voltar ao login
            </Button>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
          >
            <div>
              <Label htmlFor="senha">Nova senha</Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <div>
              <Label htmlFor="confirma">Confirmar senha</Label>
              <Input
                id="confirma"
                type="password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            {erro && (
              <p className="rounded-md bg-[var(--color-danger)]/15 px-3 py-2 text-xs text-[var(--color-danger)]">
                {erro}
              </p>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              <ShieldCheck className="h-4 w-4" />
              {loading ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
