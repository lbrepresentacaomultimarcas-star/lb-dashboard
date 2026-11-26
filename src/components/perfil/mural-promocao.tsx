"use client";

/*
 * MURAL DE PROMOÇÃO (topo do Dashboard).
 *
 * Quem foi promovido nos últimos 3 dias aparece para a equipe inteira, com
 * foto, cargo novo, data e o recado do admin. Cada pessoa vê o confete na
 * primeira vez que o mural aparece para ela. A foto pode ser enviada pelo
 * próprio promovido ou pelo admin; depois de 3 dias o mural some sozinho.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, MessageSquareText, PartyPopper } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { useRoster, useSession } from "@/lib/store";
import { temPermissao } from "@/lib/permissions";
import { degrauDe } from "@/lib/jornada";
import { aoMudarDesenvolvimento, muralApi, promocoesApi } from "@/lib/desenvolvimento-api";
import { dataHoraBR, type ItemMural } from "@/lib/desenvolvimento";
import type { Papel } from "@/lib/types";
import { Confete } from "./confete";

const rotulo = (papel?: string) => degrauDe(papel as Papel)?.rotulo ?? papel ?? "—";
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** Botão "Enviar foto" / "Trocar foto" do mural (promovido ou admin). */
export function BotaoFotoPromocao({
  promocaoId,
  temFoto,
  compacto = false,
}: {
  promocaoId: string;
  temFoto: boolean;
  compacto?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(true);
    try {
      await muralApi.enviarFoto(promocaoId, arquivo);
      notify.success("Foto no mural!", "A equipe vê no Dashboard por 3 dias.");
    } catch (e) {
      notify.error("Não foi possível enviar a foto", e instanceof Error ? e.message : undefined);
    } finally {
      setEnviando(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void escolher(e.target.files?.[0])}
      />
      <Button
        size={compacto ? "sm" : "md"}
        variant={temFoto ? "secondary" : "primary"}
        disabled={enviando}
        onClick={() => input.current?.click()}
      >
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {temFoto ? "Trocar foto" : "Enviar foto para o mural"}
      </Button>
    </>
  );
}

export function MuralPromocoes() {
  const session = useSession();
  const roster = useRoster();
  const admin = temPermissao(session, "admin");
  const [itens, setItens] = useState<ItemMural[]>([]);
  const [versao, setVersao] = useState(0);
  const [festa, setFesta] = useState(false);
  const [legenda, setLegenda] = useState<{ id: string; texto: string } | null>(null);
  const nomes = useMemo(() => new Map(roster.map((p) => [p.id, p.nome])), [roster]);

  useEffect(() => aoMudarDesenvolvimento(() => setVersao((v) => v + 1)), []);
  useEffect(() => {
    if (!session?.id) return;
    let vivo = true;
    muralApi
      .listar(nomes)
      .then((l) => {
        if (!vivo) return;
        setItens(l);
        // confete uma vez por pessoa e por promoção
        try {
          const novos = l.filter((i) => !localStorage.getItem(`lb:mural_visto:${session.id}:${i.id}`));
          if (novos.length) {
            novos.forEach((i) => localStorage.setItem(`lb:mural_visto:${session.id}:${i.id}`, "1"));
            setFesta(true);
          }
        } catch {
          /* sem armazenamento: sem confete, o mural aparece igual */
        }
      })
      .catch(() => {
        /* antes da migração: sem mural, Dashboard igual */
      });
    return () => {
      vivo = false;
    };
  }, [session?.id, nomes, versao]);

  if (itens.length === 0) return null;

  async function salvarLegenda() {
    if (!legenda) return;
    try {
      await promocoesApi.atualizar(legenda.id, { legenda: legenda.texto });
      notify.success("Recado atualizado no mural");
      setLegenda(null);
    } catch (e) {
      notify.error("Não foi possível salvar", e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <section className="lb-fade-up space-y-3" aria-label="Promoções da equipe">
      {itens.map((i) => {
        const podeFoto = admin || i.profileId === session?.id;
        return (
          <div
            key={i.id}
            className="relative overflow-hidden rounded-2xl border-2 border-[#C9A227] p-4 sm:p-5"
            style={{
              background:
                "radial-gradient(circle at 15% 20%, rgba(232,201,90,.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(201,162,39,.25), transparent 50%), linear-gradient(135deg, #0B1F3A, #132b4f)",
            }}
          >
            {/* bandeirinhas */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex justify-around text-lg opacity-80">
              {["🎉", "✨", "🎊", "⭐", "🎉", "✨", "🎊"].map((e, k) => (
                <span key={k} className="animate-bounce" style={{ animationDelay: `${k * 120}ms`, animationDuration: "2.4s" }}>
                  {e}
                </span>
              ))}
            </div>
            <div className="relative mt-4 flex flex-col items-center gap-4 text-center text-white sm:flex-row sm:text-left">
              <div className="relative shrink-0">
                {i.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={i.fotoUrl}
                    alt={`Foto de ${i.nome}`}
                    className="h-28 w-28 rounded-full border-4 border-[#e8c95a] object-cover shadow-[0_0_30px_rgba(232,201,90,.6)] sm:h-32 sm:w-32"
                  />
                ) : (
                  <div className="grid h-28 w-28 place-items-center rounded-full border-4 border-[#e8c95a] bg-[#C9A227]/20 text-4xl font-black text-[#e8c95a] sm:h-32 sm:w-32">
                    {iniciais(i.nome)}
                  </div>
                )}
                <span className="absolute -bottom-1 -right-1 grid h-10 w-10 place-items-center rounded-full bg-[#C9A227] text-xl shadow-lg">🏆</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-[#e8c95a] sm:justify-start">
                  <PartyPopper className="h-4 w-4" /> Promoção na equipe!
                </p>
                <p className="mt-1 text-2xl font-black sm:text-3xl">{i.nome}</p>
                <p className="text-lg">
                  agora é <b className="text-[#e8c95a]">{rotulo(i.cargoNovo)}</b>
                  {i.cargoAtual ? <span className="text-white/60"> (era {rotulo(i.cargoAtual)})</span> : null}
                </p>
                <p className="text-xs text-white/60">Promovido(a) em {dataHoraBR(i.realizadaEm)}</p>
                {i.legenda && <p className="mt-2 text-base italic text-white/90">“{i.legenda}”</p>}
                {(podeFoto || admin) && (
                  <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                    {podeFoto && <BotaoFotoPromocao promocaoId={i.id} temFoto={Boolean(i.fotoUrl)} compacto />}
                    {admin && (
                      <Button size="sm" variant="secondary" onClick={() => setLegenda({ id: i.id, texto: i.legenda ?? "" })}>
                        <MessageSquareText className="h-4 w-4" /> {i.legenda ? "Editar recado" : "Escrever recado"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {legenda && (
        <Modal open onClose={() => setLegenda(null)} title="Recado no mural" subtitle="Aparece para a equipe inteira, junto da foto." icon={<MessageSquareText className="h-5 w-5" />}>
          <div className="space-y-3">
            <textarea
              rows={3}
              maxLength={200}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
              placeholder="Ex.: Parabéns, Ana! Liderança construída com dedicação. Conte com a gente!"
              value={legenda.texto}
              onChange={(e) => setLegenda({ ...legenda, texto: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setLegenda(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void salvarLegenda()}>Salvar recado</Button>
            </div>
          </div>
        </Modal>
      )}

      {festa && <Confete duracao={4500} onFim={() => setFesta(false)} />}
    </section>
  );
}
