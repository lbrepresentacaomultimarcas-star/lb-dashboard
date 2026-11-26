"use client";

/*
 * PROMOÇÃO AGENDADA.
 *
 * O admin marca cargo novo, dia, horário e o que preparar. O colaborador vê o
 * card em destaque (com contagem regressiva) e recebe avisos no sino. O cargo
 * só muda quando o admin clica "Promover agora" — decisão da administração.
 * Ao ser promovido, o colaborador vê uma comemoração com confete na tela.
 */

import { useEffect, useState } from "react";
import { Award, CalendarClock, PartyPopper, Trophy, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { reloadRoster, useSession } from "@/lib/store";
import { supabaseEnabled } from "@/lib/supabase/client";
import { JORNADA, degrauDe, proximoDegrau } from "@/lib/jornada";
import { aoMudarDesenvolvimento, promocoesApi } from "@/lib/desenvolvimento-api";
import { BotaoFotoPromocao } from "./mural-promocao";
import { Confete } from "./confete";
import {
  chaveHoje,
  dataHoraBR,
  noMural,
  dataHoraBrasilia,
  faltaParaPromocao,
  separarDataHora,
  type PromocaoAgendada,
} from "@/lib/desenvolvimento";
import type { Papel } from "@/lib/types";

const rotulo = (papel?: string) => degrauDe(papel as Papel)?.rotulo ?? papel ?? "—";
const AREA =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40";

export function usePromocoes(profileId: string | undefined) {
  const [lista, setLista] = useState<PromocaoAgendada[]>([]);
  const [versao, setVersao] = useState(0);
  useEffect(() => aoMudarDesenvolvimento(() => setVersao((v) => v + 1)), []);
  useEffect(() => {
    if (!profileId) return;
    let vivo = true;
    promocoesApi
      .listar(profileId)
      .then((l) => vivo && setLista(l))
      .catch(() => {
        /* antes da migração a tabela não existe: o bloco some */
      });
    return () => {
      vivo = false;
    };
  }, [profileId, versao]);
  return lista;
}

type Rascunho = { id?: string; cargoNovo: string; data: string; hora: string; mensagem: string };

export function PromocaoCard({
  profileId,
  papel,
  souEu,
  admin,
  nome,
}: {
  profileId: string;
  papel?: Papel;
  souEu: boolean;
  admin: boolean;
  nome: string;
}) {
  const lista = usePromocoes(profileId);
  const agendada = lista.find((p) => p.status === "agendada");
  const feitas = lista.filter((p) => p.status === "realizada");
  const [form, setForm] = useState<Rascunho | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [festa, setFesta] = useState(false);
  const primeiro = nome.split(" ")[0];

  // cargos acima do atual (a trilha da operação)
  const idx = JORNADA.findIndex((d) => d.papel === papel);
  const opcoes = JORNADA.slice(idx + 1);

  if (!agendada && feitas.length === 0 && !admin) return null;

  function abrirNovo() {
    const amanha = new Date(Date.now() + 86_400_000);
    setForm({ cargoNovo: proximoDegrau(papel)?.papel ?? opcoes[0]?.papel ?? "lider", data: chaveHoje(amanha), hora: "09:00", mensagem: "" });
  }

  async function salvar() {
    if (!form) return;
    if (!form.data || !/^\d{2}:\d{2}$/.test(form.hora)) return notify.error("Escolha o dia e o horário.");
    const dataHora = dataHoraBrasilia(form.data, form.hora);
    setOcupado(true);
    try {
      if (form.id) {
        await promocoesApi.atualizar(form.id, { cargoNovo: form.cargoNovo, dataHora, mensagem: form.mensagem });
        notify.success("Promoção remarcada", `${primeiro} foi avisado(a) no sino.`);
      } else {
        await promocoesApi.agendar({ profileId, cargoAtual: papel, cargoNovo: form.cargoNovo, dataHora, mensagem: form.mensagem });
        notify.success("Promoção agendada", `${primeiro} foi avisado(a) no sino para vir preparado(a).`);
      }
      setForm(null);
    } catch (e) {
      notify.error("Não foi possível salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  async function promoverAgora(p: PromocaoAgendada) {
    if (
      !window.confirm(
        `Promover ${nome} de ${rotulo(papel)} para ${rotulo(p.cargoNovo)} agora?\n\nO cargo, o código de acesso e as permissões mudam na hora. ${primeiro} recebe o aviso no sino e uma comemoração na tela.`,
      )
    )
      return;
    setOcupado(true);
    try {
      if (supabaseEnabled) {
        // mesma troca de cargo da tela Colaboradores (o servidor confere se é admin)
        const r = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: profileId, papel: p.cargoNovo }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j as { error?: string }).error ?? "Não foi possível trocar o cargo.");
      }
      await promocoesApi.atualizar(p.id, { status: "realizada" });
      await reloadRoster().catch(() => undefined);
      setFesta(true);
      notify.success(`🏆 ${primeiro} agora é ${rotulo(p.cargoNovo)}!`, "Cargo e código atualizados. O sino já avisou.");
    } catch (e) {
      notify.error("A promoção não foi aplicada", e instanceof Error ? e.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  async function tirarDaAgenda(p: PromocaoAgendada) {
    if (!window.confirm(`Tirar da agenda a promoção de ${nome}? ${primeiro} é avisado(a) que uma nova data será combinada.`)) return;
    setOcupado(true);
    try {
      await promocoesApi.atualizar(p.id, { status: "cancelada" });
      notify.success("Promoção tirada da agenda");
    } catch (e) {
      notify.error("Não foi possível alterar", e instanceof Error ? e.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  // no dia (ou depois) o botão "Promover agora" pulsa
  const chegou = agendada ? ["É hoje!", "A data já passou"].includes(faltaParaPromocao(agendada.dataHora)) : false;

  return (
    <>
      {agendada ? (
        <section className="overflow-hidden rounded-xl border-2 border-[#C9A227] bg-gradient-to-br from-[#C9A227]/20 via-[var(--color-surface)] to-[var(--color-surface)] p-4">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#e8c95a]">
            <Award className="h-4 w-4" /> {souEu ? "Sua promoção está marcada" : "Promoção agendada"}
          </p>
          <p className="mt-2 text-2xl font-black">
            🎖️ {rotulo(agendada.cargoAtual ?? papel)} → {rotulo(agendada.cargoNovo)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-[#e8c95a]" />
            <b>{dataHoraBR(agendada.dataHora)}</b>
            <span className="rounded-full bg-[#C9A227] px-2.5 py-0.5 text-xs font-black text-black">
              {faltaParaPromocao(agendada.dataHora)}
            </span>
          </p>
          {agendada.mensagem && (
            <div className="mt-3 rounded-lg bg-black/20 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#e8c95a]">Como se preparar</p>
              <p className="mt-1 whitespace-pre-line text-sm">{agendada.mensagem}</p>
            </div>
          )}
          <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
            {souEu
              ? "Venha preparado(a)! O cargo muda no dia, pela administração."
              : `Marcada em ${dataHoraBR(agendada.criadoEm)}. O cargo só muda quando você clicar em "Promover agora".`}
          </p>
          {admin && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={ocupado} onClick={() => void promoverAgora(agendada)} className={chegou ? "animate-pulse" : ""}>
                <Trophy className="h-4 w-4" /> Promover agora
              </Button>
              <Button
                variant="secondary"
                disabled={ocupado}
                onClick={() => {
                  const { data, hora } = separarDataHora(agendada.dataHora);
                  setForm({ id: agendada.id, cargoNovo: agendada.cargoNovo, data, hora, mensagem: agendada.mensagem ?? "" });
                }}
              >
                <CalendarClock className="h-4 w-4" /> Remarcar
              </Button>
              <Button variant="ghost" className="text-red-400" disabled={ocupado} onClick={() => void tirarDaAgenda(agendada)}>
                Tirar da agenda
              </Button>
            </div>
          )}
        </section>
      ) : (
        admin &&
        opcoes.length > 0 && (
          <section className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[#C9A227]/60 bg-[var(--color-surface)] p-4">
            <Award className="h-5 w-5 text-[#e8c95a]" />
            <p className="min-w-0 flex-1 text-sm text-[var(--color-text-dim)]">
              Decidiu promover {primeiro}? Marque o dia e o horário para {primeiro} vir preparado(a).
            </p>
            <Button onClick={abrirNovo}>
              <Award className="h-4 w-4" /> Agendar promoção
            </Button>
          </section>
        )
      )}

      {feitas.length > 0 && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
            <Trophy className="h-3.5 w-3.5" /> Promoções conquistadas
          </p>
          <ul className="space-y-1 text-sm">
            {feitas.map((p) => (
              <li key={p.id}>
                🏆 {rotulo(p.cargoAtual)} → <b>{rotulo(p.cargoNovo)}</b> em {dataHoraBR(p.realizadaEm ?? p.dataHora)}
                {(admin || souEu) && noMural(p.realizadaEm) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--color-surface-2)] p-2 text-xs text-[var(--color-text-dim)]">
                    <span>📸 No mural do Dashboard por 3 dias{p.fotoUrl ? " — com foto" : " — ainda sem foto"}.</span>
                    <BotaoFotoPromocao promocaoId={p.id} temFoto={Boolean(p.fotoUrl)} compacto />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {form && (
        <Modal open onClose={() => setForm(null)} title={form.id ? "Remarcar promoção" : "Agendar promoção"} subtitle={nome} icon={<Award className="h-5 w-5" />}>
          <div className="space-y-3">
            <div>
              <Label htmlFor="pr-cargo">Novo cargo</Label>
              <select
                id="pr-cargo"
                value={form.cargoNovo}
                onChange={(e) => setForm({ ...form, cargoNovo: e.target.value })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                {opcoes.map((d) => (
                  <option key={d.papel} value={d.papel}>
                    {d.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pr-data">Dia da promoção</Label>
                <Input id="pr-data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pr-hora">Horário (Brasília)</Label>
                <Input id="pr-hora" type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="pr-msg">Como se preparar (aparece para {primeiro})</Label>
              <textarea
                id="pr-msg"
                rows={3}
                className={AREA}
                placeholder="Ex.: Traga os números do seu time e uma apresentação de 5 minutos sobre os próximos 90 dias."
                value={form.mensagem}
                onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
              />
            </div>
            <p className="text-xs text-[var(--color-text-dim)]">
              {primeiro} é avisado(a) no sino agora, na véspera e no dia. O cargo só muda quando você clicar em “Promover agora”.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button disabled={ocupado} onClick={() => void salvar()}>
                {form.id ? "Salvar nova data" : "Agendar e avisar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {festa && <Confete onFim={() => setFesta(false)} />}
    </>
  );
}

/**
 * Ao abrir o CRM depois de promovido, o colaborador vê a comemoração uma vez.
 * Fica no layout, então aparece em qualquer tela.
 */
export function ComemoracaoPromocao() {
  const session = useSession();
  const id = session?.id;
  const [promo, setPromo] = useState<PromocaoAgendada | null>(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => aoMudarDesenvolvimento(() => setVersao((v) => v + 1)), []);
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    const t = setTimeout(() => {
      promocoesApi
        .comemoracaoPendente(id)
        .then((p) => vivo && setPromo(p))
        .catch(() => {
          /* sem a tabela: sem comemoração */
        });
    }, 1500);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [id, versao]);

  if (!promo) return null;

  async function fechar() {
    const p = promo;
    setPromo(null);
    if (p) await promocoesApi.atualizar(p.id, { comemoracaoVistaEm: new Date().toISOString() }).catch(() => undefined);
  }

  return (
    <div className="fixed inset-0 z-[250] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label="Parabéns pela promoção">
      <Confete duracao={7000} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border-2 border-[#C9A227] bg-[#0B1F3A] p-6 text-center text-white shadow-2xl">
        <button type="button" onClick={() => void fechar()} className="absolute right-3 top-3 text-white/60 hover:text-white" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
        <PartyPopper className="mx-auto h-12 w-12 text-[#e8c95a]" />
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.3em] text-[#e8c95a]">Parabéns, {session?.nome?.split(" ")[0]}!</p>
        <p className="mt-2 text-3xl font-black">Agora você é {rotulo(promo.cargoNovo)} 🏆</p>
        <p className="mt-2 text-sm text-white/80">
          Promoção feita em {dataHoraBR(promo.realizadaEm ?? promo.dataHora)}. Conquista sua — a LB Representações reconhece o seu trabalho.
        </p>
        <div className="mt-4 rounded-xl border border-[#C9A227]/50 bg-white/5 p-3 text-sm">
          <p className="mb-2 text-white/80">Sua promoção aparece para toda a equipe no Dashboard por 3 dias. Mande uma foto!</p>
          <BotaoFotoPromocao promocaoId={promo.id} temFoto={Boolean(promo.fotoUrl)} />
        </div>
        <Button className="mt-4 w-full" variant="secondary" onClick={() => void fechar()}>
          Obrigado(a)! 🎉
        </Button>
      </div>
    </div>
  );
}
