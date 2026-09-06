"use client";

/*
 * MEU PLANO DE EVOLUÇÃO — escrito pela própria pessoa.
 *
 * Não promove ninguém, não muda cargo, não muda permissão. É a intenção dela,
 * guardada, e um assunto pronto para a conversa com o administrador.
 *
 * Só o dono edita. O admin lê — e essa regra está na policy do banco, não
 * apenas neste componente: aqui o formulário some, lá a escrita é recusada.
 */

import { useEffect, useState } from "react";
import { Flag, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { METRICAS_PLANO, progressoPlano, type MetricaPlano } from "@/lib/evolucao";
import { planosApi, type PlanoEvolucao } from "@/lib/planos";
import { JORNADA } from "@/lib/jornada";
import type { IndicadoresBrutos } from "@/lib/performance";

export function PlanoEvolucaoCard({
  profileId,
  atual,
  podeEditar,
  nome,
}: {
  profileId: string;
  atual: IndicadoresBrutos | null;
  /** Só o dono edita. Para o admin isto vem `false`. */
  podeEditar: boolean;
  nome?: string;
}) {
  const [plano, setPlano] = useState<PlanoEvolucao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<PlanoEvolucao>({ profileId });

  useEffect(() => {
    let vivo = true;
    // O estado já nasce "carregando"; marcar de novo aqui seria um render a
    // mais por nada — e o React 19 recusa setState no corpo do efeito.
    planosApi
      .ler(profileId)
      .then((p) => {
        if (!vivo) return;
        setPlano(p);
        setForm(p ?? { profileId });
      })
      .catch(() => {
        /* sem plano não é erro: a maioria ainda não escreveu o dela */
      })
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [profileId]);

  async function salvar() {
    setSalvando(true);
    try {
      await planosApi.salvar({ ...form, profileId });
      setPlano({ ...form, profileId });
      setEditando(false);
      notify.success("Plano salvo");
    } catch (e) {
      notify.error("Não consegui salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  const prog = atual ? progressoPlano(atual, form.metrica ?? plano?.metrica, plano?.alvo) : null;

  if (carregando) {
    return (
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-xs text-[var(--color-text-dim)]">Carregando…</p>
      </section>
    );
  }

  /* ------------------------------- edição -------------------------------- */
  if (editando) {
    return (
      <section className="rounded-xl border border-[var(--color-brand)]/40 bg-[var(--color-surface)] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
          <Flag className="h-3.5 w-3.5" /> Meu plano de evolução
        </h3>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Meu próximo objetivo</Label>
              <select
                value={form.objetivo ?? ""}
                onChange={(e) => setForm({ ...form, objetivo: e.target.value })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                <option value="">— escolher —</option>
                {JORNADA.map((d) => (
                  <option key={d.papel} value={d.rotulo}>
                    {d.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Quero chegar lá em</Label>
              <select
                value={form.prazoMeses ?? ""}
                onChange={(e) =>
                  setForm({ ...form, prazoMeses: e.target.value ? Number(e.target.value) : undefined })
                }
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                <option value="">— sem prazo —</option>
                {[3, 6, 9, 12, 18, 24].map((m) => (
                  <option key={m} value={m}>
                    {m} meses
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Minha meta (o que dá para medir)</Label>
              <select
                value={form.metrica ?? ""}
                onChange={(e) =>
                  setForm({ ...form, metrica: (e.target.value || undefined) as MetricaPlano | undefined })
                }
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                <option value="">— só descrever com palavras —</option>
                {METRICAS_PLANO.map((m) => (
                  <option key={m.chave} value={m.chave}>
                    {m.rotulo} no mês
                  </option>
                ))}
              </select>
            </div>
            {form.metrica && (
              <div>
                <Label>Quantos por mês</Label>
                <Input
                  inputMode="numeric"
                  value={form.alvo != null ? String(form.alvo) : ""}
                  onChange={(e) =>
                    setForm({ ...form, alvo: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : undefined })
                  }
                  placeholder="10"
                />
              </div>
            )}
          </div>

          <div>
            <Label>Minha meta, em palavras</Label>
            <Input
              value={form.metaTexto ?? ""}
              onChange={(e) => setForm({ ...form, metaTexto: e.target.value })}
              placeholder="Aumentar minha conversão"
            />
          </div>
          <div>
            <Label>Meu foco</Label>
            <Input
              value={form.foco ?? ""}
              onChange={(e) => setForm({ ...form, foco: e.target.value })}
              placeholder="Melhorar acompanhamento e fechamento"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => { setEditando(false); setForm(plano ?? { profileId }); }}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              Salvar plano
            </Button>
          </div>
        </div>
      </section>
    );
  }

  /* ------------------------------- leitura ------------------------------- */
  const vazio = !plano?.objetivo && !plano?.metaTexto && !plano?.foco && !plano?.metrica;

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
          <Flag className="h-3.5 w-3.5" /> {podeEditar ? "Meu plano de evolução" : "Plano definido pelo colaborador"}
        </h3>
        {podeEditar && (
          <button
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand)] hover:underline"
          >
            <Pencil className="h-3 w-3" /> {vazio ? "Definir" : "Editar"}
          </button>
        )}
      </div>

      {vazio ? (
        <p className="text-sm text-[var(--color-text-dim)]">
          {podeEditar
            ? "Você ainda não definiu para onde quer ir. Escrever isso ajuda a transformar vontade em plano — e vira assunto na sua próxima conversa com a administração."
            : `${nome ?? "O colaborador"} ainda não definiu um plano.`}
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          {plano?.objetivo && (
            <p>
              <span className="text-[var(--color-muted)]">Objetivo: </span>
              <span className="font-semibold text-[var(--color-text)]">{plano.objetivo}</span>
              {plano.prazoMeses ? (
                <span className="text-[var(--color-text-dim)]"> · em {plano.prazoMeses} meses</span>
              ) : null}
            </p>
          )}
          {plano?.metaTexto && (
            <p>
              <span className="text-[var(--color-muted)]">Meta: </span>
              <span className="text-[var(--color-text)]">{plano.metaTexto}</span>
            </p>
          )}
          {plano?.foco && (
            <p>
              <span className="text-[var(--color-muted)]">Foco: </span>
              <span className="text-[var(--color-text)]">{plano.foco}</span>
            </p>
          )}

          {/* Progresso SÓ quando a meta é mensurável. Meta em palavras não
              vira percentual — seria precisão inventada. */}
          {prog && (
            <div className="pt-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-[var(--color-muted)]">Como está o caminho</span>
                <span className="font-bold tabular-nums text-[var(--color-text)]">
                  {prog.realizado} de {prog.alvo} · {prog.pct.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-700"
                  style={{ width: `${prog.pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                Contagem do ciclo atual, medida no funil.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
