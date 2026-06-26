"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  Palette,
  Plus,
  Power,
  Sparkles,
  Trash2,
  Archive,
} from "lucide-react";
import { notify } from "@/lib/notify";
import { temasApi, useReady, useTemas } from "@/lib/store";
import {
  slugify,
  slugUnico,
  type EstiloTema,
  type Premiacao,
  type StatusTema,
  type Tema,
} from "@/lib/temas";
import { brl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PremiumStage } from "@/components/premium-stage";
import { TemaProvider } from "@/components/tema-provider";
import {
  BannerCampanha,
  BarraProgresso,
  EfeitosTema,
  PodioPreview,
  Premiacoes,
} from "@/components/tema-gamificacao";

type Draft = {
  id?: string;
  nome: string;
  slug: string;
  status: StatusTema;
  dataInicio: string;
  dataFim: string;
  estilo: EstiloTema;
};

const STATUS_INFO: Record<StatusTema, { label: string; cor: string }> = {
  ativo: { label: "Ativo", cor: "#22C55E" },
  inativo: { label: "Inativo", cor: "#FACC15" },
  rascunho: { label: "Rascunho", cor: "#94a3b8" },
  arquivado: { label: "Arquivado", cor: "#64748b" },
};

function novoDraft(): Draft {
  return {
    nome: "",
    slug: "",
    status: "rascunho",
    dataInicio: "",
    dataFim: "",
    estilo: {
      primaria: "#FACC15",
      secundaria: "#6366f1",
      terciaria: "#a855f7",
      ouro: "#f59e0b",
      prata: "#3b82f6",
      bronze: "#f43f5e",
      background: "#06070d",
      efeitos: { particulas: true, confetes: false, brilho: true, animacoes: true },
      campanha: {},
      premiacoes: [],
    },
  };
}

function draftDeTema(t: Tema): Draft {
  return {
    id: t.id,
    nome: t.nome,
    slug: t.slug,
    status: t.status,
    dataInicio: t.dataInicio ?? "",
    dataFim: t.dataFim ?? "",
    estilo: { ...t.estilo },
  };
}

function CampoCor({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  const v = value ?? "";
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
          aria-label={label}
        />
        <Input value={v} onChange={(e) => onChange(e.target.value)} placeholder="#RRGGBB" />
      </div>
    </div>
  );
}

