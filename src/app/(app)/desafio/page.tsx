"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, Settings2 } from "lucide-react";
import { useReady } from "@/lib/store";
import { metaColetivaDe, periodoBR } from "@/lib/desafio";
import { PainelDesafio } from "@/components/desafio/painel-desafio";
import { GOLD, NAVY, brl, useDesafiosVisiveis, usePermissoesDesafio } from "@/components/desafio/desafio-ui";

/** Desafio em andamento. Com mais de um ao mesmo tempo, mostra a lista para escolher. */
export default function DesafioPage() {
  const ready = useReady();
  const visiveis = useDesafiosVisiveis();
  const { admin } = usePermissoesDesafio();
  if (!ready) return null;

  const gerenciar = admin && (
    <div className="mx-auto flex max-w-6xl justify-end">
      <Link
        href="/desafio/gerenciar"
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"
        style={{ borderColor: GOLD, color: GOLD }}
      >
        <Settings2 className="h-4 w-4" aria-hidden /> Gerenciar desafios
      </Link>
    </div>
  );

  if (visiveis.length === 1) {
    return (
      <div className="space-y-3">
        {gerenciar}
        <PainelDesafio desafio={visiveis[0]} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      {gerenciar}
      {visiveis.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center" style={{ color: NAVY }}>
          <CalendarClock className="mx-auto h-10 w-10" style={{ color: GOLD }} aria-hidden />
          <p className="mt-3 text-xl font-black">Nenhum desafio em andamento</p>
          <p className="mt-1 text-slate-600">Quando um novo desafio começar, ele aparece aqui automaticamente.</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-black">Desafios em andamento</h1>
          {visiveis.map((d) => (
            <Link
              key={d.id}
              href={`/desafio/${d.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl p-5 text-white"
              style={{ background: NAVY, borderBottom: `4px solid ${GOLD}` }}
            >
              <div>
                <p className="text-lg font-black">{d.titulo}</p>
                <p className="text-sm text-white/80">
                  {periodoBR(d)} · objetivo {brl(metaColetivaDe(d))}
                </p>
              </div>
              <ChevronRight className="h-6 w-6 shrink-0" style={{ color: GOLD }} aria-hidden />
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
