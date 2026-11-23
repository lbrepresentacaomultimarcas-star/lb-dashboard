"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, ShieldCheck, Trash2 } from "lucide-react";
import { useRoster, useVendedores, vendedoresApi, type EncerramentoConsultor } from "@/lib/store";
import { supabaseEnabled } from "@/lib/supabase/client";
import type { Vendedor } from "@/lib/types";
import { notify } from "@/lib/notify";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

/** Excluir consultor escolhendo, na mesma tela, quem recebe os contatos. */
export function EncerrarConsultorModal({ vendedor, onClose }: { vendedor: Vendedor; onClose: () => void }) {
  const vendedores = useVendedores();
  const roster = useRoster();
  const [destinos, setDestinos] = useState<string[]>([]);
  const [bloquear, setBloquear] = useState(true);
  const [previa, setPrevia] = useState<{ chave: string; dados?: EncerramentoConsultor; erro?: string } | null>(null);
  const [executando, setExecutando] = useState(false);

  // Mesma regra do banco: só recebe quem tem cadastro ativo e login liberado.
  const candidatos = useMemo(
    () =>
      vendedores.filter((v) => {
        if (v.id === vendedor.id || !v.ativo) return false;
        if (!supabaseEnabled) return true;
        return roster.some((p) => p.vendedorRef === v.id && p.ativo !== false && p.codigoLiberado !== false);
      }),
    [vendedores, roster, vendedor.id],
  );

  const chave = destinos.join(",");

  useEffect(() => {
    let vivo = true;
    const lista = chave ? chave.split(",") : [];
    vendedoresApi
      .encerrar(vendedor.id, lista, { bloquearAcesso: bloquear, simular: true })
      .then((dados) => {
        if (vivo) setPrevia({ chave: `${chave}|${bloquear}`, dados });
      })
      .catch((e: unknown) => {
        if (vivo) setPrevia({ chave: `${chave}|${bloquear}`, erro: e instanceof Error ? e.message : "Não consegui calcular a prévia." });
      });
    return () => {
      vivo = false;
    };
  }, [vendedor.id, chave, bloquear]);

  const carregando = previa?.chave !== `${chave}|${bloquear}`;
  const dados = carregando ? undefined : previa?.dados;
  const erro = carregando ? undefined : previa?.erro;
  const totalContatos = (dados?.pipeline ?? 0) + (dados?.central ?? 0);
  const falta = totalContatos > 0 && destinos.length === 0;
  const m = dados?.mantidos;
  const mantidos = m
    ? [
        m.vendas && plural(m.vendas, "venda", "vendas"),
        m.metas && plural(m.metas, "meta", "metas"),
        m.negocios && plural(m.negocios, "negócio encerrado", "negócios encerrados"),
        m.central && plural(m.central, "lead encerrado", "leads encerrados"),
        m.analises && plural(m.analises, "análise", "análises"),
        m.performance && plural(m.performance, "registro de performance", "registros de performance"),
      ].filter(Boolean)
    : [];
  const inativa = dados?.acao === "inativado";

  const alternar = (id: string) =>
    setDestinos((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  async function confirmar() {
    setExecutando(true);
    try {
      const r = await vendedoresApi.encerrar(vendedor.id, destinos, { bloquearAcesso: bloquear, simular: false });
      const total = r.pipeline + r.central;
      notify.success(
        r.acao === "excluido" ? `${vendedor.nome} foi excluído` : `${vendedor.nome} foi inativado`,
        total > 0 ? `${plural(total, "contato transferido", "contatos transferidos")}.` : undefined,
      );
      onClose();
    } catch (e) {
      notify.error("Nada foi alterado", e instanceof Error ? e.message : undefined);
    } finally {
      setExecutando(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!executando) onClose(); }}
      title={`Excluir ${vendedor.nome}`}
      subtitle="Escolha quem recebe os contatos. A transferência é automática."
      icon={<ArrowRightLeft className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
          {carregando && !previa ? (
            <p className="text-[var(--color-text-dim)]">Conferindo os contatos…</p>
          ) : erro ? (
            <p className="flex items-start gap-2 text-[var(--color-danger)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {erro}
            </p>
          ) : (
            <p>
              <strong>{plural(dados?.pipeline ?? previa?.dados?.pipeline ?? 0, "negócio aberto", "negócios abertos")}</strong> no Pipeline e{" "}
              <strong>{plural(dados?.central ?? previa?.dados?.central ?? 0, "lead ativo", "leads ativos")}</strong> na Central serão transferidos.
            </p>
          )}
        </div>

        <fieldset>
          <div className="mb-2 flex items-center justify-between gap-2">
            <legend className="text-sm font-semibold">Enviar os contatos para</legend>
            {candidatos.length > 1 && (
              <button
                type="button"
                className="text-xs font-medium text-[var(--color-brand)] hover:underline"
                onClick={() => setDestinos(destinos.length === candidatos.length ? [] : candidatos.map((c) => c.id))}
              >
                {destinos.length === candidatos.length ? "Limpar" : "Selecionar todos"}
              </button>
            )}
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {candidatos.map((c) => {
              const marcado = destinos.includes(c.id);
              const q = dados?.porConsultor.find((p) => p.vendedorId === c.id)?.quantos;
              return (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm",
                    marcado ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10" : "border-[var(--color-border)]",
                  )}
                >
                  <input type="checkbox" checked={marcado} onChange={() => alternar(c.id)} />
                  <Avatar id={c.id} nome={c.nome} size={28} />
                  <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                  {marcado && q !== undefined && (
                    <span className="text-xs font-semibold text-[var(--color-success)]">recebe {q}</span>
                  )}
                </label>
              );
            })}
            {candidatos.length === 0 && (
              <p className="p-2 text-sm text-[var(--color-text-dim)]">Nenhum outro consultor ativo com login liberado.</p>
            )}
          </div>
          {destinos.length > 1 && <p className="mt-1 text-xs text-[var(--color-text-dim)]">Os contatos são divididos em rodízio entre os escolhidos.</p>}
        </fieldset>

        {mantidos.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 p-3 text-xs">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warn)]" aria-hidden />
            <p>
              <strong>O histórico fica protegido:</strong> {mantidos.join(", ")} continuam no nome de {vendedor.nome}. Por isso o cadastro será{" "}
              <strong>inativado</strong> em vez de apagado, e vendas, comissões e ranking não mudam.
            </p>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} />
          Bloquear o acesso desta pessoa ao sistema
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={executando}>Cancelar</Button>
          <Button variant="danger" onClick={() => void confirmar()} disabled={executando || carregando || !!erro || falta}>
            <Trash2 className="h-4 w-4" />
            {executando
              ? "Transferindo…"
              : falta
                ? "Escolha quem recebe"
                : `${totalContatos > 0 ? `Transferir ${totalContatos} e ` : ""}${inativa ? "inativar" : "excluir"}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
