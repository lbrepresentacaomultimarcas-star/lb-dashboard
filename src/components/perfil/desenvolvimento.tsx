"use client";

/*
 * PLANO DE DESENVOLVIMENTO no Meu Perfil.
 *
 *  - AvisoObjetivo: "Defina seu objetivo" fixo enquanto não houver objetivo;
 *  - PlanoPassosCard: passos combinados na reunião (admin cadastra e valida
 *    com nota; o colaborador marca "concluí" e comenta);
 *  - AvaliacaoEmpresaCard: "Como a empresa te enxerga", mês a mês, com
 *    reconhecimento obrigatório e "Li e estou ciente";
 *  - IndicadoresMesCard: o funil do próprio CRM, como apoio à avaliação.
 *
 * Os botões só aparecem para quem pode; a regra de verdade está no banco.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  ListChecks,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { planosApi } from "@/lib/planos";
import { passosApi, avaliacoesApi, aoMudarDesenvolvimento } from "@/lib/desenvolvimento-api";
import {
  SITUACAO_INFO,
  STATUS_PASSO_INFO,
  chaveHoje,
  dataHoraBR,
  mediaNotas,
  mesCurto,
  mesParaAvaliar,
  mesRotulo,
  passoAtrasado,
  progressoPassos,
  somarMeses,
  taxasConversao,
  ultimaAvaliacao,
  validarAvaliacao,
  validarPasso,
  variacao,
  type AvaliacaoMensal,
  type PassoPlano,
  type Situacao,
} from "@/lib/desenvolvimento";
import { proximoDegrau } from "@/lib/jornada";
import { useSession, useVendas } from "@/lib/store";
import { useCicloProducao } from "@/lib/use-ciclo";
import { cicloDeData } from "@/lib/ciclo";
import { calcularDesafio } from "@/lib/desafio";
import { useDesafiosVisiveis } from "@/components/desafio/desafio-ui";
import type { IndicadoresBrutos } from "@/lib/performance";
import type { Papel } from "@/lib/types";
import { cn } from "@/lib/utils";

const CARD = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4";
const TITULO = "flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand)]";
const AREA =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dataBR = dataHoraBR;
const prazoBR = (d?: string) => (d ? d.split("-").reverse().join("/") : "");

/** Passos e avaliações de uma pessoa, recarregados quando algo muda. */
export function useDesenvolvimento(profileId: string | undefined) {
  const [passos, setPassos] = useState<PassoPlano[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoMensal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  useEffect(() => aoMudarDesenvolvimento(() => setVersao((v) => v + 1)), []);
  useEffect(() => {
    if (!profileId) return;
    let vivo = true;
    Promise.all([passosApi.listar(profileId), avaliacoesApi.listar(profileId)])
      .then(([p, a]) => {
        if (!vivo) return;
        setPassos(p);
        setAvaliacoes(a);
      })
      .catch(() => {
        /* antes da migração as tabelas não existem: o bloco fica vazio */
      })
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [profileId, versao]);
  return { passos, avaliacoes, carregando };
}

// ============================================================ objetivo

export function AvisoObjetivo({ profileId, souEu, nome }: { profileId: string; souEu: boolean; nome: string }) {
  const [temObjetivo, setTemObjetivo] = useState<boolean | null>(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const f = () => setVersao((v) => v + 1);
    window.addEventListener("lb:plano-salvo", f);
    return () => window.removeEventListener("lb:plano-salvo", f);
  }, []);
  useEffect(() => {
    let vivo = true;
    planosApi
      .ler(profileId)
      .then((p) => vivo && setTemObjetivo(Boolean(p?.objetivo?.trim())))
      .catch(() => vivo && setTemObjetivo(true));
    return () => {
      vivo = false;
    };
  }, [profileId, versao]);
  if (temObjetivo !== false) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border-2 border-amber-400/70 bg-amber-400/10 px-4 py-3">
      <Target className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-amber-200">{souEu ? "Defina seu objetivo" : `${nome.split(" ")[0]} ainda não definiu o objetivo`}</p>
        <p className="text-sm text-amber-100/80">
          {souEu
            ? "Escreva o cargo que quer alcançar, o prazo, a meta e o foco de melhoria. A administração é avisada e monta com você o plano de passos."
            : "Pendência do colaborador: o objetivo é obrigatório para montar o plano de passos."}
        </p>
      </div>
      {souEu && (
        <a href="#meu-plano" className="shrink-0 self-center rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-bold text-black">
          Definir agora
        </a>
      )}
    </div>
  );
}

