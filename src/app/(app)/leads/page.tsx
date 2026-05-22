"use client";

import { useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  Car,
  CheckCircle2,
  Construction,
  FileText,
  Home,
  MessageCircle,
  MoreVertical,
  Mountain,
  Pencil,
  Phone,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  Truck,
  Wrench,
  XCircle,
} from "lucide-react";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { leadsApi, useLeads, useVendedores } from "@/lib/store";
import {
  LEAD_STATUS_INFO,
  LEAD_TIPO_INFO,
  type Lead,
  type LeadStatus,
  type LeadTipo,
} from "@/lib/types";
import { brl, parseNumBR } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";

const STATUS_ORDER: LeadStatus[] = [
  "oportunidade",
  "primeiro_contato",
  "reuniao_agendada",
  "reuniao",
  "acompanhamento",
  "fechamento",
  "perdido",
];
const STATUS_HEADER_TONE: Record<LeadStatus, string> = {
  oportunidade: "from-indigo-500/30 to-indigo-500/0 border-indigo-500/30",
  primeiro_contato: "from-sky-500/30 to-sky-500/0 border-sky-500/30",
  reuniao_agendada: "from-cyan-500/30 to-cyan-500/0 border-cyan-500/30",
  reuniao: "from-amber-500/30 to-amber-500/0 border-amber-500/30",
  acompanhamento: "from-orange-500/30 to-orange-500/0 border-orange-500/30",
  fechamento: "from-emerald-500/30 to-emerald-500/0 border-emerald-500/30",
  perdido: "from-rose-500/30 to-rose-500/0 border-rose-500/30",
};

const TIPO_ORDER: LeadTipo[] = [
  "imovel",
  "carro",
  "moto",
  "caminhao",
  "terreno",
  "maquinario",
  "servico",
];
const TIPO_ICON: Record<LeadTipo, React.ComponentType<{ className?: string }>> = {
  imovel: Home,
  carro: Car,
  moto: Sparkles, // sem ícone de moto específico no lucide, usa Sparkles como placeholder
  caminhao: Truck,
  terreno: Mountain,
  maquinario: Construction,
  servico: Wrench,
};

type FormState = {
  nome: string;
  telefone: string;
  tipo: LeadTipo | "";
  valorEstimado: string;
  status: LeadStatus;
  vendedorId: string;
  email: string;
  origem: string;
  observacao: string;
};

const empty: FormState = {
  nome: "",
  telefone: "",
  tipo: "",
  valorEstimado: "",
  status: "oportunidade",
  vendedorId: "",
  email: "",
  origem: "",
  observacao: "",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}m`;
  return `${Math.floor(months / 12)}a`;
}

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}
function waLink(telefone: string) {
  const d = onlyDigits(telefone);
  if (!d) return null;
  const numero = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${numero}`;
}
function telLink(telefone: string) {
  const d = onlyDigits(telefone);
  return d ? `tel:+${d.startsWith("55") ? d : "55" + d}` : null;
}

