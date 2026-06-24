"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Info,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PremiumStage } from "@/components/premium-stage";
import {
  useConfigProducao,
  useFeriados,
  configProducaoApi,
  feriadosApi,
} from "@/lib/store";
import { cicloAtual, setDeFeriados, type ConfigProducao, type InicioCiclo } from "@/lib/ciclo";

const FUTURO = "9999-12-31"; // sentinela "regra desligada"

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtBR(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
const fmtDia = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

type FormT = {
  diaBase: number;
  prorrogarDiaUtil: boolean;
  considerarSabDom: boolean;
  considerarFeriados: boolean;
  inicioProximoCiclo: InicioCiclo;
  dataInicioRegra: string;
};

function fromConfig(c: ConfigProducao): FormT {
  return {
    diaBase: c.diaBase,
    prorrogarDiaUtil: c.prorrogarDiaUtil,
    considerarSabDom: c.considerarSabDom,
    considerarFeriados: c.considerarFeriados,
    inicioProximoCiclo: c.inicioProximoCiclo,
    // não exibe a sentinela "9999" — sugere hoje como data de ativação
    dataInicioRegra: c.dataInicioRegra && c.dataInicioRegra < FUTURO ? c.dataInicioRegra : hojeISO(),
  };
}

function Toggle({
  titulo,
  desc,
  checked,
  onChange,
}: {
  titulo: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <span>
        <span className="block text-sm font-semibold text-white">{titulo}</span>
        <span className="block text-xs text-white/50">{desc}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--color-border)]"
      />
    </label>
  );
}

