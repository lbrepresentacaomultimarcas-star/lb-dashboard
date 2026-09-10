"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ListOrdered, RefreshCw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

/**
 * FILA DE DISTRIBUIÇÃO AUTOMÁTICA — painel do admin.
 *
 * Só configura e mostra. Quem entrega o lead é a função `distribuir_automatico`
 * no banco, chamada quando o lead chega — porque é ela que tranca a fila e
 * impede dois leads simultâneos de caírem no mesmo consultor.
 *
 * A distribuição manual que existe logo acima continua funcionando igual: esta
 * área não a substitui.
 */

type Participante = {
  vendedorId: string;
  nome: string;
  ordem: number;
  recebeu: number;
  impedimento: string | null;
};

type Estado = {
  ativa: boolean;
  participantes: Participante[];
  disponiveis: { vendedorId: string; nome: string }[];
  proximo: { vendedorId: string; nome: string } | null;
  totalDistribuido: number;
  ultimas: { leadId: string; nome: string; ordem: number; telefone: string | null; em: string }[];
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function FilaAutomatica() {
  const [dados, setDados] = useState<Estado | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/central-leads/fila");
      if (!r.ok) throw new Error("Falha ao consultar a fila");
      const j = (await r.json()) as Estado;
      setDados(j);
      setMarcados(new Set(j.participantes.map((p) => p.vendedorId)));
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  // fora do corpo do efeito: React 19 reclama de setState síncrono em effect
  useEffect(() => {
    const id = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(id);
  }, [carregar]);

  async function salvar(corpo: { ativa?: boolean; membros?: string[] }, aviso: string) {
    setSalvando(true);
    try {
      const r = await fetch("/api/central-leads/fila", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = (await r.json()) as { erro?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? j.erro ?? "Não consegui salvar");
      notify.success(aviso);
      await carregar();
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando && !dados) {
    return (
      <div className="lb-card-premium rounded-2xl p-4 text-xs text-white/60">Carregando a fila…</div>
    );
  }
  if (!dados) return null;

  const naFila = dados.participantes.filter((p) => !p.impedimento);
  const mudou =
    marcados.size !== dados.participantes.length ||
    dados.participantes.some((p) => !marcados.has(p.vendedorId));

  const alternar = (id: string) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="lb-card-premium lb-fade-up rounded-2xl p-4">
      {/* --------------------------------------------------------- cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-brand)]/12 text-[var(--color-brand)]">
            <ListOrdered className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Fila de distribuição automática</span>
            <span className="block text-[11px] text-white/60">
              {dados.ativa
                ? naFila.length > 0
                  ? `${naFila.length} consultor(es) no rodízio · próximo: ${dados.proximo?.nome ?? "—"}`
                  : "Ligada, mas sem ninguém na fila"
                : "Desligada — só a distribuição manual está valendo"}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </button>

        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
          {/* Ligar/desligar grava na hora: é o interruptor, não uma preferência. */}
          <button
            type="button"
            disabled={salvando}
            onClick={() =>
              void salvar(
                { ativa: !dados.ativa },
                dados.ativa ? "Distribuição automática desligada" : "Distribuição automática ligada",
              )
            }
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors ${
              dados.ativa
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                : "border-white/12 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${dados.ativa ? "bg-emerald-400" : "bg-white/30"}`}
              style={dados.ativa ? { boxShadow: "0 0 8px #34d399" } : undefined}
            />
            {dados.ativa ? "ATIVA" : "Desligada"}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          {/* ------------------------------------------------ ordem do rodízio */}
          {naFila.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Fila atual
                </p>
                <p className="mt-1 break-words text-sm font-medium">
                  {naFila.map((p) => p.nome).join("  →  ")}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--color-brand)]/35 bg-[var(--color-brand)]/10 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
                  Próximo da fila
                </p>
                <p className="mt-1 text-sm font-semibold">{dados.proximo?.nome ?? "—"}</p>
              </div>
            </div>
          )}

          {/* --------------------------------------------------- participantes */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
              Consultores participantes
            </p>
            <p className="mb-2 text-[11px] text-white/60">
              Estar ativo no CRM não coloca ninguém na fila. Só quem você marcar aqui recebe lead
              automaticamente — os demais continuam trabalhando normalmente.
            </p>

            <ul className="space-y-1.5">
              {dados.participantes.map((p) => (
                <li key={p.vendedorId} className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id={`fila-${p.vendedorId}`}
                    checked={marcados.has(p.vendedorId)}
                    onChange={() => alternar(p.vendedorId)}
                    className="h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                  />
                  <label htmlFor={`fila-${p.vendedorId}`} className="min-w-0 flex-1 truncate text-sm">
                    {p.nome}
                  </label>
                  {p.impedimento && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> {p.impedimento}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-xs text-white/60">
                    {p.recebeu} lead{p.recebeu === 1 ? "" : "s"}
                  </span>
                </li>
              ))}

              {dados.disponiveis.map((d) => (
                <li key={d.vendedorId} className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id={`fila-${d.vendedorId}`}
                    checked={marcados.has(d.vendedorId)}
                    onChange={() => alternar(d.vendedorId)}
                    className="h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                  />
                  <label
                    htmlFor={`fila-${d.vendedorId}`}
                    className="min-w-0 flex-1 truncate text-sm text-white/70"
                  >
                    {d.nome}
                  </label>
                  <span className="shrink-0 text-[11px] text-white/40">fora da fila</span>
                </li>
              ))}
            </ul>

            {dados.participantes.length === 0 && dados.disponiveis.length === 0 && (
              <p className="text-xs text-white/50">
                Nenhum consultor com cadastro e login ativos para entrar na fila.
              </p>
            )}

            {mudou && (
              <Button
                className="mt-3"
                disabled={salvando}
                onClick={() => void salvar({ membros: [...marcados] }, "Participantes da fila atualizados")}
              >
                <Save className="h-4 w-4" /> Salvar participantes
              </Button>
            )}
          </div>

          {/* ------------------------------------------------------- conferência */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
              Leads distribuídos automaticamente
            </p>
            <p className="mt-1 text-2xl font-bold leading-none">{dados.totalDistribuido}</p>

            {dados.ultimas.length > 0 && (
              <>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Últimas entregas
                </p>
                <ul className="mt-1 space-y-1">
                  {dados.ultimas.map((e) => (
                    <li key={`${e.leadId}-${e.em}`} className="flex flex-wrap gap-x-2 text-[11px] text-white/70">
                      <span className="font-medium text-white/90">{e.nome}</span>
                      <span>· posição {e.ordem}</span>
                      {e.telefone && <span>· {e.telefone}</span>}
                      <span className="text-white/45">· {fmt(e.em)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