export default function TemporadasPage() {
  const temas = useTemas();
  const ready = useReady();
  const [editando, setEditando] = useState<Draft | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Semeia os 5 temas padrão na 1ª vez (só depois de carregar e se estiver vazio).
  const semeou = useRef(false);
  useEffect(() => {
    if (!ready || semeou.current || temas.length > 0) return;
    semeou.current = true;
    void temasApi.seedPadrao();
  }, [ready, temas.length]);

  const visiveis = useMemo(
    () => temas.filter((t) => t.status !== "arquivado").concat(temas.filter((t) => t.status === "arquivado")),
    [temas],
  );

  // ---- helpers de edição ----
  const setEstilo = (patch: Partial<EstiloTema>) =>
    setEditando((d) => (d ? { ...d, estilo: { ...d.estilo, ...patch } } : d));
  const setCampanha = (patch: Partial<NonNullable<EstiloTema["campanha"]>>) =>
    setEditando((d) => (d ? { ...d, estilo: { ...d.estilo, campanha: { ...d.estilo.campanha, ...patch } } } : d));
  const setEfeitos = (patch: Partial<NonNullable<EstiloTema["efeitos"]>>) =>
    setEditando((d) => (d ? { ...d, estilo: { ...d.estilo, efeitos: { ...d.estilo.efeitos, ...patch } } } : d));
  const setPrem = (lista: Premiacao[]) => setEstilo({ premiacoes: lista });

  async function salvar() {
    if (!editando) return;
    const nome = editando.nome.trim();
    if (!nome) {
      notify.error("Dê um nome ao tema");
      return;
    }
    const base = editando.slug.trim() || slugify(nome);
    setSalvando(true);
    try {
      if (editando.id) {
        await temasApi.update(editando.id, {
          nome,
          slug: base,
          status: editando.status,
          estilo: editando.estilo,
          dataInicio: editando.dataInicio || undefined,
          dataFim: editando.dataFim || undefined,
        });
      } else {
        const slug = slugUnico(base, temas.map((t) => t.slug));
        await temasApi.add({
          nome,
          slug,
          status: editando.status,
          estilo: editando.estilo,
          dataInicio: editando.dataInicio || undefined,
          dataFim: editando.dataFim || undefined,
        });
      }
      notify.success("Tema salvo");
      setEditando(null);
    } catch (e) {
      notify.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  async function acao(fn: () => Promise<void>, msg: string) {
    try {
      await fn();
      notify.success(msg);
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    }
  }

  // ================= EDITOR =================
  if (editando) {
    const d = editando;
    const temaPreview: Tema = {
      id: d.id ?? "preview",
      nome: d.nome || "Prévia",
      slug: d.slug || "preview",
      status: d.status,
      estilo: d.estilo,
      criadoEm: "",
    };
    const prem = d.estilo.premiacoes ?? [];
    return (
      <PremiumStage>
        <header className="lb-fade-up flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setEditando(null)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white/70 hover:bg-white/5">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-xl font-extrabold text-white md:text-2xl">{d.id ? "Editar tema" : "Novo tema"}</h1>
          </div>
          <Button onClick={salvar} disabled={salvando}>
            <Check className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar tema"}
          </Button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          {/* ---------- FORM ---------- */}
          <div className="space-y-5">
            <Secao titulo="Identidade">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Nome</Label>
                  <Input value={d.nome} onChange={(e) => setEditando({ ...d, nome: e.target.value })} placeholder="Ex: Copa do Mundo" />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    value={d.status}
                    onChange={(e) => setEditando({ ...d, status: e.target.value as StatusTema })}
                    className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)]"
                  >
                    <option value="rascunho">Rascunho</option>
                    <option value="inativo">Inativo</option>
                    <option value="ativo">Ativo</option>
                    <option value="arquivado">Arquivado</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={d.estilo.descricao ?? ""} onChange={(e) => setEstilo({ descricao: e.target.value })} placeholder="Resumo do tema" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Logo (URL)</Label><Input value={d.estilo.logo ?? ""} onChange={(e) => setEstilo({ logo: e.target.value })} placeholder="https://…" /></div>
                <div><Label>Banner (URL)</Label><Input value={d.estilo.banner ?? ""} onChange={(e) => setEstilo({ banner: e.target.value })} placeholder="https://…" /></div>
                <div><Label>Data início</Label><Input type="date" value={d.dataInicio} onChange={(e) => setEditando({ ...d, dataInicio: e.target.value })} /></div>
                <div><Label>Data fim</Label><Input type="date" value={d.dataFim} onChange={(e) => setEditando({ ...d, dataFim: e.target.value })} /></div>
              </div>
            </Secao>

            <Secao titulo="Cores">
              <div className="grid gap-4 sm:grid-cols-3">
                <CampoCor label="Primária" value={d.estilo.primaria} onChange={(v) => setEstilo({ primaria: v })} />
                <CampoCor label="Secundária" value={d.estilo.secundaria} onChange={(v) => setEstilo({ secundaria: v })} />
                <CampoCor label="Terciária" value={d.estilo.terciaria} onChange={(v) => setEstilo({ terciaria: v })} />
                <CampoCor label="Ouro (1º)" value={d.estilo.ouro} onChange={(v) => setEstilo({ ouro: v })} />
                <CampoCor label="Prata (2º)" value={d.estilo.prata} onChange={(v) => setEstilo({ prata: v })} />
                <CampoCor label="Bronze (3º)" value={d.estilo.bronze} onChange={(v) => setEstilo({ bronze: v })} />
              </div>
              <div><Label>Fundo (cor, gradiente ou url)</Label><Input value={d.estilo.background ?? ""} onChange={(e) => setEstilo({ background: e.target.value })} placeholder="#06070d ou radial-gradient(…)" /></div>
            </Secao>

            <Secao titulo="Tipografia (opcional)">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Fonte principal</Label><Input value={d.estilo.fontePrincipal ?? ""} onChange={(e) => setEstilo({ fontePrincipal: e.target.value })} placeholder="Ex: Poppins, sans-serif" /></div>
                <div><Label>Link da webfont</Label><Input value={d.estilo.fonteUrl ?? ""} onChange={(e) => setEstilo({ fonteUrl: e.target.value })} placeholder="https://fonts.googleapis.com/…" /></div>
              </div>
            </Secao>

            <Secao titulo="Campanha (textos da temporada)">
              <div><Label>Nome da campanha</Label><Input value={d.estilo.campanha?.nome ?? ""} onChange={(e) => setCampanha({ nome: e.target.value })} placeholder="Ex: Copa do Mundo" /></div>
              <div><Label>Meta principal</Label><Input value={d.estilo.campanha?.metaPrincipal ?? ""} onChange={(e) => setCampanha({ metaPrincipal: e.target.value })} placeholder="Ex: Faça 6 fechamentos…" /></div>
              <div><Label>Texto motivacional</Label><Input value={d.estilo.campanha?.textoMotivacional ?? ""} onChange={(e) => setCampanha({ textoMotivacional: e.target.value })} placeholder="Ex: Cada venda é um gol!" /></div>
            </Secao>

            <Secao titulo="Efeitos">
              <div className="flex flex-wrap gap-4">
                {([["particulas", "Partículas"], ["confetes", "Confetes"], ["brilho", "Brilho"], ["animacoes", "Animações"]] as const).map(([k, lbl]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-white/80">
                    <input type="checkbox" checked={!!d.estilo.efeitos?.[k]} onChange={(e) => setEfeitos({ [k]: e.target.checked })} className="h-4 w-4 rounded border-[var(--color-border)]" />
                    {lbl}
                  </label>
                ))}
              </div>
            </Secao>

            <Secao titulo="Premiações">
              <div className="space-y-2">
                {prem.map((p, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                    <div className="w-16"><Label>Ícone</Label><Input value={p.icone} onChange={(e) => setPrem(prem.map((x, idx) => (idx === i ? { ...x, icone: e.target.value } : x)))} /></div>
                    <div className="min-w-[120px] flex-1"><Label>Nome</Label><Input value={p.nome} onChange={(e) => setPrem(prem.map((x, idx) => (idx === i ? { ...x, nome: e.target.value } : x)))} /></div>
                    <div className="min-w-[120px] flex-1"><Label>Critério</Label><Input value={p.criterio ?? ""} onChange={(e) => setPrem(prem.map((x, idx) => (idx === i ? { ...x, criterio: e.target.value } : x)))} /></div>
                    <button onClick={() => setPrem(prem.filter((_, idx) => idx !== i))} className="grid h-9 w-9 place-items-center rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button variant="secondary" onClick={() => setPrem([...prem, { tipo: "medalha", icone: "🏅", nome: "Nova premiação" }])}>
                  <Plus className="h-4 w-4" /> Adicionar premiação
                </Button>
              </div>
            </Secao>

            <Secao titulo="Avançado (opcional)">
              <Label>CSS personalizado</Label>
              <textarea
                value={d.estilo.cssPersonalizado ?? ""}
                onChange={(e) => setEstilo({ cssPersonalizado: e.target.value })}
                rows={4}
                placeholder=".lb-tema .meu-ajuste { … }"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 font-mono text-xs text-[var(--color-text)]"
              />
            </Secao>
          </div>

          {/* ---------- PRÉ-VISUALIZAÇÃO ---------- */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <Eye className="h-4 w-4" /> Pré-visualização ao vivo
            </p>
            <TemaProvider tema={temaPreview} className="relative overflow-hidden rounded-2xl border border-white/10 p-4" style={{ background: "var(--tema-bg)", minHeight: 380 }}>
              <EfeitosTema tema={temaPreview} />
              <div className="relative space-y-4">
                <BannerCampanha tema={temaPreview} />
                <Premiacoes tema={temaPreview} />
                <div className="pt-6"><PodioPreview tema={temaPreview} /></div>
                <BarraProgresso rotulo="Meta da equipe" atual={720000} alvo={1000000} cor="var(--tema-primaria)" fmt={brl} />
              </div>
            </TemaProvider>
          </div>
        </div>
      </PremiumStage>
    );
  }

  // ================= LISTA =================
  return (
    <PremiumStage>
      <header className="lb-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#a855f7" }}>
            <Palette className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>Temporadas</h1>
            <p className="text-sm text-white/55">Temas e campanhas sazonais da gamificação — só visual, sem deploy.</p>
          </div>
        </div>
        <Button onClick={() => setEditando(novoDraft())}>
          <Plus className="h-4 w-4" /> Novo tema
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visiveis.map((t) => {
          const si = STATUS_INFO[t.status];
          const e = t.estilo;
          return (
            <div key={t.id} className={`lb-card-premium lb-fade-up overflow-hidden rounded-2xl ${t.status === "arquivado" ? "opacity-60" : ""}`}>
              <div className="h-16" style={{ background: e.background ?? "#06070d" }} />
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-bold text-white">{t.nome}</p>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ color: si.cor, borderColor: `${si.cor}66`, background: `${si.cor}1a` }}>
                    {t.status === "ativo" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: si.cor }} />}
                    {si.label}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {[e.primaria, e.secundaria, e.terciaria, e.ouro, e.prata, e.bronze].map((c, i) => (
                    <span key={i} className="h-5 w-5 rounded-full border border-white/20" style={{ background: c ?? "#000" }} />
                  ))}
                </div>
                {e.campanha?.metaPrincipal ? <p className="truncate text-[11px] text-white/45">🎯 {e.campanha.metaPrincipal}</p> : null}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {t.status !== "ativo" ? (
                    <BtnAcao onClick={() => acao(() => temasApi.ativar(t.id), `Tema "${t.nome}" ativado`)} icon={<Power className="h-3.5 w-3.5" />} label="Ativar" cor="#22C55E" />
                  ) : (
                    <BtnAcao onClick={() => acao(() => temasApi.setStatus(t.id, "inativo"), "Desativado")} icon={<Power className="h-3.5 w-3.5" />} label="Desativar" cor="#FACC15" />
                  )}
                  <BtnAcao onClick={() => setEditando(draftDeTema(t))} icon={<Palette className="h-3.5 w-3.5" />} label="Editar" />
                  <BtnAcao onClick={() => acao(() => temasApi.duplicar(t.id), "Tema duplicado")} icon={<Copy className="h-3.5 w-3.5" />} label="Duplicar" />
                  {t.status !== "arquivado" ? (
                    <BtnAcao onClick={() => acao(() => temasApi.setStatus(t.id, "arquivado"), "Arquivado")} icon={<Archive className="h-3.5 w-3.5" />} label="Arquivar" />
                  ) : null}
                  <BtnAcao
                    onClick={() => { if (confirm(`Excluir o tema "${t.nome}"?`)) void acao(() => temasApi.remove(t.id), "Excluído"); }}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label="Excluir"
                    cor="#f43f5e"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {visiveis.length === 0 && (
        <div className="lb-card-premium rounded-2xl p-12 text-center text-white/50">
          <Sparkles className="mx-auto mb-2 h-6 w-6 opacity-60" />
          Carregando temas…
        </div>
      )}
    </PremiumStage>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="lb-card-premium overflow-hidden rounded-2xl">
      <div className="border-b border-white/10 px-5 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">{titulo}</h2>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </div>
  );
}

function BtnAcao({ onClick, icon, label, cor }: { onClick: () => void; icon: ReactNode; label: string; cor?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-white/5"
      style={{ color: cor ?? "rgba(255,255,255,.7)", borderColor: cor ? `${cor}55` : "rgba(255,255,255,.15)" }}
    >
      {icon} {label}
    </button>
  );
}