// ============================================================ passos

type RascunhoPasso = { id?: string; titulo: string; descricao: string; prazo: string; criterio: string };

export function PlanoPassosCard({
  profileId,
  papel,
  souEu,
  admin,
  nome,
  passos,
}: {
  profileId: string;
  papel?: Papel;
  souEu: boolean;
  admin: boolean;
  nome: string;
  passos: PassoPlano[];
}) {
  const hoje = chaveHoje();
  const prox = proximoDegrau(papel);
  const prog = progressoPassos(passos);
  const media = mediaNotas(passos);
  const [editando, setEditando] = useState<RascunhoPasso | null>(null);
  const [concluindo, setConcluindo] = useState<PassoPlano | null>(null);
  const [validando, setValidando] = useState<PassoPlano | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function rodar(fn: () => Promise<void>, ok: string) {
    setOcupado(true);
    try {
      await fn();
      notify.success(ok);
      return true;
    } catch (e) {
      notify.error("Não foi possível salvar", e instanceof Error ? e.message : undefined);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className={CARD}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className={TITULO}>
          <ListChecks className="h-3.5 w-3.5" /> Plano de passos{prox ? ` até ${prox.rotulo}` : ""}
        </h3>
        {admin && (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => setEditando({ titulo: "", descricao: "", prazo: "", criterio: "" })}
          >
            <Plus className="h-4 w-4" /> Novo passo
          </Button>
        )}
      </div>

      {passos.length > 0 && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-[var(--color-text-dim)]">Progresso real</span>
            <span className="font-bold">
              {prog.validados} de {prog.total} passos validados · {prog.pct}%
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${prog.pct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
            {media !== null ? `Nota média dos passos validados: ${media.toLocaleString("pt-BR")}. ` : ""}
            Só conta passo validado pela administração. A mudança de cargo continua sendo decisão da administração.
          </p>
        </div>
      )}

      {passos.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)]">
          {admin
            ? `Depois da reunião com ${nome.split(" ")[0]}, cadastre aqui o passo a passo combinado.`
            : "Os passos são combinados na reunião com a administração e aparecem aqui."}
        </p>
      ) : (
        <ol className="space-y-2">
          {passos.map((p, i) => {
            const info = STATUS_PASSO_INFO[p.status];
            const atrasado = passoAtrasado(p, hoje);
            return (
              <li key={p.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-brand)]/20 text-xs font-bold text-[var(--color-brand)]">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.titulo}</p>
                    {p.descricao && <p className="text-sm text-[var(--color-text-dim)]">{p.descricao}</p>}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-dim)]">
                      {p.prazo && (
                        <span className={atrasado ? "font-bold text-red-400" : ""}>
                          Prazo: {prazoBR(p.prazo)}
                          {atrasado ? " (atrasado)" : ""}
                        </span>
                      )}
                      {p.criterio && <span>Concluído quando: {p.criterio}</span>}
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{ background: `${info.cor}22`, color: info.cor, border: `1px solid ${info.cor}66` }}
                  >
                    {info.rotulo}
                    {p.status === "aprovado" && typeof p.nota === "number" ? ` · nota ${p.nota.toLocaleString("pt-BR")}` : ""}
                  </span>
                </div>
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-muted)]">
                  {p.criadoEm && <span>📌 Cadastrado em {dataHoraBR(p.criadoEm)}</span>}
                  {p.concluidoEm && <span>☑️ Concluído em {dataHoraBR(p.concluidoEm)}</span>}
                  {p.validadoEm && (p.status === "aprovado" || p.status === "ajustar") && (
                    <span>
                      {p.status === "aprovado" ? "✅ Validado" : "🔁 Ajuste pedido"} em {dataHoraBR(p.validadoEm)}
                    </span>
                  )}
                </p>
                {(p.comentario || p.feedback) && (
                  <div className="mt-2 space-y-1 border-t border-[var(--color-border)] pt-2 text-sm">
                    {p.comentario && (
                      <p>
                        <span className="text-[var(--color-text-dim)]">Colaborador: </span>“{p.comentario}”
                      </p>
                    )}
                    {p.feedback && (
                      <p>
                        <span className="text-[var(--color-text-dim)]">Administração: </span>“{p.feedback}”
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {souEu && (p.status === "pendente" || p.status === "ajustar") && (
                    <Button size="sm" onClick={() => setConcluindo(p)}>
                      <CheckCircle2 className="h-4 w-4" /> Concluí
                    </Button>
                  )}
                  {souEu && p.status === "concluido" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={ocupado}
                      onClick={() => void rodar(() => passosApi.atualizar(p.id, { status: "pendente" }), "Conclusão desfeita")}
                    >
                      Desfazer “concluí”
                    </Button>
                  )}
                  {admin && (
                    <>
                      <Button size="sm" variant={p.status === "concluido" ? "primary" : "secondary"} onClick={() => setValidando(p)}>
                        <ClipboardCheck className="h-4 w-4" /> Validar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEditando({
                            id: p.id,
                            titulo: p.titulo,
                            descricao: p.descricao ?? "",
                            prazo: p.prazo ?? "",
                            criterio: p.criterio ?? "",
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400"
                        disabled={ocupado}
                        onClick={() => {
                          if (window.confirm(`Excluir o passo "${p.titulo}"?`))
                            void rodar(() => passosApi.excluir(p.id), "Passo excluído");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {editando && (
        <Modal open onClose={() => setEditando(null)} title={editando.id ? "Editar passo" : "Novo passo"} icon={<ListChecks className="h-5 w-5" />}>
          <div className="space-y-3">
            <div>
              <Label htmlFor="p-titulo">Título do passo</Label>
              <Input id="p-titulo" value={editando.titulo} placeholder="Ex.: Conduzir a reunião semanal do time" onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="p-desc">O que precisa ser feito</Label>
              <textarea id="p-desc" rows={3} className={AREA} value={editando.descricao} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="p-prazo">Prazo</Label>
                <Input id="p-prazo" type="date" value={editando.prazo} onChange={(e) => setEditando({ ...editando, prazo: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="p-crit">Critério de conclusão</Label>
                <Input id="p-crit" value={editando.criterio} placeholder="Ex.: 4 reuniões registradas" onChange={(e) => setEditando({ ...editando, criterio: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={ocupado}
                onClick={async () => {
                  const erros = validarPasso(editando);
                  if (erros.length) return notify.error(erros[0]);
                  const dados = { titulo: editando.titulo, descricao: editando.descricao, prazo: editando.prazo, criterio: editando.criterio };
                  const ok = await rodar(
                    () =>
                      editando.id
                        ? passosApi.atualizar(editando.id, dados)
                        : passosApi.criar({ ...dados, profileId, ordem: passos.length + 1 }),
                    editando.id ? "Passo atualizado" : "Passo cadastrado — o colaborador foi avisado",
                  );
                  if (ok) setEditando(null);
                }}
              >
                Salvar passo
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {concluindo && (
        <ConcluirPassoModal
          passo={concluindo}
          ocupado={ocupado}
          onFechar={() => setConcluindo(null)}
          onConfirmar={async (comentario) => {
            const ok = await rodar(
              () => passosApi.atualizar(concluindo.id, { status: "concluido", comentario }),
              "Passo marcado como concluído — a administração vai validar",
            );
            if (ok) setConcluindo(null);
          }}
        />
      )}

      {validando && (
        <ValidarPassoModal
          passo={validando}
          ocupado={ocupado}
          onFechar={() => setValidando(null)}
          onConfirmar={async (status, nota, feedback) => {
            const ok = await rodar(
              () => passosApi.atualizar(validando.id, { status, nota, feedback }),
              status === "aprovado" ? "Passo validado — o colaborador foi avisado" : "Ajuste pedido — o colaborador foi avisado",
            );
            if (ok) setValidando(null);
          }}
        />
      )}
    </section>
  );
}

function ConcluirPassoModal({
  passo,
  ocupado,
  onFechar,
  onConfirmar,
}: {
  passo: PassoPlano;
  ocupado: boolean;
  onFechar: () => void;
  onConfirmar: (comentario: string) => void;
}) {
  const [comentario, setComentario] = useState(passo.comentario ?? "");
  return (
    <Modal open onClose={onFechar} title="Concluí este passo" subtitle={passo.titulo} icon={<CheckCircle2 className="h-5 w-5" />}>
      <div className="space-y-3">
        {passo.criterio && (
          <p className="rounded-lg bg-[var(--color-surface-2)] p-3 text-sm">
            <span className="text-[var(--color-text-dim)]">Critério combinado: </span>
            {passo.criterio}
          </p>
        )}
        <div>
          <Label htmlFor="c-com">Comentário / evidência (opcional)</Label>
          <textarea
            id="c-com"
            rows={3}
            className={AREA}
            placeholder="Ex.: fiz as 4 reuniões; as atas estão na pasta do time."
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={ocupado} onClick={() => onConfirmar(comentario)}>
            Enviar para validação
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ValidarPassoModal({
  passo,
  ocupado,
  onFechar,
  onConfirmar,
}: {
  passo: PassoPlano;
  ocupado: boolean;
  onFechar: () => void;
  onConfirmar: (status: "aprovado" | "ajustar", nota: number | undefined, feedback: string) => void;
}) {
  const [nota, setNota] = useState<string>(passo.nota !== undefined ? String(passo.nota) : "");
  const [feedback, setFeedback] = useState(passo.feedback ?? "");
  const notaNum = nota === "" ? undefined : Number(nota.replace(",", "."));
  const notaOk = notaNum === undefined || (notaNum >= 0 && notaNum <= 10);
  return (
    <Modal open onClose={onFechar} title="Validar passo" subtitle={passo.titulo} icon={<ClipboardCheck className="h-5 w-5" />}>
      <div className="space-y-3">
        {passo.comentario && (
          <p className="rounded-lg bg-[var(--color-surface-2)] p-3 text-sm">
            <span className="text-[var(--color-text-dim)]">Comentário do colaborador: </span>“{passo.comentario}”
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <div>
            <Label htmlFor="v-nota">Nota (0 a 10)</Label>
            <Input id="v-nota" inputMode="decimal" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="v-fb">Retorno para o colaborador</Label>
            <Input id="v-fb" value={feedback} placeholder="Ex.: Ótima condução! Próxima vez, registre as atas." onChange={(e) => setFeedback(e.target.value)} />
          </div>
        </div>
        {!notaOk && <p className="text-sm text-red-400">A nota vai de 0 a 10.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={ocupado || !notaOk} onClick={() => onConfirmar("ajustar", notaNum, feedback)}>
            Precisa ajustar
          </Button>
          <Button disabled={ocupado || !notaOk || notaNum === undefined} onClick={() => onConfirmar("aprovado", notaNum, feedback)}>
            Aprovar com nota
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================ avaliação

type RascunhoAval = Omit<AvaliacaoMensal, "id" | "profileId"> & { id?: string };

export function AvaliacaoEmpresaCard({
  profileId,
  souEu,
  admin,
  nome,
  avaliacoes,
}: {
  profileId: string;
  souEu: boolean;
  admin: boolean;
  nome: string;
  avaliacoes: AvaliacaoMensal[];
}) {
  const session = useSession();
  const ordenadas = useMemo(() => [...avaliacoes].sort((a, b) => b.mes.localeCompare(a.mes)), [avaliacoes]);
  const [mesVisto, setMesVisto] = useState<string | null>(null);
  const atual = ordenadas.find((a) => a.mes === mesVisto) ?? ultimaAvaliacao(ordenadas);
  const [form, setForm] = useState<RascunhoAval | null>(null);
  const [resposta, setResposta] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function novaAvaliacao() {
    const mes = mesParaAvaliar(chaveHoje());
    const ja = ordenadas.find((a) => a.mes === mes);
    setForm(
      ja
        ? { ...ja }
        : {
            mes,
            situacao: "verde",
            proximidade: ordenadas[0]?.proximidade ?? 0,
            reconhecimento: "",
            pontosFortes: "",
            melhorar: "",
            proximosPassos: "",
            nota: 7,
          },
    );
  }

  async function salvar() {
    if (!form) return;
    const erros = validarAvaliacao(form);
    if (erros.length) return notify.error(erros[0]);
    setOcupado(true);
    try {
      await avaliacoesApi.salvar({ ...form, profileId }, session?.nome);
      notify.success("Avaliação publicada", `${nome.split(" ")[0]} foi avisado(a) no sino.`);
      setMesVisto(form.mes);
      setForm(null);
    } catch (e) {
      notify.error("Não foi possível publicar", e instanceof Error ? e.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  async function ciente() {
    if (!atual) return;
    setOcupado(true);
    try {
      await avaliacoesApi.darCiencia(atual.id, resposta);
      notify.success("Leitura confirmada", "A administração foi avisada.");
      setResposta("");
    } catch (e) {
      notify.error("Não foi possível confirmar", e instanceof Error ? e.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  const sit = atual ? SITUACAO_INFO[atual.situacao] : null;

  return (
    <section className="rounded-xl border border-[var(--color-brand)]/40 bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className={TITULO}>
          <Eye className="h-3.5 w-3.5" /> Como a empresa te enxerga
        </h3>
        {ordenadas.length > 1 && (
          <select
            aria-label="Mês da avaliação"
            value={atual?.mes ?? ""}
            onChange={(e) => setMesVisto(e.target.value)}
            className="ml-auto h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-xs"
          >
            {ordenadas.map((a) => (
              <option key={a.mes} value={a.mes}>
                {mesRotulo(a.mes)}
              </option>
            ))}
          </select>
        )}
        {admin && (
          <Button size="sm" className={ordenadas.length > 1 ? "" : "ml-auto"} onClick={novaAvaliacao}>
            <Plus className="h-4 w-4" /> Avaliar o mês
          </Button>
        )}
      </div>

      {!atual || !sit ? (
        <p className="text-sm text-[var(--color-text-dim)]">
          {admin
            ? `${nome.split(" ")[0]} ainda não tem avaliação. A avaliação é mensal, depois do fechamento da produção.`
            : "A sua primeira avaliação mensal aparece aqui, depois do fechamento da produção."}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="rounded-full px-3 py-1 text-sm font-bold"
              style={{ background: `${sit.cor}22`, color: sit.cor, border: `1px solid ${sit.cor}88` }}
            >
              {sit.emoji} {sit.rotulo}
            </span>
            <span className="text-sm text-[var(--color-text-dim)]">{mesRotulo(atual.mes)}</span>
            <span className="ml-auto text-right">
              <span className="block text-[10px] uppercase tracking-wider text-[var(--color-muted)]">Nota do mês</span>
              <span className="text-2xl font-black">{atual.nota.toLocaleString("pt-BR")}</span>
              <span className="text-sm text-[var(--color-text-dim)]">/10</span>
            </span>
          </div>

          <div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-dim)]">Quão perto do próximo cargo</span>
              <span className="font-bold">{atual.proximidade}%</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div className="h-full rounded-full bg-[var(--color-brand)]" style={{ width: `${atual.proximidade}%` }} />
            </div>
          </div>

          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" /> Parabéns / reconhecimento
            </p>
            <p className="mt-1 whitespace-pre-line text-sm">{atual.reconhecimento}</p>
          </div>
          {atual.pontosFortes && <Bloco titulo="Pontos fortes" texto={atual.pontosFortes} />}
          {atual.melhorar && <Bloco titulo="O que precisa melhorar" texto={atual.melhorar} />}
          {atual.proximosPassos && <Bloco titulo="Próximos passos combinados" texto={atual.proximosPassos} />}

          <p className="text-[11px] text-[var(--color-text-dim)]">
            Avaliado por {atual.avaliadorNome ?? "administração"}
            {atual.criadoEm ? ` · publicada em ${dataHoraBR(atual.criadoEm)}` : ""}
            {atual.atualizadoEm && dataHoraBR(atual.atualizadoEm) !== dataHoraBR(atual.criadoEm)
              ? ` · atualizada em ${dataHoraBR(atual.atualizadoEm)}`
              : ""}
            .
          </p>

          {/* ciência */}
          {atual.cienciaEm ? (
            <div className="rounded-lg bg-[var(--color-surface-2)] p-3 text-sm">
              <p className="font-semibold text-emerald-400">
                ✓ {souEu ? "Você" : nome.split(" ")[0]} leu e deu ciência em {dataBR(atual.cienciaEm)}
              </p>
              {atual.resposta && (
                <p className="mt-1">
                  “{atual.resposta}”
                  {atual.respostaEm && (
                    <span className="ml-1 text-[11px] text-[var(--color-muted)]">— respondido em {dataHoraBR(atual.respostaEm)}</span>
                  )}
                </p>
              )}
            </div>
          ) : souEu ? (
            <div className="space-y-2 rounded-lg border border-[var(--color-brand)]/40 p-3">
              <Label htmlFor="a-resp">Quer responder? (opcional)</Label>
              <textarea id="a-resp" rows={2} className={AREA} value={resposta} onChange={(e) => setResposta(e.target.value)} placeholder="Ex.: Obrigado! Vou focar nas propostas este mês." />
              <Button disabled={ocupado} onClick={() => void ciente()}>
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Li e estou ciente
              </Button>
            </div>
          ) : (
            <p className="rounded-lg bg-amber-400/10 p-3 text-sm font-semibold text-amber-300">⏳ Ainda não deu ciência desta avaliação.</p>
          )}
        </div>
      )}

      {form && (
        <Modal open onClose={() => setForm(null)} title={form.id ? "Editar avaliação" : "Avaliar o mês"} subtitle={nome} size="lg" icon={<Eye className="h-5 w-5" />}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="f-mes">Mês avaliado</Label>
                <select
                  id="f-mes"
                  value={form.mes}
                  disabled={Boolean(form.id)}
                  onChange={(e) => {
                    const ja = ordenadas.find((a) => a.mes === e.target.value);
                    setForm(ja ? { ...ja } : { ...form, id: undefined, mes: e.target.value });
                  }}
                  className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
                >
                  {Array.from({ length: 6 }, (_, i) => somarMeses(mesParaAvaliar(chaveHoje()), 1 - i)).map((m) => (
                    <option key={m} value={m}>
                      {mesRotulo(m)}
                      {ordenadas.some((a) => a.mes === m) ? " (já avaliado)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="f-nota">Nota geral do mês (0–10)</Label>
                <Input id="f-nota" type="number" min={0} max={10} step={0.5} value={form.nota} onChange={(e) => setForm({ ...form, nota: Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="f-prox">Perto do próximo cargo: {form.proximidade}%</Label>
                <input id="f-prox" type="range" min={0} max={100} step={5} value={form.proximidade} onChange={(e) => setForm({ ...form, proximidade: Number(e.target.value) })} className="mt-2 w-full accent-[var(--color-brand)]" />
              </div>
            </div>
            <div>
              <Label>Situação geral</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(SITUACAO_INFO) as Situacao[]).map((k) => {
                  const i = SITUACAO_INFO[k];
                  const ativo = form.situacao === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setForm({ ...form, situacao: k })}
                      className={cn("rounded-lg border px-3 py-2 text-sm font-bold", ativo ? "" : "border-[var(--color-border)] opacity-70")}
                      style={ativo ? { borderColor: i.cor, background: `${i.cor}22`, color: i.cor } : undefined}
                    >
                      {i.emoji} {i.rotulo}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label htmlFor="f-rec">Parabéns / reconhecimento (obrigatório)</Label>
              <textarea id="f-rec" rows={2} className={AREA} value={form.reconhecimento} placeholder="Toda avaliação tem pelo menos um elogio. Ex.: Parabéns pela constância nos retornos!" onChange={(e) => setForm({ ...form, reconhecimento: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="f-fortes">Pontos fortes</Label>
                <textarea id="f-fortes" rows={3} className={AREA} value={form.pontosFortes ?? ""} onChange={(e) => setForm({ ...form, pontosFortes: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="f-mel">O que precisa melhorar</Label>
                <textarea id="f-mel" rows={3} className={AREA} value={form.melhorar ?? ""} onChange={(e) => setForm({ ...form, melhorar: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="f-prox-passos">Próximos passos combinados</Label>
              <textarea id="f-prox-passos" rows={2} className={AREA} value={form.proximosPassos ?? ""} onChange={(e) => setForm({ ...form, proximosPassos: e.target.value })} />
            </div>
            {form.id && (
              <p className="text-xs text-amber-300">Ao salvar a edição, {nome.split(" ")[0]} é avisado(a) e precisa confirmar a leitura de novo.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button disabled={ocupado} onClick={() => void salvar()}>
                Publicar avaliação
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">{titulo}</p>
      <p className="mt-0.5 whitespace-pre-line text-sm">{texto}</p>
    </div>
  );
}

// ============================================================ indicadores

function Seta({ atual, anterior }: { atual: number; anterior: number }) {
  const v = variacao(atual, anterior);
  if (!v) return <span className="text-[11px] text-[var(--color-muted)]">novo</span>;
  if (v.sentido === "igual") return <Minus className="inline h-3.5 w-3.5 text-[var(--color-muted)]" aria-label="igual" />;
  const subiu = v.sentido === "subiu";
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center text-[11px] font-bold", subiu ? "text-emerald-400" : "text-red-400")}>
      <Icone className="h-3.5 w-3.5" />
      {Math.abs(v.pct).toLocaleString("pt-BR")}%
    </span>
  );
}

const pctTxt = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR")}%`);

export function IndicadoresMesCard({
  historico,
  vendedorRef,
}: {
  historico: { chave: string; ind: IndicadoresBrutos }[];
  vendedorRef?: string;
}) {
  const vendas = useVendas();
  const { config, feriados } = useCicloProducao();
  const desafios = useDesafiosVisiveis();
  const hoje = chaveHoje();

  const linhas = useMemo(() => {
    const vendidoPor = new Map<string, number>();
    if (vendedorRef) {
      for (const v of vendas) {
        if (v.vendedorId !== vendedorRef) continue;
        const k = cicloDeData(v.data, config, feriados);
        vendidoPor.set(k, (vendidoPor.get(k) ?? 0) + (Number(v.valor) || 0));
      }
    }
    return historico.slice(-4).map((h) => ({ ...h, vendido: vendidoPor.get(h.chave) ?? 0 }));
  }, [historico, vendas, vendedorRef, config, feriados]);

  // produção no desafio em andamento (se o colaborador participa)
  let desafio: { titulo: string; ficha: ReturnType<typeof calcularDesafio>[number] } | null = null;
  for (const d of vendedorRef ? desafios : []) {
    if (!d.participantes.some((p) => p.vendedorId === vendedorRef)) continue;
    const f = calcularDesafio(d, vendas, hoje).find((x) => x.vendedorId === vendedorRef);
    if (f) {
      desafio = { titulo: d.titulo, ficha: f };
      break;
    }
  }

  if (!vendedorRef || linhas.length === 0) return null;
  const atual = linhas[linhas.length - 1];
  const anterior = linhas[linhas.length - 2];
  const t = taxasConversao(atual.ind);
  const tAnt = anterior ? taxasConversao(anterior.ind) : null;

  return (
    <section className={CARD}>
      <h3 className={cn(TITULO, "mb-3")}>
        <BarChart3 className="h-3.5 w-3.5" /> Indicadores do CRM (apoio à avaliação)
      </h3>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { r: "Oport. → Agend.", v: t.opAg, a: tAnt?.opAg },
          { r: "Agend. → Proposta", v: t.agProp, a: tAnt?.agProp },
          { r: "Proposta → Fechado", v: t.propFech, a: tAnt?.propFech },
          { r: "Oport. → Fechado", v: t.opFech, a: tAnt?.opFech },
        ].map((x) => (
          <div key={x.r} className="rounded-lg bg-[var(--color-surface-2)] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{x.r}</p>
            <p className="text-lg font-bold">{pctTxt(x.v)}</p>
            {x.v !== null && x.a !== null && x.a !== undefined && <Seta atual={x.v} anterior={x.a} />}
          </div>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
              <th className="py-1.5 pr-2">Mês</th>
              <th className="py-1.5 pr-2 text-right">Oport.</th>
              <th className="py-1.5 pr-2 text-right">Agend.</th>
              <th className="py-1.5 pr-2 text-right">Propostas</th>
              <th className="py-1.5 pr-2 text-right">Fechados</th>
              <th className="py-1.5 text-right">Vendido</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const prev = linhas[i - 1];
              const ultimo = i === linhas.length - 1;
              return (
                <tr key={l.chave} className={cn("border-t border-[var(--color-border)]", ultimo && "font-bold")}>
                  <td className="py-1.5 pr-2">
                    {mesCurto(l.chave)}
                    {ultimo && <span className="ml-1 text-[10px] font-normal text-[var(--color-brand)]">agora</span>}
                  </td>
                  {(["oportunidades", "agendamentos", "propostas", "fechados"] as const).map((k) => (
                    <td key={k} className="py-1.5 pr-2 text-right tabular-nums">
                      {l.ind[k]} {prev && <Seta atual={l.ind[k]} anterior={prev.ind[k]} />}
                    </td>
                  ))}
                  <td className="py-1.5 text-right tabular-nums">
                    {brl(l.vendido)} {prev && <Seta atual={l.vendido} anterior={prev.vendido} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {desafio && (
        <div className="mt-3 rounded-lg border border-[var(--color-brand)]/40 p-3 text-sm">
          <p className="font-bold">{desafio.titulo}</p>
          <p className="text-[var(--color-text-dim)]">
            Produção {brl(desafio.ficha.total)} de {brl(desafio.ficha.meta)} ·{" "}
            <b className="text-[var(--color-text)]">{desafio.ficha.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta</b> ·{" "}
            {desafio.ficha.posicao}º lugar
          </p>
        </div>
      )}
      <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
        Calculado do funil e das vendas do CRM, por ciclo de produção. As setas comparam com o mês anterior.
      </p>
    </section>
  );
}
