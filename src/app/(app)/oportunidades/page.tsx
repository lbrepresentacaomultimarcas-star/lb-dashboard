"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, ExternalLink, Lightbulb, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PremiumStage } from "@/components/premium-stage";
import { useLeads, useSession, useVendedores } from "@/lib/store";
import { LEAD_STATUS_INFO } from "@/lib/types";
import { analisarOportunidades, whatsappDoLead } from "@/lib/oportunidades";

const PRIORIDADE_INFO: Record<number, { label: string; tone: "danger" | "warn" | "neutral" }> = {
  3: { label: "Urgente", tone: "danger" },
  2: { label: "Importante", tone: "warn" },
  1: { label: "Atenção", tone: "neutral" },
};

export default function OportunidadesPage() {
  const leads = useLeads();
  const vendedores = useVendedores();
  const session = useSession();

  // Vendedor logado vê as suas por padrão; gestão vê todas (com filtro).
  const [vendedorFiltro, setVendedorFiltro] = useState<string>(
    session?.papel === "vendedor" && session.vendedorId ? session.vendedorId : "",
  );

  const oportunidades = useMemo(() => {
    const base = analisarOportunidades(leads);
    return vendedorFiltro ? base.filter((o) => o.lead.vendedorId === vendedorFiltro) : base;
  }, [leads, vendedorFiltro]);

  const urgentes = oportunidades.filter((o) => o.prioridade === 3).length;

  return (
    <PremiumStage>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text)]">
            <Lightbulb className="h-6 w-6 text-[var(--color-brand)]" /> Central de Oportunidades
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            O CRM analisa suas negociações e aponta onde agir agora — nada é movido automaticamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session?.papel !== "vendedor" ? (
            <select
              value={vendedorFiltro}
              onChange={(e) => setVendedorFiltro(e.target.value)}
              className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)]"
            >
              <option value="">Todos os vendedores</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          ) : null}
          <Badge tone={urgentes > 0 ? "danger" : "success"}>
            {oportunidades.length} oportunidade{oportunidades.length === 1 ? "" : "s"}
            {urgentes > 0 ? ` · ${urgentes} urgente${urgentes === 1 ? "" : "s"}` : ""}
          </Badge>
        </div>
      </div>

      {oportunidades.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-[var(--color-success)]" />
          <p className="mt-3 text-lg font-bold text-[var(--color-text)]">Tudo em dia! 👏</p>
          <p className="mt-1 max-w-md text-sm text-[var(--color-text-dim)]">
            Nenhuma negociação parada ou compromisso pendente detectado. As oportunidades aparecem aqui
            automaticamente conforme o funil se movimenta.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {oportunidades.map((o) => {
            const st = LEAD_STATUS_INFO[o.lead.status];
            const pr = PRIORIDADE_INFO[o.prioridade];
            const wa = whatsappDoLead(o.lead);
            const vend = vendedores.find((v) => v.id === o.lead.vendedorId);
            return (
              <div
                key={o.lead.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-[var(--color-text)]">{o.lead.nome}</p>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <Badge tone={pr.tone}>{pr.label}</Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
                        <Clock className="h-3.5 w-3.5" /> {o.diasParado} dia{o.diasParado === 1 ? "" : "s"} parado
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{o.motivo}</p>
                    <p className="mt-0.5 text-sm text-[var(--color-text)]">🧠 {o.diagnostico}</p>
                    <p className="text-sm text-[var(--color-text-dim)]">💡 {o.sugestao}</p>
                    {o.baseLimitada ? (
                      <p className="text-[11px] italic text-[var(--color-muted)]">
                        Recomendação baseada apenas na etapa atual e no tempo parado.
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {o.lead.valorEstimado > 0
                        ? `Valor estimado: ${o.lead.valorEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                        : ""}
                      {vend ? `${o.lead.valorEstimado > 0 ? " · " : ""}Vendedor: ${vend.nome}` : ""}
                      {o.trecho ? ` · Detectado na observação deste cliente: “…${o.trecho}…”` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {wa ? (
                      <a href={wa} target="_blank" rel="noopener">
                        <Button size="sm">
                          <MessageCircle className="h-4 w-4" /> WhatsApp
                        </Button>
                      </a>
                    ) : null}
                    <Link href="/leads">
                      <Button size="sm" variant="secondary">
                        <ExternalLink className="h-4 w-4" /> Ver no funil
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
        A Central usa apenas informações já registradas (etapa, observações e datas) — os cards e o funil nunca são
        alterados automaticamente.
      </p>
    </PremiumStage>
  );
}
