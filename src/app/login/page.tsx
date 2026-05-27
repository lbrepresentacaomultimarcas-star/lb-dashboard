"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sessionApi, useSession } from "@/lib/store";
import { supabaseEnabled } from "@/lib/supabase/client";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { KeyRound, LogIn, UserPlus } from "lucide-react";

type Mode = "entrar" | "criar" | "recuperar";

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [mode, setMode] = useState<Mode>("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      if (mode === "recuperar") {
        if (!email.includes("@")) throw new Error("Informe um email válido.");
        await sessionApi.resetPasswordForEmail(email.trim());
        notify.success(
          "Link enviado",
          "Se o email existir, você vai receber um link pra redefinir a senha.",
        );
        setMode("entrar");
        return;
      }
      if (!email.includes("@") || senha.length < 4) {
        throw new Error("Informe um email válido e senha com pelo menos 4 caracteres.");
      }
      if (mode === "criar") {
        if (!nome.trim()) throw new Error("Informe seu nome.");
        await sessionApi.signUp(email, senha, nome.trim());
      } else {
        await sessionApi.signIn(email, senha);
      }
      router.replace("/dashboard");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-40 w-40 items-center justify-center">
            <Logo size={160} className="drop-shadow-lg" />
          </div>
          <h1 className="text-2xl font-semibold">LB Representações</h1>
          <p className="mt-1 text-sm text-[var(--color-text-dim)]">
            {mode === "entrar"
              ? "Entre para acessar o sistema"
              : mode === "criar"
                ? "Crie sua conta"
                : "Recupere o acesso à sua conta"}
          </p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
        >
          {mode === "criar" && (
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          {mode !== "recuperar" && (
            <div>
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete={mode === "criar" ? "new-password" : "current-password"}
                required
              />
            </div>
          )}
          {erro && (
            <p className="rounded-md bg-[var(--color-danger)]/15 px-3 py-2 text-xs text-[var(--color-danger)]">
              {erro}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {mode === "recuperar" ? (
              <KeyRound className="h-4 w-4" />
            ) : mode === "entrar" ? (
              <LogIn className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {loading
              ? "Aguarde…"
              : mode === "recuperar"
                ? "Enviar link de recuperação"
                : mode === "entrar"
                  ? "Entrar"
                  : "Criar conta"}
          </Button>
          {supabaseEnabled && mode !== "recuperar" && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}
                className="block w-full text-center text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              >
                {mode === "entrar" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
              </button>
              {mode === "entrar" && (
                <button
                  type="button"
                  onClick={() => {
                    setErro(null);
                    setMode("recuperar");
                  }}
                  className="block w-full text-center text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                >
                  Esqueci minha senha
                </button>
              )}
            </div>
          )}
          {supabaseEnabled && mode === "recuperar" && (
            <button
              type="button"
              onClick={() => {
                setErro(null);
                setMode("entrar");
              }}
              className="block w-full text-center text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              Voltar ao login
            </button>
          )}
          <p className="text-center text-xs text-[var(--color-text-dim)]">
            {supabaseEnabled
              ? "Conectado ao Supabase"
              : "Modo demo: qualquer email/senha funciona"}
          </p>
        </form>
      </div>
    </div>
  );
}
