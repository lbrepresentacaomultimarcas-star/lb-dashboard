"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sessionApi, useSession } from "@/lib/store";
import { supabaseEnabled } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { LogIn, UserPlus } from "lucide-react";

type Mode = "entrar" | "criar";

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [mode, setMode] = useState<Mode>("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("admin@lb.com");
  const [senha, setSenha] = useState("123456");
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
            {mode === "entrar" ? "Entre para acessar o sistema" : "Crie sua conta"}
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
          {erro && (
            <p className="rounded-md bg-[var(--color-danger)]/15 px-3 py-2 text-xs text-[var(--color-danger)]">
              {erro}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {mode === "entrar" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {loading ? "Aguarde…" : mode === "entrar" ? "Entrar" : "Criar conta"}
          </Button>
          {supabaseEnabled && (
            <button
              type="button"
              onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}
              className="block w-full text-center text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              {mode === "entrar"
                ? "Não tem conta? Criar agora"
                : "Já tem conta? Entrar"}
            </button>
          )}
          <p className="text-center text-xs text-[var(--color-text-dim)]">
            {supabaseEnabled
              ? "Conectado ao Supabase"
              : "Modo demo: qualquer email/senha funciona"}
          </p>
          {/* DIAGNÓSTICO TEMPORÁRIO — remover depois de confirmar produção */}
          <p className="text-center text-[10px] font-mono text-[var(--color-text-dim)]/60">
            url:{(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "vazio").slice(0, 30)}{" "}
            · key:{(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "vazio").slice(0, 15)}
          </p>
        </form>
      </div>
    </div>
  );
}
