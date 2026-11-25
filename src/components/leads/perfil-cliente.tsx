"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Fingerprint, History } from "lucide-react";
import { perfilHistoricoApi, usePerfisCliente, useLeads, useVendedores } from "@/lib/store";
import { ordenarPerfis, perfilPendente, type PerfilCliente } from "@/lib/perfil-cliente";
import type { Lead, PerfilHistorico } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fmtData = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

/** Perfis ativos, em ordem, e o mapa por id (inclui inativos, para negócios antigos). */
export function usePerfis() {
  const todos = usePerfisCliente();
  return useMemo(
    () => ({ ativos: ordenarPerfis(todos), porId: new Map(todos.map((p) => [p.id, p])) }),
    [todos],
  );
}

/** Badge do perfil. Passar o mouse ou tocar mostra a dica de abordagem. */
export function BadgePerfil({
  perfil,
  definidoPor,
  definidoEm,
  destaque = false,
}: {
  perfil: PerfilCliente;
  definidoPor?: string;
  definidoEm?: string;
  destaque?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  // A dica fica numa camada fixa: as colunas do Kanban cortam o que sai delas.
  useEffect(() => {
    if (!aberto || !botao.current) {
      setPos(null);
      return;
    }
    const r = botao.current.getBoundingClientRect();
    const largura = 256;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
    setPos(
      window.innerHeight - r.bottom > 190
        ? { left, top: r.bottom + 6 }
        : { left, bottom: window.innerHeight - r.top + 6 },
    );
    const fechar = () => setAberto(false);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto]);
  return (
    <span
      className="relative inline-flex"
      // Só mouse: no toque, o "entrar" e o clique chegariam juntos e se anulariam.
      onPointerEnter={(e) => e.pointerType === "mouse" && setAberto(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setAberto(false)}
    >
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-label={`Perfil do cliente: ${perfil.nome}. Ver dica de abordagem`}
        onClick={(e) => {
          e.stopPropagation();
          setAberto((a) => !a);
        }}
        onBlur={() => setAberto(false)}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full border font-bold uppercase tracking-wide",
          destaque ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[9px]",
        )}
        style={{
          color: perfil.cor,
          background: `${perfil.cor}26`,
          borderColor: destaque ? perfil.cor : `${perfil.cor}55`,
          boxShadow: destaque ? `0 0 12px -2px ${perfil.cor}` : undefined,
        }}
      >
        <span aria-hidden>{perfil.emoji}</span> {perfil.nome}
      </button>
      {aberto && pos && createPortal(
        <span
          role="tooltip"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
          className="pointer-events-none fixed z-[200] w-64 rounded-lg border border-white/15 bg-[#0b0d16] p-3 text-left text-[11px] normal-case leading-snug tracking-normal text-white/85 shadow-2xl"
        >
          <span className="mb-1 block text-xs font-bold" style={{ color: perfil.cor }}>
            {perfil.emoji} Como abordar
          </span>
          {perfil.dica}
          {(definidoPor || definidoEm) && (
            <span className="mt-2 block border-t border-white/10 pt-1.5 text-[10px] text-white/55">
              Definido{definidoPor ? ` por ${definidoPor}` : ""}
              {definidoEm ? ` em ${fmtData(definidoEm)}` : ""}
            </span>
          )}
        </span>,
        document.body,
      )}
    </span>
  );
}

export function BadgePendente({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title="Este negócio já foi atendido e ainda não tem perfil. Toque para definir."
      className="inline-flex items-center gap-0.5 rounded-full border border-white/20 bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/70"
    >
      <Fingerprint className="h-2.5 w-2.5" aria-hidden /> Perfil pendente
    </button>
  );
}

