"use client";

/*
 * MEU PERFIL — o mapa de evolução profissional.
 *
 * Não é mais um relatório: o CRM já tem Performance e Histórico, e duplicá-los
 * aqui só encheria a tela. Esta página responde outra pergunta — o que eu faço
 * com isso amanhã?
 *
 * A MESMA página serve o administrador: com `?de=<id>` ele abre o mapa de um
 * colaborador para conduzir a conversa de desenvolvimento. Um componente só,
 * então gestor e consultor nunca leem diagnósticos diferentes do mesmo funil.
 *
 * O escopo não é decidido aqui: `useLeads`/`useAudit` já chegam filtrados pelo
 * que a pessoa logada pode ver, e a RLS filtrou antes disso. Um consultor que
 * digitasse `?de=` de outro não montaria mapa nenhum — o funil do outro não
 * está no navegador dele.
 */

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, IdCard, Users } from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import { JornadaCarreira } from "@/components/jornada-carreira";
import { MapaEvolucao } from "@/components/perfil/mapa-evolucao";
import { PlanoEvolucaoCard } from "@/components/perfil/plano-evolucao";
import { useEquipes, useRoster, useSession } from "@/lib/store";
import { temPermissao } from "@/lib/permissions";
import { PAPEL_INFO } from "@/lib/types";
import { degrauDe } from "@/lib/jornada";
import { useEvolucao } from "@/lib/use-evolucao";

/**
 * Frases do cabeçalho.
 *
 * Trocam por DIA, não a cada render: uma frase que muda enquanto a pessoa lê
 * vira ruído. O índice sai da data, então todo mundo vê a mesma frase no mesmo
 * dia — e amanhã, outra.
 */
const FRASES = [
  "Seu cargo mostra onde você está. Sua atitude mostra até onde você pode chegar.",
  "Seu próximo nível começa nas atitudes que você toma hoje.",
  "Resultado constrói confiança. Constância constrói crescimento.",
  "Quem cuida do processo colhe o resultado.",
  "O que você faz repetidamente é o que você se torna.",
];

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
  const admin = temPermissao(session, "admin");

  // Quem estou olhando. Sem `?de=`, sou eu.
  const [alvoId, setAlvoId] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const de = new URLSearchParams(window.location.search).get("de");
      if (de) setAlvoId(de);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const souEu = !alvoId || alvoId === session?.id;
  const pessoa = useMemo(
    () => roster.find((p) => p.id === (souEu ? session?.id : alvoId)),
    [roster, souEu, session?.id, alvoId],
  );

  const papel = souEu ? session?.papel : pessoa?.papel;
  const equipe = equipes.find((e) => e.id === pessoa?.equipeId);
  const degrau = degrauDe(papel);
  const liberado = pessoa?.codigoLiberado !== false;

  const mapa = useEvolucao(pessoa?.vendedorRef);

  const frase = useMemo(() => {
    const dia = Math.floor(new Date().getTime() / 86_400_000);
    return FRASES[dia % FRASES.length];
  }, []);

  const nome = souEu ? (session?.nome ?? "—") : (pessoa?.nome ?? "Colaborador");

  return (
    <PremiumStage>
      <div className="mx-auto max-w-2xl space-y-5">
        {/* ============================ cabeçalho ============================ */}
        <header className="lb-fade-up overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-brand)]/15 via-[var(--color-surface)] to-[var(--color-surface)] p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-brand)]/20 text-[var(--color-brand)]">
              <IdCard className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight">{nome}</h1>
              <p className="truncate text-sm text-[var(--color-text-dim)]">
                {degrau?.rotulo ?? (papel ? PAPEL_INFO[papel].label : "—")}
                {pessoa?.codigoAcesso ? (
                  <span className="ml-2 font-mono text-xs tracking-wider text-[var(--color-muted)]">
                    {pessoa.codigoAcesso}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          {souEu && (
            <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-sm italic text-[var(--color-text-dim)]">
              “{frase}”
            </p>
          )}
        </header>

        {/* Aviso de que o admin está vendo o perfil de outra pessoa. */}
        {!souEu && (
          <div className="flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand)]" />
            <p className="text-xs text-[var(--color-text-dim)]">
              Você está vendo o mapa de <strong>{nome}</strong>, para acompanhamento. O plano de
              evolução é escrito por {nome.split(" ")[0]} — você lê, não edita.
            </p>
          </div>
        )}

        {/* ============================== dados ============================= */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Dado rotulo="Cargo" valor={degrau?.rotulo ?? (papel ? PAPEL_INFO[papel].label : "—")} />
          <Dado
            rotulo="Código de acesso"
            valor={<span className="font-mono tracking-wider">{pessoa?.codigoAcesso ?? "—"}</span>}
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

        {souEu && (
          <div className="flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand)]" />
            <p className="text-xs text-[var(--color-text-dim)]">
              Seu código é a sua identificação para entrar no sistema. Ele é seu e não muda de
              cargo para cargo.
            </p>
          </div>
        )}

        {/* =========================== o mapa =========================== */}
        <MapaEvolucao mapa={mapa} papel={papel} primeiraPessoa={souEu} nome={nome} />

        {/* ======================== plano pessoal ======================= */}
        {pessoa && (
          <PlanoEvolucaoCard
            profileId={pessoa.id}
            atual={mapa.atual}
            podeEditar={souEu}
            nome={nome}
          />
        )}

        {/* ========================== trajetória ========================= */}
        {degrau && <JornadaCarreira papel={papel} codigo={pessoa?.codigoAcesso} />}

        {/* Atalho do admin para o próprio perfil quando está olhando outro. */}
        {!souEu && admin && (
          <p className="text-center">
            <a href="/perfil" className="text-xs text-[var(--color-brand)] hover:underline">
              ← Voltar ao meu perfil
            </a>
          </p>
        )}
      </div>
    </PremiumStage>
  );
}
