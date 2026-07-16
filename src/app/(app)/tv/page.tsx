"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/avatar";
import { RoleGuard } from "@/components/role-guard";
import { BRL } from "@/components/analise/widgets";
import { useAudit, useLeads, useMetas, useVendas, useVendedores } from "@/lib/store";
import { useCicloProducao } from "@/lib/use-ciclo";
import { useRankingPeriodo } from "@/lib/use-ranking";
import { periodFromPreset } from "@/lib/period";
import { metaTotalDoPeriodo, totalFaturado, vendasNoPeriodo } from "@/lib/selectors";
import { analisarFunil, receitaPrevista } from "@/lib/analise-comercial";
import { previsaoInteligente } from "@/lib/inteligencia";
import { refreshOnAppFocus } from "@/lib/refresh";

const MEDALHAS = ["🥇", "🥈", "🥉", "4º", "5º"];

/** Modo TV: painel em tela cheia pra exibir na empresa (ranking, meta,
 *  faturamento, última venda, conversão e previsão), com atualização
 *  automática a cada 60s. Somente admin abre (dados estratégicos). */
export default function TvPage() {
  return (
    <RoleGuard minimo="admin">
      <PainelTv />
    </RoleGuard>
  );
}

function PainelTv() {
  const leads = useLeads();
  const audits = useAudit();
  const vendas = useVendas();
  const vendedores = useVendedores();
  const metas = useMetas();
  const { config, feriados } = useCicloProducao();

  // Relógio + auto-refresh silencioso (60s) — TV fica sempre atual.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => {
      setAgora(new Date());
      refreshOnAppFocus();
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const periodoCiclo = useMemo(() => periodFromPreset("mes-atual", agora, config, feriados), [agora, config, feriados]);
  const vendasCiclo = useMemo(() => vendasNoPeriodo(vendas, periodoCiclo, config, feriados), [vendas, periodoCiclo, config, feriados]);
  const vendidoCiclo = useMemo(() => totalFaturado(vendasCiclo), [vendasCiclo]);
  const metaCiclo = useMemo(
    () => metaTotalDoPeriodo(vendedores.filter((v) => v.ativo), metas, periodoCiclo),
    [vendedores, metas, periodoCiclo],
  );
  const ranking = useRankingPeriodo(periodoCiclo, vendedores, vendas, metas, config, feriados);

  const geral = useMemo(() => {
    const ini = new Date(agora.getTime() - 90 * 86400000);
    return analisarFunil(leads, audits, vendas, { de: ini, ate: agora });
  }, [leads, audits, vendas, agora]);

  const fracao = useMemo(() => {
    const ini = periodoCiclo.from.getTime();
    const fim = periodoCiclo.to.getTime();
    return Math.max(0.02, Math.min(1, (agora.getTime() - ini) / Math.max(1, fim - ini)));
  }, [periodoCiclo, agora]);
  const previsao = useMemo(
    () =>
      previsaoInteligente({
        vendidoCiclo,
        previsaoRunRate: vendidoCiclo / fracao,
        pipelineProvavel: receitaPrevista(geral),
        vendidoCicloAnterior: 0,
        fracaoCicloDecorrida: fracao,
        qtdVendasCiclo: vendasCiclo.length,
      }),
    [vendidoCiclo, fracao, geral, vendasCiclo.length],
  );

  const ultimaVenda = useMemo(
    () => [...vendas].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0] ?? null,
    [vendas],
  );
  const nomeVendedor = (id: string) => vendedores.find((v) => v.id === id)?.nome ?? "—";
  const pctMeta = metaCiclo > 0 ? Math.min(100, (vendidoCiclo / metaCiclo) * 100) : 0;
  const top = ranking.slice(0, 5);
  const maxTop = Math.max(top[0]?.vendido ?? 0, 1);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[var(--color-bg,#0a0a0f)] p-6 md:p-10">
      {/* topo */}
      <div className="mb-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-4">
          <p className="text-lg font-semibold tabular-nums text-[var(--color-text-dim)]">
            {agora.toLocaleDateString("pt-BR")} · {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <Link href="/ia" className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-surface-2)]" aria-label="Sair do Modo TV">
            <X className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* meta gigante */}
      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--color-muted)]">Faturamento do ciclo</p>
            <p className="text-5xl font-extrabold tabular-nums text-[var(--color-text)] md:text-7xl">{BRL(vendidoCiclo)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--color-muted)]">Meta</p>
            <p className="text-3xl font-extrabold tabular-nums text-[var(--color-text-dim)] md:text-4xl">{BRL(metaCiclo)}</p>
          </div>
        </div>
        <div className="mt-4 h-6 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <div
            className="flex h-full items-center justify-end rounded-full pr-3 text-sm font-extrabold text-white transition-[width] duration-1000"
            style={{ width: `${Math.max(6, pctMeta)}%`, background: "linear-gradient(90deg, var(--color-brand), #22c55e 70%, #f5b301)" }}
          >
            {pctMeta.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Vendas no ciclo", valor: String(vendasCiclo.length) },
          { label: "Conversão geral", valor: `${geral.convGeral.toFixed(0)}%` },
          {
            label: "Última venda",
            valor: ultimaVenda ? BRL(ultimaVenda.valor) : "—",
            sub: ultimaVenda ? `${nomeVendedor(ultimaVenda.vendedorId)} · ${new Date(ultimaVenda.data).toLocaleDateString("pt-BR")}` : undefined,
          },
          { label: "Previsão do mês", valor: `${BRL(previsao.min)}–${BRL(previsao.max)}`, sub: previsao.tendenciaTexto },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-muted)]">{k.label}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--color-text)] md:text-3xl">{k.valor}</p>
            {k.sub ? <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">{k.sub}</p> : null}
          </div>
        ))}
      </div>

      {/* ranking */}
      <div className="mt-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-xl font-extrabold text-[var(--color-text)]">🏆 Ranking do ciclo</h2>
        <div className="space-y-3">
          {top.map((v, i) => (
            <div key={v.id} className="flex items-center gap-4">
              <span className="w-10 text-center text-2xl font-extrabold">{MEDALHAS[i]}</span>
              <Avatar id={v.id} nome={v.nome} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold text-[var(--color-text)]">{v.nome}</p>
                <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-1000"
                    style={{ width: `${(v.vendido / maxTop) * 100}%`, background: i === 0 ? "#f5b301" : "var(--color-brand)" }}
                  />
                </div>
              </div>
              <p className="shrink-0 text-xl font-extrabold tabular-nums text-[var(--color-text)] md:text-2xl">{BRL(v.vendido)}</p>
            </div>
          ))}
          {top.length === 0 ? <p className="py-6 text-center text-[var(--color-text-dim)]">Sem vendas no ciclo ainda.</p> : null}
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-[var(--color-muted)]">
        LB Representações · atualização automática a cada 60s
      </p>
    </div>
  );
}