export default function LeadsPage() {
  const leads = useLeads();
  const vendedores = useVendedores();
  const [filtroVendedor, setFiltroVendedor] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [salvando, setSalvando] = useState(false);
  const [compartilhar, setCompartilhar] = useState<Lead | null>(null);
  const [novoVendedorId, setNovoVendedorId] = useState("");

  const filtrados = useMemo(
    () =>
      filtroVendedor === "todos"
        ? leads
        : filtroVendedor === "sem-vendedor"
          ? leads.filter((l) => !l.vendedorId)
          : leads.filter((l) => l.vendedorId === filtroVendedor),
    [leads, filtroVendedor],
  );

  const colunas = useMemo(() => {
    const grupos: Record<LeadStatus, Lead[]> = {
      oportunidade: [],
      primeiro_contato: [],
      reuniao_agendada: [],
      reuniao: [],
      acompanhamento: [],
      fechamento: [],
      perdido: [],
    };
    for (const l of filtrados) grupos[l.status].push(l);
    return grupos;
  }, [filtrados]);

  const totais = useMemo(
    () =>
      STATUS_ORDER.reduce(
        (acc, s) => ({
          ...acc,
          [s]: colunas[s].reduce((a, l) => a + l.valorEstimado, 0),
        }),
        {} as Record<LeadStatus, number>,
      ),
    [colunas],
  );

  function abrirNovo(status?: LeadStatus) {
    setEditing(null);
    setForm({ ...empty, status: status ?? "oportunidade" });
    setOpen(true);
  }
  function abrirEditar(l: Lead) {
    setEditing(l);
    setForm({
      nome: l.nome,
      telefone: l.telefone,
      tipo: l.tipo ?? "",
      valorEstimado: String(l.valorEstimado || ""),
      status: l.status,
      vendedorId: l.vendedorId ?? "",
      email: l.email,
      origem: l.origem ?? "",
      observacao: l.observacao ?? "",
    });
    setOpen(true);
  }
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      notify.error("Informe o nome do contato");
      return;
    }
    if (!form.telefone.trim()) {
      notify.error("Informe o telefone do contato");
      return;
    }
    if (!form.tipo) {
      notify.error("Selecione o tipo de negócio");
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        telefone: form.telefone.trim(),
        valorEstimado: parseNumBR(form.valorEstimado),
        status: form.status,
        tipo: form.tipo as LeadTipo,
        vendedorId: form.vendedorId || undefined,
        origem: form.origem.trim() || undefined,
        observacao: form.observacao.trim() || undefined,
      };
      if (editing) {
        await leadsApi.update(editing.id, payload);
        notify.success("Negócio atualizado");
      } else {
        await leadsApi.add(payload);
        notify.success("Negócio criado", `${payload.nome} adicionado em ${LEAD_STATUS_INFO[payload.status].label}`);
      }
      setOpen(false);
    } catch (e) {
      notify.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }
  async function remover(l: Lead) {
    if (!confirm(`Remover ${l.nome}?`)) return;
    try {
      await leadsApi.remove(l.id);
      notify.success("Removido");
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }
  async function mudarStatus(l: Lead, status: LeadStatus) {
    try {
      await leadsApi.update(l.id, { status });
      notify.success(`Movido para ${LEAD_STATUS_INFO[status].label}`);
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }

  function abrirCompartilhar(l: Lead) {
    setCompartilhar(l);
    setNovoVendedorId(l.vendedorId ?? "");
  }
  async function confirmarCompartilhar() {
    if (!compartilhar) return;
    if (!novoVendedorId) {
      notify.error("Selecione um vendedor");
      return;
    }
    if (novoVendedorId === compartilhar.vendedorId) {
      notify.info("Já é o vendedor responsável");
      return;
    }
    try {
      await leadsApi.update(compartilhar.id, { vendedorId: novoVendedorId });
      const novo = vendedores.find((v) => v.id === novoVendedorId);
      notify.success(`Negócio transferido para ${novo?.nome ?? "vendedor"}`);
      setCompartilhar(null);
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }

  const totalGeral = filtrados.reduce((a, l) => a + l.valorEstimado, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline de Negócios</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            {filtrados.length} negócios · Total estimado {brl(totalGeral)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={filtroVendedor}
            onChange={(e) => setFiltroVendedor(e.target.value)}
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
          >
            <option value="todos">Todos vendedores</option>
            <option value="sem-vendedor">Sem vendedor</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
          <Button onClick={() => abrirNovo()}>
            <Plus className="h-4 w-4" />
            Criar negócio
          </Button>
        </div>
      </header>

      <div className="overflow-x-auto pb-2">
        <div
          className="grid grid-flow-col gap-4"
          style={{ gridAutoColumns: "minmax(260px, 1fr)" }}
        >
          {STATUS_ORDER.map((s) => {
            const info = LEAD_STATUS_INFO[s];
            const items = colunas[s];
            return (
              <div
                key={s}
                className="flex min-h-[400px] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
              >
                <div
                  className={`flex items-start justify-between rounded-t-xl border-b bg-gradient-to-b px-4 py-3 ${STATUS_HEADER_TONE[s]}`}
                >
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-white">
                      {info.label} <span className="ml-1 opacity-60">({items.length})</span>
                    </p>
                    <p className="mt-0.5 text-xs text-white/70 tabular-nums">
                      {brl(totais[s])}
                    </p>
                  </div>
                  <button
                    onClick={() => abrirNovo(s)}
                    className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
                    title="Adicionar nesta etapa"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {items.map((l) => {
                    const vendedor = vendedores.find((v) => v.id === l.vendedorId);
                    const wa = waLink(l.telefone);
                    const tel = telLink(l.telefone);
                    const TipoIcon = l.tipo ? TIPO_ICON[l.tipo] : Building2;
                    const tipoLabel = l.tipo ? LEAD_TIPO_INFO[l.tipo].label : "Negócio";
                    return (
                      <div
                        key={l.id}
                        className="group relative rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 transition-shadow hover:shadow-lg"
                      >
                        <div className="mb-1.5 flex items-start justify-between">
                          <div className="flex items-center gap-1.5">
                            <TipoIcon className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
                            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
                              {tipoLabel}
                            </span>
                          </div>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
                            {timeAgo(l.criadoEm)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => abrirEditar(l)}
                          className="block w-full text-left"
                        >
                          <p className="truncate text-sm font-semibold text-[var(--color-text)] hover:underline">
                            {l.nome}
                          </p>
                          {l.origem && (
                            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
                              {l.origem}
                            </p>
                          )}
                        </button>

                        {l.telefone && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-text-dim)]">
                            <Phone className="h-3 w-3 text-[var(--color-success)]" />
                            <span className="truncate">{l.telefone}</span>
                          </div>
                        )}

                        {vendedor && (
                          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
                            <span className="font-medium text-[var(--color-text)]">
                              {vendedor.nome}
                            </span>
                          </p>
                        )}

                        <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2">
                          <div className="flex items-center gap-1">
                            {tel && (
                              <a
                                href={tel}
                                className="rounded p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-surface)] hover:text-[var(--color-success)]"
                                title="Ligar"
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-surface)] hover:text-[var(--color-success)]"
                                title="WhatsApp"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <Dropdown
                              trigger={<MoreVertical className="h-3.5 w-3.5" />}
                              align="start"
                              width={260}
                              header={
                                <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs">
                                  <p className="font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                                    Ações
                                  </p>
                                  <p className="mt-0.5 truncate text-[var(--color-text)]">
                                    {l.nome}
                                    {l.tipo && ` · ${LEAD_TIPO_INFO[l.tipo].label}`}
                                    {l.valorEstimado > 0 && ` · ${brl(l.valorEstimado)}`}
                                  </p>
                                </div>
                              }
                            >
                              {(close) => (
                                <>
                                  <DropdownItem
                                    icon={<Pencil className="h-4 w-4" />}
                                    onClick={() => {
                                      abrirEditar(l);
                                      close();
                                    }}
                                  >
                                    Editar
                                  </DropdownItem>
                                  {wa && (
                                    <DropdownItem
                                      icon={<MessageCircle className="h-4 w-4 text-[var(--color-success)]" />}
                                      hint={l.telefone}
                                      onClick={() => {
                                        window.open(wa, "_blank");
                                        close();
                                      }}
                                    >
                                      WhatsApp
                                    </DropdownItem>
                                  )}
                                  {tel && (
                                    <DropdownItem
                                      icon={<Phone className="h-4 w-4 text-[var(--color-success)]" />}
                                      hint={l.telefone}
                                      onClick={() => {
                                        window.location.href = tel;
                                        close();
                                      }}
                                    >
                                      Telefone
                                    </DropdownItem>
                                  )}
                                  <DropdownItem
                                    icon={<FileText className="h-4 w-4" />}
                                    disabled
                                    hint="em breve"
                                  >
                                    Gerar Proposta
                                  </DropdownItem>
                                  <DropdownItem
                                    icon={<Share2 className="h-4 w-4" />}
                                    onClick={() => {
                                      abrirCompartilhar(l);
                                      close();
                                    }}
                                  >
                                    Compartilhar
                                  </DropdownItem>
                                  <DropdownSeparator />
                                  <DropdownItem
                                    icon={<XCircle className="h-4 w-4" />}
                                    danger
                                    disabled={l.status === "perdido"}
                                    onClick={() => {
                                      mudarStatus(l, "perdido");
                                      close();
                                    }}
                                  >
                                    Perdeu
                                  </DropdownItem>
                                  <DropdownItem
                                    icon={<CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />}
                                    disabled={l.status === "fechamento"}
                                    onClick={() => {
                                      mudarStatus(l, "fechamento");
                                      close();
                                    }}
                                  >
                                    Ganhou
                                  </DropdownItem>
                                  <DropdownSeparator />
                                  <DropdownItem
                                    icon={<Trash2 className="h-4 w-4" />}
                                    danger
                                    onClick={() => {
                                      remover(l);
                                      close();
                                    }}
                                  >
                                    Excluir
                                  </DropdownItem>
                                </>
                              )}
                            </Dropdown>
                            <select
                              value={l.status}
                              onChange={(e) =>
                                mudarStatus(l, e.target.value as LeadStatus)
                              }
                              className="ml-1 rounded border border-[var(--color-border)] bg-transparent px-1 py-0 text-[10px] text-[var(--color-text-dim)]"
                              title="Mover etapa"
                            >
                              {STATUS_ORDER.map((st) => (
                                <option key={st} value={st}>
                                  {LEAD_STATUS_INFO[st].label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <span className="text-xs font-semibold text-[var(--color-text)] tabular-nums">
                            {brl(l.valorEstimado)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="flex h-32 flex-col items-center justify-center gap-1 text-center text-xs text-[var(--color-text-dim)]">
                      <Sparkles className="h-4 w-4 opacity-40" />
                      <span>Arraste um card aqui</span>
                      <button
                        onClick={() => abrirNovo(s)}
                        className="text-[var(--color-brand)] hover:underline"
                      >
                        Adicionar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar Negócio" : "Criar Negócio"}
        subtitle="Informações do Contato e do Negócio"
        icon={<Briefcase className="h-5 w-5" />}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="nome">
                Nome do Contato <span className="text-[var(--color-danger)]">*</span>
              </Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="tel">
                Telefone de Contato <span className="text-[var(--color-danger)]">*</span>
              </Label>
              <Input
                id="tel"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(79) 99999-0000"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="tipo">
                Tipo de Negócio <span className="text-[var(--color-danger)]">*</span>
              </Label>
              <select
                id="tipo"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as LeadTipo | "" })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
                required
              >
                <option value="">Selecione o Tipo</option>
                {TIPO_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {LEAD_TIPO_INFO[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="val">Valor do Crédito (opcional)</Label>
              <Input
                id="val"
                type="number"
                min={0}
                step={100}
                value={form.valorEstimado}
                onChange={(e) => setForm({ ...form, valorEstimado: e.target.value })}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="st">Etapa</Label>
              <select
                id="st"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_INFO[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="vd">Vendedor responsável</Label>
              <select
                id="vd"
                value={form.vendedorId}
                onChange={(e) => setForm({ ...form, vendedorId: e.target.value })}
                className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
              >
                <option value="">— sem vendedor —</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="email">Email (opcional)</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="or">Origem (opcional)</Label>
              <Input
                id="or"
                value={form.origem}
                onChange={(e) => setForm({ ...form, origem: e.target.value })}
                placeholder="Indicação, site, anúncio…"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="obs">Observação</Label>
            <textarea
              id="obs"
              rows={3}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : editing ? "Salvar" : "Criar negócio"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!compartilhar}
        onClose={() => setCompartilhar(null)}
        title="Compartilhar negócio"
        subtitle={compartilhar ? `Transferir "${compartilhar.nome}" para outro vendedor` : ""}
        icon={<Share2 className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="vd-compartilhar">Novo vendedor responsável</Label>
            <select
              id="vd-compartilhar"
              value={novoVendedorId}
              onChange={(e) => setNovoVendedorId(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm"
            >
              <option value="">— selecione —</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                  {v.id === compartilhar?.vendedorId ? " (atual)" : ""}
                </option>
              ))}
            </select>
          </div>
          {compartilhar?.vendedorId && (
            <p className="rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text-dim)]">
              Atualmente com:{" "}
              <span className="font-medium text-[var(--color-text)]">
                {vendedores.find((v) => v.id === compartilhar.vendedorId)?.nome ?? "—"}
              </span>
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCompartilhar(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarCompartilhar}>
              Transferir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
