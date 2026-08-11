"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  KeyRound,
  Lock,
  LockOpen,
  RefreshCw,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { impersonacaoApi, useSession } from "@/lib/store";
import { ehAdmin } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * Seção "ACESSO AO SISTEMA" — aparece dentro da edição do vendedor.
 *
 * Reusa a autenticação existente (Supabase Auth) via /api/admin/acesso. Nenhuma
 * senha trafega em texto para o banco: quem grava (com hash) é o Supabase. A
 * senha temporária existe só na tela, naquele momento.
 */

type Status = {
  temConta: boolean;
  profileId?: string;
  email?: string;
  nome?: string;
  papel?: string;
  bloqueado?: boolean;
  ativo?: boolean;
  ultimoAcesso?: string | null;
};

export function AcessoConsultor({ vendedorId, vendedorNome }: { vendedorId: string; vendedorNome: string }) {
  const session = useSession();
  const [status, setStatus] = useState<Status | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [temporaria, setTemporaria] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/admin/acesso?vendedorId=${encodeURIComponent(vendedorId)}`);
      setStatus(r.ok ? await r.json() : { temConta: false });
    } catch {
      setStatus({ temConta: false });
    } finally {
      setCarregando(false);
    }
  }, [vendedorId]);

  useEffect(() => {
    const id = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(id);
  }, [carregar]);

  // só admin gerencia acesso (o guard do servidor também barra — isto é a UI)
  if (!ehAdmin(session)) return null;

  async function acao(corpo: Record<string, unknown>, sucesso: string) {
    setOcupado(true);
    try {
      const r = await fetch("/api/admin/acesso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...corpo, profileId: status?.profileId }),
      });
      const json = (await r.json()) as { error?: string; senha?: string };
      if (!r.ok) throw new Error(json.error ?? "Falha na operação");
      if (json.senha) {
        setTemporaria(json.senha);
        setCopiado(false);
      }
      notify.success(sucesso);
      await carregar();
      return true;
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Falha na operação");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function entrarComo() {
    if (!status?.profileId) return;
    setOcupado(true);
    try {
      await impersonacaoApi.entrar(status.profileId);
      notify.success(`Você está acessando como ${status.nome ?? vendedorNome}`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível entrar como o consultor");
    } finally {
      setOcupado(false);
    }
  }

  function copiar(txt: string) {
    void navigator.clipboard.writeText(txt);
    setCopiado(true);
    notify.success("Senha copiada");
  }

  const bloqueado = !!status?.bloqueado;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-brand)]/10 text-[var(--color-brand)]">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold uppercase tracking-wider">Acesso ao sistema</h3>
      </div>

      {carregando ? (
        <p className="text-xs text-[var(--color-text-dim)]">Consultando…</p>
      ) : !status?.temConta ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-dim)]">
            Este consultor ainda <strong>não tem conta de acesso</strong>. Crie o acesso em{" "}
            <strong>Administrativo → Colaboradores → Novo</strong>, usando o mesmo e-mail cadastrado
            aqui — o vínculo é automático.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* identificação + status */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{status.email}</p>
              <p className="text-[11px] text-[var(--color-text-dim)]">
                Perfil: {status.papel}
                {status.ultimoAcesso
                  ? ` · último acesso em ${new Date(status.ultimoAcesso).toLocaleString("pt-BR")}`
                  : " · nunca acessou"}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                bloqueado
                  ? "bg-[var(--color-danger,#ef4444)]/15 text-[var(--color-danger,#ef4444)]"
                  : "bg-[var(--color-success,#22c55e)]/15 text-[var(--color-success,#22c55e)]"
              }`}
            >
              {bloqueado ? <Lock className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              {bloqueado ? "BLOQUEADO" : "ATIVO"}
            </span>
          </div>

          {/* senha temporária — visível só neste momento */}
          {temporaria ? (
            <div className="rounded-lg border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/8 p-3">
              <p className="text-[11px] font-semibold text-[var(--color-brand)]">
                SENHA TEMPORÁRIA — anote agora, ela não será mostrada de novo
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-mono text-sm tracking-wider">
                  {temporaria}
                </code>
                <Button variant="ghost" onClick={() => copiar(temporaria)}>
                  {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
                Entregue ao consultor e peça para ele trocar no primeiro acesso. A senha anterior
                deixou de funcionar.
              </p>
            </div>
          ) : null}

          {/* definir senha manualmente */}
          <div>
            <Label htmlFor="nova-senha">Definir uma nova senha (mín. 6 caracteres)</Label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <Input
                id="nova-senha"
                type="text"
                autoComplete="off"
                placeholder="deixe em branco para gerar automática"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
              />
              <Button
                variant="secondary"
                disabled={ocupado || (novaSenha.length > 0 && novaSenha.length < 6)}
                onClick={async () => {
                  const ok = await acao(
                    { acao: "redefinir-senha", senha: novaSenha.trim() || undefined },
                    novaSenha.trim() ? "Senha redefinida" : "Senha temporária gerada",
                  );
                  if (ok) setNovaSenha("");
                }}
              >
                <KeyRound className="h-4 w-4" /> Redefinir senha
              </Button>
            </div>
          </div>

          {/* ações */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={ocupado}
              onClick={() => void acao({ acao: "redefinir-senha" }, "Senha temporária gerada")}
            >
              <RefreshCw className="h-4 w-4" /> Gerar nova senha
            </Button>

            <Button
              variant="secondary"
              disabled={ocupado}
              onClick={() =>
                void acao(
                  { acao: bloqueado ? "desbloquear" : "bloquear" },
                  bloqueado ? "Acesso liberado" : "Acesso bloqueado",
                )
              }
            >
              {bloqueado ? <LockOpen className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
              {bloqueado ? "Desbloquear acesso" : "Bloquear acesso"}
            </Button>

            {status.papel !== "admin" ? (
              <Button variant="secondary" disabled={ocupado || bloqueado} onClick={() => void entrarComo()}>
                <Eye className="h-4 w-4" /> Entrar como consultor
              </Button>
            ) : null}
          </div>

          <p className="text-[11px] text-[var(--color-text-dim)]">
            Toda redefinição, bloqueio e entrada como consultor fica registrada no histórico do
            sistema, com o administrador responsável e a data.
          </p>
        </div>
      )}
    </div>
  );
}