/** "Qual o perfil deste cliente?" — obrigatório na passagem de etapa. */
export function ModalPerfil({
  aberto,
  nomeCliente,
  obrigatorio,
  perfilAtual,
  observacaoAtual,
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  nomeCliente: string;
  obrigatorio: boolean;
  perfilAtual?: string;
  observacaoAtual?: string;
  onConfirmar: (perfilId: string, observacao: string) => void;
  onCancelar: () => void;
}) {
  const { ativos } = usePerfis();
  const [escolhido, setEscolhido] = useState<string | undefined>(perfilAtual);
  const [obs, setObs] = useState(observacaoAtual ?? "");

  return (
    <Modal
      open={aberto}
      onClose={onCancelar}
      title="Qual o perfil deste cliente?"
      subtitle={
        obrigatorio
          ? `${nomeCliente} já foi atendido. Escolha o perfil para continuar.`
          : `Perfil de ${nomeCliente}`
      }
      icon={<Fingerprint className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ativos.map((p) => {
            const marcado = escolhido === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={marcado}
                onClick={() => setEscolhido(p.id)}
                className="rounded-xl border p-3 text-left transition-transform hover:-translate-y-0.5"
                style={{
                  borderColor: marcado ? p.cor : `${p.cor}55`,
                  background: marcado ? `${p.cor}2e` : `${p.cor}12`,
                  boxShadow: marcado ? `0 0 18px -4px ${p.cor}` : undefined,
                }}
              >
                <span className="flex items-center gap-2 text-base font-bold" style={{ color: p.cor }}>
                  <span className="text-xl" aria-hidden>{p.emoji}</span> {p.nome}
                </span>
                <span className="mt-1 block text-xs leading-snug text-[var(--color-text-dim)]">{p.dica}</span>
              </button>
            );
          })}
        </div>
        <div>
          <label htmlFor="perfil-obs" className="mb-1 block text-xs font-medium text-[var(--color-text-dim)]">
            Observação (opcional)
          </label>
          <textarea
            id="perfil-obs"
            value={obs}
            maxLength={500}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: pediu simulação de 3 parcelas"
            className="min-h-[70px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancelar}>
            {obrigatorio ? "Cancelar a mudança" : "Cancelar"}
          </Button>
          <Button type="button" disabled={!escolhido} onClick={() => escolhido && onConfirmar(escolhido, obs.trim())}>
            {escolhido ? "Salvar perfil" : "Escolha um perfil"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Perfil, observação e histórico, na ficha do negócio. */
export function PainelPerfilNegocio({
  lead,
  nomeDe,
  onAlterar,
}: {
  lead: Lead;
  nomeDe: (id?: string) => string | undefined;
  onAlterar: () => void;
}) {
  const { porId } = usePerfis();
  const perfil = lead.perfilClienteId ? porId.get(lead.perfilClienteId) : undefined;
  const [historico, setHistorico] = useState<{ chave: string; itens: PerfilHistorico[]; erro?: string } | null>(null);
  const chave = `${lead.id}|${lead.perfilDefinidoEm ?? ""}`;

  useEffect(() => {
    let vivo = true;
    perfilHistoricoApi
      .listar(lead.id)
      .then((itens) => {
        if (vivo) setHistorico({ chave, itens });
      })
      .catch(() => {
        if (vivo) setHistorico({ chave, itens: [], erro: "Não consegui carregar o histórico." });
      });
    return () => {
      vivo = false;
    };
  }, [lead.id, chave]);

  const itens = historico?.chave === chave ? historico.itens : [];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Perfil do cliente</span>
          {perfil ? (
            <BadgePerfil perfil={perfil} definidoPor={nomeDe(lead.perfilDefinidoPor)} definidoEm={lead.perfilDefinidoEm} destaque />
          ) : (
            <span className="text-xs text-[var(--color-text-dim)]">Não definido</span>
          )}
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onAlterar}>
          <Fingerprint className="h-4 w-4" /> {perfil ? "Alterar" : "Definir"}
        </Button>
      </div>
      {perfil && <p className="mt-2 text-xs leading-snug text-[var(--color-text-dim)]">{perfil.dica}</p>}
      {lead.perfilObservacao && (
        <p className="mt-2 text-sm">
          <span className="text-[var(--color-text-dim)]">Observação: </span>
          {lead.perfilObservacao}
        </p>
      )}
      {itens.length > 0 && (
        <details className="mt-2">
          <summary className="flex cursor-pointer items-center gap-1 text-xs text-[var(--color-text-dim)]">
            <History className="h-3.5 w-3.5" aria-hidden /> Histórico do perfil ({itens.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {itens.map((h) => {
              const de = h.perfilAnterior ? porId.get(h.perfilAnterior) : undefined;
              const para = h.perfilNovo ? porId.get(h.perfilNovo) : undefined;
              return (
                <li key={h.id} className="text-xs leading-snug">
                  <span className="text-[var(--color-text-dim)]">{fmtData(h.criadoEm)} · {h.usuarioNome ?? nomeDe(h.usuarioId) ?? "—"}: </span>
                  {de ? `${de.emoji} ${de.nome} → ` : ""}
                  {para ? `${para.emoji} ${para.nome}` : "sem perfil"}
                  {h.observacao ? ` · “${h.observacao}”` : ""}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {historico?.chave === chave && historico.erro && (
        <p className="mt-2 text-xs text-[var(--color-danger)]">{historico.erro}</p>
      )}
    </div>
  );
}

/** Painel do Gestor: negócios por perfil e pendentes, por consultor. Só lê o Pipeline. */
export function QuadroPerfisPorConsultor() {
  const { ativos } = usePerfis();
  const leads = useLeads();
  const vendedores = useVendedores();

  const linhas = useMemo(() => {
    const porVendedor = new Map<string, { contagem: Map<string, number>; pendentes: number; total: number }>();
    for (const l of leads) {
      if (l.status === "perdido" || !l.vendedorId) continue;
      const r = porVendedor.get(l.vendedorId) ?? { contagem: new Map(), pendentes: 0, total: 0 };
      if (l.perfilClienteId) r.contagem.set(l.perfilClienteId, (r.contagem.get(l.perfilClienteId) ?? 0) + 1);
      if (perfilPendente(l)) r.pendentes += 1;
      r.total += 1;
      porVendedor.set(l.vendedorId, r);
    }
    return vendedores
      .filter((v) => porVendedor.has(v.id))
      .map((v) => ({ vendedor: v, ...porVendedor.get(v.id)! }))
      .sort((a, b) => b.pendentes - a.pendentes || a.vendedor.nome.localeCompare(b.vendedor.nome));
  }, [leads, vendedores]);

  if (ativos.length === 0) return null;
  const totalPendentes = linhas.reduce((a, l) => a + l.pendentes, 0);

  return (
    <section className="lb-card-premium rounded-2xl p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Fingerprint className="h-5 w-5 text-sky-300" aria-hidden /> Perfil do cliente por consultor
        </h2>
        <span className="text-xs text-white/70">
          Pipeline, sem perdidos · {totalPendentes} com perfil pendente
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-white">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-white/70">
              <th className="py-2 pr-3">Consultor</th>
              {ativos.map((p) => (
                <th key={p.id} className="px-2 py-2 text-center" title={p.nome}>
                  <span aria-hidden>{p.emoji}</span> <span className="hidden sm:inline">{p.nome}</span>
                </th>
              ))}
              <th className="px-2 py-2 text-center">Pendentes</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.vendedor.id} className="border-t border-white/10">
                <td className="py-2 pr-3 font-medium">{l.vendedor.nome}</td>
                {ativos.map((p) => (
                  <td key={p.id} className="px-2 py-2 text-center tabular-nums">
                    {l.contagem.get(p.id) ?? 0}
                  </td>
                ))}
                <td className={cn("px-2 py-2 text-center font-bold tabular-nums", l.pendentes > 0 ? "text-amber-300" : "text-white/70")}>
                  {l.pendentes}
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={ativos.length + 2} className="py-4 text-center text-white/70">Nenhum negócio em andamento.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