export default function FechamentoPage() {
  const config = useConfigProducao();
  const feriados = useFeriados();

  const [form, setForm] = useState<FormT>(() => fromConfig(config));
  const [salvando, setSalvando] = useState(false);
  const [novo, setNovo] = useState({ data: "", descricao: "" });
  const dirty = useRef(false);

  // Re-semeia o form quando a config chega do banco — desde que o usuário ainda
  // não tenha começado a editar (pra não apagar o que ele está digitando).
  useEffect(() => {
    if (!dirty.current) setForm(fromConfig(config));
  }, [config]);

  function set<K extends keyof FormT>(key: K, val: FormT[K]) {
    dirty.current = true;
    setForm((f) => ({ ...f, [key]: val }));
  }

  // Prévia: como fica o ciclo atual com a configuração que está na tela.
  const previa = useMemo(() => {
    if (!form.dataInicioRegra || !form.diaBase) return null;
    try {
      const fset = setDeFeriados(feriados.map((f) => f.data));
      return cicloAtual({ ...form }, fset, new Date());
    } catch {
      return null;
    }
  }, [form, feriados]);

  async function salvar() {
    if (!form.dataInicioRegra) {
      notify.error("Defina a data de início da regra");
      return;
    }
    setSalvando(true);
    try {
      await configProducaoApi.save({ ...form });
      dirty.current = false;
      notify.success("Configuração de fechamento salva");
    } catch (e) {
      notify.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  async function addFeriado(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.data) return;
    try {
      await feriadosApi.add({ data: novo.data, descricao: novo.descricao.trim() || undefined });
      setNovo({ data: "", descricao: "" });
      notify.success("Feriado adicionado");
    } catch (e) {
      notify.error("Erro ao adicionar", e instanceof Error ? e.message : undefined);
    }
  }
  async function removeFeriado(id: string, label: string) {
    if (!confirm(`Remover o feriado ${label}?`)) return;
    try {
      await feriadosApi.remove(id);
      notify.success("Feriado removido");
    } catch (e) {
      notify.error("Erro ao remover", e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <PremiumStage>
      <header className="lb-fade-up flex items-center gap-3">
        <span className="lb-orb h-11 w-11" style={{ ["--orb" as string]: "#C9A227" }}>
          <CalendarClock className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
            Fechamento de Produção
          </h1>
          <p className="text-sm text-white/55">
            Define quando o mês de produção fecha. Vale para ranking, dashboard, metas, relatórios e comissões.
          </p>
        </div>
      </header>

      {/* PRÉVIA */}
      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <span className="lb-orb h-10 w-10 shrink-0" style={{ ["--orb" as string]: "#3B82F6" }}>
            <Info className="h-5 w-5" />
          </span>
          <div className="text-sm">
            {previa ? (
              <>
                <p className="text-white/80">
                  Com essa configuração, o <b className="text-white">ciclo atual</b> vai de{" "}
                  <b className="text-white">{fmtDia(previa.inicio)}</b> até{" "}
                  <b className="text-white">{fmtDia(previa.fim)}</b> (próximo fechamento).
                </p>
                <p className="mt-1 text-xs text-white/45">
                  Tudo antes de {fmtBR(form.dataInicioRegra)} continua na regra antiga (mês-calendário) — o histórico não muda.
                </p>
              </>
            ) : (
              <p className="text-white/60">Preencha o dia base e a data de início para ver a prévia.</p>
            )}
          </div>
        </div>
      </div>

      {/* CONFIGURAÇÃO */}
      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Configuração</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="diaBase">Dia base do fechamento</Label>
              <Input
                id="diaBase"
                type="number"
                min={1}
                max={28}
                value={form.diaBase}
                onChange={(e) => set("diaBase", Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
              />
              <p className="mt-1 text-[11px] text-white/40">De 1 a 28. Padrão: 20.</p>
            </div>
            <div>
              <Label htmlFor="dataInicio">Data de início da nova regra</Label>
              <Input
                id="dataInicio"
                type="date"
                value={form.dataInicioRegra}
                onChange={(e) => set("dataInicioRegra", e.target.value)}
              />
              <p className="mt-1 text-[11px] text-white/40">Antes desta data, nada muda (histórico intacto).</p>
            </div>
          </div>

          <Toggle
            titulo="Prorrogar para o próximo dia útil"
            desc="Se o dia base cair em sábado, domingo ou feriado, o fechamento passa para o próximo dia útil."
            checked={form.prorrogarDiaUtil}
            onChange={(v) => set("prorrogarDiaUtil", v)}
          />
          <Toggle
            titulo="Considerar sábado e domingo"
            desc="Fins de semana contam como dia não-útil."
            checked={form.considerarSabDom}
            onChange={(v) => set("considerarSabDom", v)}
          />
          <Toggle
            titulo="Considerar feriados"
            desc="Usa a lista de feriados cadastrada abaixo."
            checked={form.considerarFeriados}
            onChange={(v) => set("considerarFeriados", v)}
          />

          <div>
            <Label htmlFor="inicioCiclo">Início do próximo ciclo</Label>
            <select
              id="inicioCiclo"
              value={form.inicioProximoCiclo}
              onChange={(e) => set("inicioProximoCiclo", e.target.value as InicioCiclo)}
              className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40"
            >
              <option value="dia_seguinte">No dia útil seguinte ao fechamento</option>
              <option value="no_fechamento">No próprio dia do fechamento</option>
            </select>
            <p className="mt-1 text-[11px] text-white/40">
              Define se o dia do fechamento ainda fecha o ciclo atual ou já abre o próximo.
            </p>
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={salvar} disabled={salvando}>
              <Save className="h-4 w-4" />
              {salvando ? "Salvando…" : "Salvar configuração"}
            </Button>
          </div>
        </div>
      </div>

      {/* FERIADOS */}
      <div className="lb-card-premium lb-fade-up overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Feriados</h2>
        </div>
        <div className="p-5">
          <form onSubmit={addFeriado} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[150px]">
              <Label htmlFor="fdata">Data</Label>
              <Input
                id="fdata"
                type="date"
                value={novo.data}
                onChange={(e) => setNovo({ ...novo, data: e.target.value })}
                required
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="desc">Descrição (opcional)</Label>
              <Input
                id="desc"
                value={novo.descricao}
                onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                placeholder="Ex: Tiradentes, Feriado municipal…"
              />
            </div>
            <Button type="submit">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </form>

          <div className="mt-4 space-y-1.5">
            {feriados.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-white/45">
                <CalendarPlus className="h-6 w-6 opacity-60" />
                Nenhum feriado cadastrado.
              </div>
            ) : (
              feriados.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <span className="font-semibold tabular-nums text-white">{fmtBR(f.data)}</span>
                    {f.descricao ? <span className="ml-2 text-sm text-white/55">{f.descricao}</span> : null}
                  </div>
                  <button
                    onClick={() => removeFeriado(f.id, fmtBR(f.data))}
                    title="Excluir"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 transition-transform duration-150 hover:scale-110 hover:bg-rose-500/25"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </PremiumStage>
  );
}
