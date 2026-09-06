"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sessionApi, useSession } from "@/lib/store";
import { supabaseEnabled } from "@/lib/supabase/client";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { BrandBar } from "@/components/marca-dupla";
import { KeyRound, LogIn, UserPlus } from "lucide-react";
import { BLOQUEADO } from "@/lib/mensagens-acesso";

type Mode = "entrar" | "criar" | "recuperar";

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [mode, setMode] = useState<Mode>("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  /**
   * Porta dos fundos, de propósito.
   *
   * O dia a dia é por código. Mas se algo der errado na geração ou liberação
   * dos códigos, ninguém — nem o administrador — pode ficar trancado do lado
   * de fora do próprio sistema. Fica discreto, não escondido.
   */
  const [porEmail, setPorEmail] = useState(false);
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  // Quem chegou aqui expulso por bloqueio precisa saber o motivo — senão
  // tenta entrar de novo, dá errado, e acha que o sistema quebrou.
  useEffect(() => {
    const t = setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("bloqueado") === "1") {
        setErro(BLOQUEADO);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      /*
       * Entrada por CÓDIGO.
       *
       * Quem autentica é o servidor: ele descobre o e-mail a partir do código
       * e faz o login por lá, para o e-mail da equipe nunca ficar exposto a
       * quem só testa códigos. A sessão volta nos cookies.
       *
       * Depois, recarrega a página inteira de propósito: o app sobe lendo a
       * sessão do cookie pelo caminho normal de sempre, em vez de eu repetir
       * aqui os quinze carregamentos que a entrada por e-mail já faz.
       */
      if (mode === "entrar" && !porEmail) {
        if (!codigo.trim() || senha.length < 4) {
          throw new Error("Informe o código de acesso e a senha.");
        }
        const r = await fetch("/api/auth/codigo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: codigo.trim(), senha }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) throw new Error(j.error ?? "Não foi possível entrar.");
        window.location.assign("/dashboard");
        return;
      }

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
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <BrandBar />
      <div className="grid flex-1 place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-40 w-40 items-center justify-center">
            <Logo size={160} className="drop-shadow-lg" />
          </div>
          <h1 className="text-2xl font-semibold">LB Representações</h1>
          <p className="mt-1 text-sm text-[var(--color-text-dim)]">
            {mode === "entrar"
              ? porEmail
                ? "Entre com seu e-mail e senha"
                : "Acesso ao sistema"
              : mode === "criar"
                ? "Crie sua conta"
                : "Informe o e-mail cadastrado para receber o link"}
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
          {mode === "entrar" && !porEmail ? (
            <div>
              <Label htmlFor="codigo">Código de acesso</Label>
              <Input
                id="codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="V015"
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                required
              />
            </div>
          ) : (
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
          )}
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
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setErro(null);
                      setPorEmail((v) => !v);
                    }}
                    className="block w-full text-center text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                  >
                    {porEmail ? "Entrar com código de acesso" : "Entrar com e-mail"}
                  </button>
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
                </>
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
    </div>
  );
}
