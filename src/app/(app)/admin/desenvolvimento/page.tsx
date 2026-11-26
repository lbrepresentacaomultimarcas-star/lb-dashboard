"use client";

/*
 * DESENVOLVIMENTO DA EQUIPE (admin).
 *
 * Visão geral: cargo, objetivo, % do plano de passos, situação da última
 * avaliação, pendências e ciência de cada colaborador. Daqui o admin abre o
 * perfil da pessoa para avaliar, cadastrar e validar passos.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronRight, GraduationCap, Settings2 } from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { useEquipes, useNotificacoes, useRoster, useSession } from "@/lib/store";
import { lerAvisosDesenvolvimento } from "@/lib/use-pendentes";
import { planosApi, type PlanoEvolucao } from "@/lib/planos";
import { aoMudarDesenvolvimento, avaliacoesApi, configDevApi, passosApi } from "@/lib/desenvolvimento-api";
import {
  CONFIG_DEV_PADRAO,
  SITUACAO_INFO,
  avaliacaoEmDia,
  chaveHoje,
  dataHoraBR,
  mesCurto,
  mesDevido,
  mesRotulo,
  passoAtrasado,
  progressoPassos,
  proximaDataAvaliacao,
  ultimaAvaliacao,
  type AvaliacaoMensal,
  type ConfigDesenvolvimento,
  type PassoPlano,
  type Situacao,
} from "@/lib/desenvolvimento";
import { degrauDe } from "@/lib/jornada";
import { PAPEL_INFO } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filtro = "todas" | Situacao | "sem";

export default function DesenvolvimentoEquipePage() {
  const roster = useRoster();
  const equipes = useEquipes();
  const [planos, setPlanos] = useState<PlanoEvolucao[]>([]);
  const [passos, setPassos] = useState<PassoPlano[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoMensal[]>([]);
  const [cfg, setCfg] = useState<ConfigDesenvolvimento>(CONFIG_DEV_PADRAO);
  const [diaEdit, setDiaEdit] = useState("");
  const [versao, setVersao] = useState(0);
  const [equipe, setEquipe] = useState("todas");
  const [situacao, setSituacao] = useState<Filtro>("todas");
  const [soPendencias, setSoPendencias] = useState(false);
  const [salvandoCfg, setSalvandoCfg] = useState(false);

  useEffect(() => aoMudarDesenvolvimento(() => setVersao((v) => v + 1)), []);
  // abriu o painel = viu os lembretes de avaliação pendente
  const notificacoes = useNotificacoes();
  const euId = useSession()?.id;
  useEffect(() => {
    void lerAvisosDesenvolvimento(notificacoes, euId, (link) => link.startsWith("/admin/desenvolvimento"));
  }, [notificacoes, euId]);
  useEffect(() => {
    let vivo = true;
    Promise.all([planosApi.listarTodos(), passosApi.listar(), avaliacoesApi.listar(), configDevApi.ler()])
      .then(([pl, pa, av, c]) => {
        if (!vivo) return;
        setPlanos(pl);
        setPassos(pa);
        setAvaliacoes(av);
        setCfg(c);
        setDiaEdit(String(c.diaAvaliacao));
      })
      .catch((e) => notify.error("Não consegui carregar", e instanceof Error ? e.message : undefined));
    return () => {
      vivo = false;
    };
  }, [versao]);

  const hoje = chaveHoje();
  const devido = mesDevido(hoje, cfg.diaAvaliacao);
  const cobra = avaliacaoEmDia(devido, cfg);

  const linhas = useMemo(() => {
    return roster
      .filter((p) => p.papel !== "admin" && p.ativo !== false)
      .map((p) => {
        const plano = planos.find((x) => x.profileId === p.id);
        const meus = passos.filter((x) => x.profileId === p.id);
        const avs = avaliacoes.filter((x) => x.profileId === p.id);
        const ultima = ultimaAvaliacao(avs);
        const prog = progressoPassos(meus);
        const semObjetivo = !plano?.objetivo?.trim();
        const avaliacaoPendente = cobra && !avs.some((a) => a.mes === devido);
        const paraValidar = meus.filter((x) => x.status === "concluido").length;
        const atrasados = meus.filter((x) => passoAtrasado(x, hoje)).length;
        const pendencias = [
          semObjetivo && "Sem objetivo",
          avaliacaoPendente && `Avaliar ${mesCurto(devido)}`,
          paraValidar > 0 && `${paraValidar} passo${paraValidar > 1 ? "s" : ""} p/ validar`,
          atrasados > 0 && `${atrasados} atrasado${atrasados > 1 ? "s" : ""}`,
          ultima && !ultima.cienciaEm && "Sem ciência",
        ].filter(Boolean) as string[];
        return { p, plano, prog, ultima, pendencias, avaliacaoPendente, equipe: equipes.find((e) => e.id === p.equipeId) };
      })
      .sort((a, b) => b.pendencias.length - a.pendencias.length || a.p.nome.localeCompare(b.p.nome));
  }, [roster, planos, passos, avaliacoes, equipes, cobra, devido, hoje]);

  const filtradas = linhas.filter(
    (l) =>
      (equipe === "todas" || (equipe === "sem" ? !l.p.equipeId : l.p.equipeId === equipe)) &&
      (situacao === "todas" || (situacao === "sem" ? !l.ultima : l.ultima?.situacao === situacao)) &&
      (!soPendencias || l.pendencias.length > 0),
  );
  const pendentesAval = linhas.filter((l) => l.avaliacaoPendente);

  async function salvarDia() {
    const dia = Number(diaEdit);
    if (!(dia >= 1 && dia <= 28)) return notify.error("Escolha um dia de 1 a 28.");
    setSalvandoCfg(true);
    try {
      await configDevApi.salvar({ ...cfg, diaAvaliacao: dia });
      notify.success("Dia da avaliação salvo", `Todo dia ${dia}, depois do fechamento da produção.`);
    } catch (e) {
      notify.error("Não foi possível salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvandoCfg(false);
    }
  }

  return (
    <PremiumStage>
      <div className="mx-auto max-w-6xl space-y-5 pb-10">
        <header className="rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-brand)]/15 via-[var(--color-surface)] to-[var(--color-surface)] p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-brand)]/20 text-[var(--color-brand)]">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">Desenvolvimento da equipe</h1>
              <p className="text-sm text-[var(--color-text-dim)]">
                Objetivo, plano de passos e avaliação mensal de cada colaborador. Clique no nome para avaliar.
              </p>
            </div>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-[1fr_320px]">
          <section
            className={cn(
              "rounded-xl border p-4",
              pendentesAval.length ? "border-amber-400/60 bg-amber-400/10" : "border-[var(--color-border)] bg-[var(--color-surface)]",
            )}
          >
            <p className="flex items-center gap-2 text-sm font-bold">
              <CalendarClock className="h-4 w-4" />
              {cobra
                ? pendentesAval.length
                  ? `Avaliações pendentes de ${mesRotulo(devido)}: ${pendentesAval.length}`
                  : `Todas as avaliações de ${mesRotulo(devido)} foram feitas ✓`
                : `A rotina começa com a avaliação de ${mesRotulo(cfg.primeiroMes)}.`}
            </p>
            {pendentesAval.length > 0 && (
              <p className="mt-1 text-sm">
                {pendentesAval.map((l, i) => (
                  <span key={l.p.id}>
                    {i > 0 && ", "}
                    <Link href={`/perfil?de=${l.p.id}`} className="underline">
                      {l.p.nome}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">
              Próxima rodada: {proximaDataAvaliacao(hoje, cfg.diaAvaliacao).split("-").reverse().join("/")}. O sino lembra
              você todo dia até concluir.
            </p>
          </section>
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Settings2 className="h-4 w-4" /> Dia fixo da avaliação mensal
            </p>
            <div className="flex items-end gap-2">
              <div className="w-24">
                <Label htmlFor="cfg-dia">Dia do mês</Label>
                <Input id="cfg-dia" type="number" min={1} max={28} value={diaEdit} onChange={(e) => setDiaEdit(e.target.value)} />
              </div>
              <Button disabled={salvandoCfg} onClick={() => void salvarDia()}>
                Salvar
              </Button>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">Avalia o mês anterior, depois do fechamento da produção.</p>
          </section>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="f-eq">Equipe</Label>
            <select id="f-eq" value={equipe} onChange={(e) => setEquipe(e.target.value)} className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm">
              <option value="todas">Todas</option>
              {equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
              <option value="sem">Sem equipe</option>
            </select>
          </div>
          <div>
            <Label htmlFor="f-sit">Situação</Label>
            <select id="f-sit" value={situacao} onChange={(e) => setSituacao(e.target.value as Filtro)} className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm">
              <option value="todas">Todas</option>
              {(Object.keys(SITUACAO_INFO) as Situacao[]).map((k) => (
                <option key={k} value={k}>
                  {SITUACAO_INFO[k].emoji} {SITUACAO_INFO[k].rotulo}
                </option>
              ))}
              <option value="sem">Ainda sem avaliação</option>
            </select>
          </div>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={soPendencias} onChange={(e) => setSoPendencias(e.target.checked)} />
            Só com pendência
          </label>
          <span className="ml-auto text-sm text-[var(--color-text-dim)]">{filtradas.length} colaborador(es)</span>
        </div>

        {/* computador */}
        <div className="hidden overflow-x-auto rounded-xl border border-[var(--color-border)] lg:block">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">Colaborador</th>
                <th className="px-3 py-2">Objetivo</th>
                <th className="px-3 py-2">Plano</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Última avaliação</th>
                <th className="px-3 py-2">Pendências</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.p.id} className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                  <td className="px-3 py-2.5">
                    <Link href={`/perfil?de=${l.p.id}`} className="font-semibold hover:underline">
                      {l.p.nome}
                    </Link>
                    <p className="text-xs text-[var(--color-text-dim)]">
                      {degrauDe(l.p.papel)?.rotulo ?? PAPEL_INFO[l.p.papel]?.label} · {l.equipe?.nome ?? "Sem equipe"}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    {l.plano?.objetivo ? (
                      <span>
                        {l.plano.objetivo}
                        {l.plano.prazoMeses ? <span className="text-xs text-[var(--color-text-dim)]"> · {l.plano.prazoMeses} meses</span> : null}
                        {l.plano.criadoEm && (
                          <span className="block text-[11px] text-[var(--color-muted)]">desde {dataHoraBR(l.plano.criadoEm)}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-amber-300">⚠ não definido</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {l.prog.total ? (
                      <div className="w-28">
                        <p className="text-xs">
                          {l.prog.validados}/{l.prog.total} · {l.prog.pct}%
                        </p>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                          <div className="h-full bg-emerald-500" style={{ width: `${l.prog.pct}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--color-text-dim)]">sem passos</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {l.ultima ? `${SITUACAO_INFO[l.ultima.situacao].emoji} ${SITUACAO_INFO[l.ultima.situacao].rotulo}` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {l.ultima ? (
                      <>
                        {mesCurto(l.ultima.mes)} · nota {l.ultima.nota.toLocaleString("pt-BR")}
                        <p className={cn("text-xs", l.ultima.cienciaEm ? "text-emerald-400" : "text-amber-300")}>
                          {l.ultima.cienciaEm ? `✓ ciência em ${dataHoraBR(l.ultima.cienciaEm)}` : "⏳ sem ciência"}
                        </p>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {l.pendencias.length === 0 ? (
                        <span className="text-xs text-emerald-400">Em dia</span>
                      ) : (
                        l.pendencias.map((x) => (
                          <span key={x} className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                            {x}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="pr-3">
                    <Link href={`/perfil?de=${l.p.id}`} aria-label={`Abrir ${l.p.nome}`}>
                      <ChevronRight className="h-4 w-4 text-[var(--color-muted)]" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* celular */}
        <ul className="space-y-2 lg:hidden">
          {filtradas.map((l) => (
            <li key={l.p.id}>
              <Link href={`/perfil?de=${l.p.id}`} className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{l.p.nome}</span>
                  <span className="text-sm">{l.ultima ? SITUACAO_INFO[l.ultima.situacao].emoji : "—"}</span>
                </div>
                <p className="text-xs text-[var(--color-text-dim)]">
                  {degrauDe(l.p.papel)?.rotulo ?? PAPEL_INFO[l.p.papel]?.label} → {l.plano?.objetivo ?? "objetivo não definido"} ·
                  plano {l.prog.total ? `${l.prog.pct}%` : "sem passos"}
                  {l.ultima ? ` · ${mesCurto(l.ultima.mes)} nota ${l.ultima.nota.toLocaleString("pt-BR")}` : ""}
                </p>
                {l.pendencias.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {l.pendencias.map((x) => (
                      <span key={x} className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                        {x}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PremiumStage>
  );
}
