"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarPlus, Copy, Eye, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { desafiosApi, useDesafios, useReady, useVendedores } from "@/lib/store";
import {
  ESTADO_INFO,
  FRASE_PADRAO,
  diasDoDesafio,
  estadoDoDesafio,
  metaColetivaDe,
  periodoBR,
  proximaRodada,
  somarDias,
  validarDesafio,
  type Desafio,
  type ParticipanteDesafio,
} from "@/lib/desafio";
import { GOLD, NAVY, brl, useHoje, usePermissoesDesafio } from "@/components/desafio/desafio-ui";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { formatNumBR, parseNumBR } from "@/lib/utils";

type Rascunho = Omit<Desafio, "id" | "criadoEm">;

function nomeBonito(nome: string): string {
  return nome
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => (["da", "de", "do", "das", "dos", "e"].includes(p) ? p : p[0].toUpperCase() + p.slice(1)))
    .join(" ");
}

export default function GerenciarDesafiosPage() {
  const ready = useReady();
  const hoje = useHoje();
  const desafios = useDesafios();
  const { admin } = usePermissoesDesafio();
  const [editando, setEditando] = useState<{ id?: string; dados: Rascunho } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (!ready || !hoje) return null;
  if (!admin) {
    return <p className="py-10 text-center text-lg font-bold">Somente o administrador pode gerenciar os desafios.</p>;
  }

  const novo = (): Rascunho => {
    const inicio = hoje;
    return {
      titulo: "",
      frase: FRASE_PADRAO,
      inicio,
      fim: somarDias(inicio, 14),
      metaColetiva: undefined,
      participantes: [],
      ativo: true,
    };
  };

  async function alternarAtivo(d: Desafio) {
    setOcupado(d.id);
    try {
      await desafiosApi.atualizar(d.id, { ativo: !d.ativo });
      notify.success(d.ativo ? "Desafio desativado" : "Desafio ativado", d.titulo);
    } catch (e) {
      notify.error("Não foi possível alterar", (e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(d: Desafio) {
    if (!window.confirm(`Excluir o desafio "${d.titulo}" (${periodoBR(d)})?\n\nAs vendas não são afetadas. Esta ação não pode ser desfeita.`)) return;
    setOcupado(d.id);
    try {
      await desafiosApi.excluir(d.id);
      notify.success("Desafio excluído", d.titulo);
    } catch (e) {
      notify.error("Não foi possível excluir", (e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <Link href="/desafio" className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: GOLD }}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> Ver desafio em andamento
      </Link>

      <header
        className="flex flex-col gap-3 rounded-2xl p-5 text-white sm:flex-row sm:items-center"
        style={{ background: NAVY, borderBottom: `5px solid ${GOLD}` }}
      >
        <div className="flex items-center gap-3">
          <Trophy className="h-8 w-8 shrink-0" style={{ color: GOLD }} aria-hidden />
          <div>
            <h1 className="text-2xl font-black">Gerenciar desafios</h1>
            <p className="text-sm text-white/80">
              Crie, edite, ative e desative. Um desafio ativo aparece sozinho no 1º dia e sai do menu{" "}
              2 dias depois do último dia.
            </p>
          </div>
        </div>
        <Button className="sm:ml-auto" onClick={() => setEditando({ dados: novo() })}>
          <Plus className="h-4 w-4" aria-hidden /> Novo desafio
        </Button>
      </header>

      {desafios.length === 0 && (
        <p className="rounded-2xl bg-white p-8 text-center text-lg font-bold" style={{ color: NAVY }}>
          Nenhum desafio cadastrado ainda.
        </p>
      )}

      <ul className="space-y-3">
        {desafios.map((d) => {
          const estado = estadoDoDesafio(d, hoje);
          const info = ESTADO_INFO[estado];
          return (
            <li key={d.id} className="rounded-2xl bg-white p-4 sm:p-5" style={{ color: NAVY }}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-extrabold text-white"
                      style={{ background: info.cor }}
                    >
                      {info.rotulo}
                    </span>
                    <span className="text-sm text-slate-600">
                      {periodoBR(d)} · {diasDoDesafio(d).length} dias
                    </span>
                  </div>
                  <p className="mt-1 text-lg font-black">{d.titulo}</p>
                  <p className="text-sm text-slate-600">
                    Objetivo {brl(metaColetivaDe(d))} · {d.participantes.length} vendedor
                    {d.participantes.length === 1 ? "" : "es"}: {d.participantes.map((p) => p.nome).join(", ")}
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[#C9A227]"
                    checked={d.ativo}
                    disabled={ocupado === d.id}
                    onChange={() => void alternarAtivo(d)}
                  />
                  {d.ativo ? "Ativo" : "Desativado"}
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/desafio/${d.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
                >
                  <Eye className="h-4 w-4" aria-hidden /> Ver
                </Link>
                <button
                  type="button"
                  onClick={() => setEditando({ id: d.id, dados: { ...d, participantes: d.participantes.map((p) => ({ ...p })) } })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
                >
                  <Pencil className="h-4 w-4" aria-hidden /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => setEditando({ dados: proximaRodada(d) })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-white"
                  style={{ background: NAVY }}
                  title="Copia vendedores e metas e começa no dia seguinte ao fim, com a mesma duração"
                >
                  <CalendarPlus className="h-4 w-4" aria-hidden /> Duplicar para a próxima rodada
                </button>
                <button
                  type="button"
                  onClick={() => setEditando({ dados: { ...d, titulo: `${d.titulo} (cópia)`, participantes: d.participantes.map((p) => ({ ...p })) } })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
                >
                  <Copy className="h-4 w-4" aria-hidden /> Copiar
                </button>
                <button
                  type="button"
                  onClick={() => void excluir(d)}
                  disabled={ocupado === d.id}
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Excluir
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {editando && (
        <FormularioDesafio
          inicial={editando.dados}
          editandoId={editando.id}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function FormularioDesafio({
  inicial,
  editandoId,
  onFechar,
}: {
  inicial: Rascunho;
  editandoId?: string;
  onFechar: () => void;
}) {
  const vendedores = useVendedores();
  const [d, setD] = useState<Rascunho>(inicial);
  const [metaTodos, setMetaTodos] = useState("");
  const [metaFixa, setMetaFixa] = useState(inicial.metaColetiva ? formatNumBR(inicial.metaColetiva) : "");
  const [usarMetaFixa, setUsarMetaFixa] = useState(Boolean(inicial.metaColetiva));
  const [erros, setErros] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  // ativos primeiro; inativos só aparecem se já estiverem no desafio
  const lista = useMemo(() => {
    const no = new Set(d.participantes.map((p) => p.vendedorId));
    return vendedores
      .filter((v) => v.ativo || no.has(v.id))
      .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome));
  }, [vendedores, d.participantes]);

  const set = (patch: Partial<Rascunho>) => setD((x) => ({ ...x, ...patch }));
  const participante = (id: string) => d.participantes.find((p) => p.vendedorId === id);
  const setParticipante = (id: string, patch: Partial<ParticipanteDesafio>) =>
    set({ participantes: d.participantes.map((p) => (p.vendedorId === id ? { ...p, ...patch } : p)) });

  function alternar(id: string, nome: string) {
    if (participante(id)) set({ participantes: d.participantes.filter((p) => p.vendedorId !== id) });
    else {
      const meta = parseNumBR(metaTodos) || d.participantes[0]?.meta || 0;
      set({ participantes: [...d.participantes, { vendedorId: id, nome: nomeBonito(nome), meta }] });
    }
  }

  const somaMetas = d.participantes.reduce((a, p) => a + (Number(p.meta) || 0), 0);
  const nDias = d.inicio && d.fim && d.fim >= d.inicio ? diasDoDesafio(d).length : 0;

  async function salvar() {
    const final: Rascunho = { ...d, metaColetiva: usarMetaFixa ? parseNumBR(metaFixa) : undefined };
    const problemas = validarDesafio(final);
    setErros(problemas);
    if (problemas.length) return;
    setSalvando(true);
    try {
      if (editandoId) await desafiosApi.atualizar(editandoId, final);
      else await desafiosApi.criar(final);
      notify.success(editandoId ? "Desafio atualizado" : "Desafio criado", final.titulo);
      onFechar();
    } catch (e) {
      notify.error("Não foi possível salvar", (e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open onClose={onFechar} title={editandoId ? "Editar desafio" : "Novo desafio"} size="lg" icon={<Trophy className="h-5 w-5" />}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="d-titulo">Nome do desafio</Label>
            <Input
              id="d-titulo"
              value={d.titulo}
              placeholder="Ex.: DESAFIO LB — META DE R$ 1 MILHÃO"
              onChange={(e) => set({ titulo: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="d-frase">Frase do rodapé</Label>
            <Input id="d-frase" value={d.frase} onChange={(e) => set({ frase: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="d-inicio">Início</Label>
            <Input id="d-inicio" type="date" value={d.inicio} onChange={(e) => set({ inicio: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="d-fim">Fim (último dia)</Label>
            <Input id="d-fim" type="date" value={d.fim} onChange={(e) => set({ fim: e.target.value })} />
          </div>
        </div>
        <p className="text-sm text-[var(--color-text-dim)]">
          {nDias > 0 ? `${nDias} dias de desafio.` : "Confira as datas."}
        </p>

        <div className="rounded-xl border border-[var(--color-border)] p-3">
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <Label htmlFor="d-meta-todos">Meta igual para todos (opcional)</Label>
              <Input
                id="d-meta-todos"
                inputMode="decimal"
                placeholder="Ex.: 200.000,00"
                value={metaTodos}
                onChange={(e) => setMetaTodos(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              type="button"
              disabled={!parseNumBR(metaTodos) || d.participantes.length === 0}
              onClick={() =>
                set({ participantes: d.participantes.map((p) => ({ ...p, meta: parseNumBR(metaTodos) })) })
              }
            >
              Aplicar a todos marcados
            </Button>
          </div>

          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
            Vendedores ({d.participantes.length} marcados)
          </p>
          <p className="mb-1 hidden grid-cols-[minmax(0,1fr)_12rem_9rem] gap-2 px-3 text-[11px] text-[var(--color-text-dim)] sm:grid">
            <span>Cadastro</span>
            <span>Nome no desafio</span>
            <span>Meta (R$)</span>
          </p>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {lista.map((v) => {
              const p = participante(v.id);
              return (
                <li
                  key={v.id}
                  className="grid items-center gap-2 rounded-lg bg-[var(--color-surface-2)] px-3 py-2 sm:grid-cols-[minmax(0,1fr)_12rem_9rem]"
                >
                  <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#C9A227]"
                      checked={Boolean(p)}
                      onChange={() => alternar(v.id, v.nome)}
                    />
                    {v.nome}
                    {!v.ativo && <span className="text-xs text-amber-400">(inativo)</span>}
                  </label>
                  {p && (
                    <>
                      <Input
                        aria-label={`Nome exibido de ${v.nome}`}
                        className="h-9 bg-[var(--color-surface)]"
                        value={p.nome}
                        onChange={(e) => setParticipante(v.id, { nome: e.target.value })}
                      />
                      <Input
                        aria-label={`Meta de ${v.nome}`}
                        className="h-9 bg-[var(--color-surface)]"
                        inputMode="decimal"
                        placeholder="Meta R$"
                        defaultValue={p.meta ? formatNumBR(p.meta) : ""}
                        key={`${v.id}-${p.meta}`}
                        onBlur={(e) => setParticipante(v.id, { meta: parseNumBR(e.target.value) })}
                      />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-[var(--color-text-dim)]">
            Nome exibido: como aparece no desafio (o cadastro não muda). A meta vale para o período inteiro.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] p-3 text-sm">
          <p className="mb-2 font-bold">Meta da equipe</p>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!usarMetaFixa} onChange={() => setUsarMetaFixa(false)} />
            Soma das metas individuais: <b>{brl(somaMetas)}</b>
          </label>
          <label className="mt-1 flex flex-wrap items-center gap-2">
            <input type="radio" checked={usarMetaFixa} onChange={() => setUsarMetaFixa(true)} />
            Outro valor:
            <Input
              className="h-9 w-44"
              inputMode="decimal"
              placeholder="Ex.: 1.000.000,00"
              value={metaFixa}
              disabled={!usarMetaFixa}
              onChange={(e) => setMetaFixa(e.target.value)}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-[#C9A227]" checked={d.ativo} onChange={(e) => set({ ativo: e.target.checked })} />
          Ativo (aparece para a equipe durante o período)
        </label>

        {erros.length > 0 && (
          <ul className="list-disc rounded-lg border border-red-400/50 bg-red-500/10 p-3 pl-7 text-sm text-red-300">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar desafio"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
