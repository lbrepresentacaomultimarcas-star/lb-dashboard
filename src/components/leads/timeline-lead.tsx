"use client";

import { useMemo } from "react";
import { History } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useAudit, useVendasAll } from "@/lib/store";
import { timelineDoLead } from "@/lib/inteligencia";
import type { Lead } from "@/lib/types";

/** Linha do tempo completa do lead: criação, movimentações no funil, edições,
 *  observação e venda — em ordem cronológica (mais recente primeiro). */
export function TimelineLead({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const audits = useAudit();
  const vendas = useVendasAll();
  const eventos = useMemo(
    () => (lead ? timelineDoLead(lead, audits, vendas) : []),
    [lead, audits, vendas],
  );

  return (
    <Modal
      open={lead !== null}
      onClose={onClose}
      title={lead ? `Linha do tempo — ${lead.nome}` : "Linha do tempo"}
      subtitle="Toda a jornada do cliente, em ordem cronológica."
      icon={<History className="h-5 w-5" />}
    >
      {eventos.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">Sem eventos registrados ainda.</p>
      ) : (
        <div className="relative max-h-[60vh] overflow-y-auto pl-5">
          <div className="absolute bottom-2 left-[9px] top-2 w-px bg-[var(--color-border)]" />
          <div className="space-y-4 py-1">
            {eventos.map((e, i) => (
              <div key={i} className="relative">
                <span className="absolute -left-5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--color-surface-2)] text-[11px]">
                  {e.emoji}
                </span>
                <div className="pl-2">
                  <p className="text-sm font-semibold text-[var(--color-text)]">{e.titulo}</p>
                  {e.detalhe ? <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">{e.detalhe}</p> : null}
                  <p className="mt-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">
                    {new Date(e.quando).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
