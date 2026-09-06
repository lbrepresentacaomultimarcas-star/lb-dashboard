"use client";

/*
 * MEU PERFIL — a identidade profissional de quem está logado.
 *
 * Não existia lugar nenhum onde um consultor pudesse ver o próprio código,
 * cargo ou equipe: /configuracoes é só do admin, e o resto do CRM é sobre
 * cliente, não sobre a pessoa. Esta tela preenche esse vazio.
 *
 * É só LEITURA. Cargo, código e liberação são decisões administrativas —
 * quem muda é o admin, no Administrativo. Aqui a pessoa se reconhece; não
 * se promove.
 */

import { useMemo } from "react";
import { BadgeCheck, IdCard } from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import { JornadaCarreira } from "@/components/jornada-carreira";
import { useEquipes, useRoster, useSession } from "@/lib/store";
import { PAPEL_INFO } from "@/lib/types";
import { degrauDe } from "@/lib/jornada";

function Dado({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {rotulo}
      </p>
      <div className="mt-1 break-words text-sm font-bold text-[var(--color-text)]">{valor}</div>
    </div>
  );
}

export default function PerfilPage() {
  const session = useSession();
  const roster = useRoster();
  const equipes = useEquipes();

  // O roster já vem escopado pela empresa; aqui só se procura a si mesmo.
  const eu = useMemo(() => roster.find((p) => p.id === session?.id), [roster, session?.id]);

  const equipe = equipes.find((e) => e.id === eu?.equipeId);
  const degrau = degrauDe(session?.papel);
  const liberado = eu?.codigoLiberado !== false;

  return (
    <PremiumStage>
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-brand)]/15 text-[var(--color-brand)]">
            <IdCard className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{session?.nome ?? "—"}</h1>
            <p className="truncate text-sm text-[var(--color-text-dim)]">{session?.email}</p>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <Dado
            rotulo="Cargo"
            valor={degrau?.rotulo ?? (session ? PAPEL_INFO[session.papel].label : "—")}
          />
          <Dado
            rotulo="Código de acesso"
            valor={
              <span className="font-mono tracking-wider">{eu?.codigoAcesso ?? "—"}</span>
            }
          />
          <Dado
            rotulo="Status de acesso"
            valor={
              <span className={liberado ? "text-emerald-400" : "text-amber-300"}>
                {liberado ? "Acesso liberado" : "Aguardando liberação"}
              </span>
            }
          />
          <Dado rotulo="Equipe" valor={equipe?.nome ?? "Sem equipe"} />
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand)]" />
          <p className="text-xs text-[var(--color-text-dim)]">
            Seu código é a sua identificação para entrar no sistema. Ele não muda de cargo para
            cargo — é seu. Para entrar, use o código e a sua senha.
          </p>
        </div>

        {/* Só faz sentido para quem está na trilha comercial. O administrador
            é o dono da operação, não um degrau dela. */}
        {degrau && <JornadaCarreira papel={session?.papel} codigo={eu?.codigoAcesso} />}
      </div>
    </PremiumStage>
  );
}
