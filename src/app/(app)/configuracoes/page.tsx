"use client";

import { useRef, useState } from "react";
import { ImagePlus, LayoutDashboard, RefreshCw, Trash2, Upload } from "lucide-react";
import { readFileAsDataUrl, settings, useBoolSetting, useImageSetting, type ImageSettingKey } from "@/lib/settings";
import { setAutoRefresh, useAutoRefresh } from "@/lib/refresh";
import { dashboardConfigApi, useDashboardConfig } from "@/lib/store";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type Slot = {
  key: ImageSettingKey;
  titulo: string;
  descricao: string;
  altura: number;
  dim: string;
};

const SLOTS: Slot[] = [
  {
    key: "logo_principal",
    titulo: "Logo principal (LB Representações)",
    descricao:
      "Sua marca — aparece no canto ESQUERDO da faixa do topo (todas as telas), na sidebar, no login e nas artes. Recomendado: PNG/JPG quadrado ~512×512.",
    altura: 96,
    dim: "512×512px",
  },
  {
    key: "logo_parceira",
    titulo: "Logo parceira (Multimarcas)",
    descricao:
      "Aparece no canto DIREITO da faixa do topo e nas artes, ao lado da LB. Controle a exibição na chave acima. Recomendado: PNG/JPG horizontal, fundo claro.",
    altura: 80,
    dim: "horizontal",
  },
  {
    key: "logo_ranking",
    titulo: "Logo do ranking",
    descricao: "Aparece no painel lateral do /ranking. Recomendado: 450×100px horizontal.",
    altura: 80,
    dim: "450×100px",
  },
  {
    key: "imagem_meta_1",
    titulo: "Imagem ao bater meta 1",
    descricao: "Card exibido quando o vendedor atinge a meta principal. Recomendado: 350×90px.",
    altura: 100,
    dim: "350×90px",
  },
  {
    key: "imagem_meta_2",
    titulo: "Imagem ao bater meta 2",
    descricao: "Card exibido quando o vendedor supera a meta (110%+). Recomendado: 350×90px.",
    altura: 100,
    dim: "350×90px",
  },
];

function SlotCard({ slot }: { slot: Slot }) {
  const atual = useImageSetting(slot.key);
  const inputRef = useRef<HTMLInputElement>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      notify.error("Arquivo muito grande", "Máximo 2 MB pra evitar problemas no navegador.");
      return;
    }
    setCarregando(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      settings.set(slot.key, dataUrl);
      notify.success(`${slot.titulo} salva`);
    } catch (e) {
      notify.error("Erro ao ler arquivo", e instanceof Error ? e.message : undefined);
    } finally {
      setCarregando(false);
    }
  }

  function remover() {
    if (!confirm(`Remover ${slot.titulo}?`)) return;
    settings.set(slot.key, null);
    notify.success("Removida — usando o padrão");
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>{slot.titulo}</CardTitle>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">{slot.descricao}</p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          {slot.dim}
        </span>
      </div>

      <div
        className="mt-4 flex items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"
        style={{ minHeight: slot.altura + 32 }}
      >
        {atual ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={atual}
            alt={slot.titulo}
            style={{ maxHeight: slot.altura }}
            className="rounded object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[var(--color-text-dim)]">
            <ImagePlus className="h-6 w-6" />
            <span className="text-xs">Nenhuma imagem definida — usando o padrão</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={carregando}
        >
          <Upload className="h-3.5 w-3.5" />
          {atual ? "Trocar" : "Enviar imagem"}
        </Button>
        {atual && (
          <Button variant="ghost" size="sm" onClick={remover}>
            <Trash2 className="h-3.5 w-3.5" />
            Remover
          </Button>
        )}
      </div>
    </Card>
  );
}

function AutoRefreshCard() {
  const enabled = useAutoRefresh();
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--color-brand)]/10 text-[var(--color-brand)]">
            <RefreshCw className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>Atualização automática</CardTitle>
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">
              Quando ligado, o CRM recarrega os dados a cada 60 segundos em segundo plano.
              Você ainda pode usar o botão de atualizar no topo a qualquer momento.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => {
            const novo = !enabled;
            setAutoRefresh(novo);
            notify.success(
              novo ? "Atualização automática ligada" : "Atualização automática desligada",
              novo ? "Dados serão atualizados a cada 60s." : undefined,
            );
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            enabled ? "bg-[var(--color-brand)]" : "bg-[var(--color-surface-2)] border border-[var(--color-border)]"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </Card>
  );
}

function PainelDashboardCard() {
  const cfg = useDashboardConfig();
  const [snapshot, setSnapshot] = useState(cfg);
  const [lembrete, setLembrete] = useState(cfg.lembrete);
  const [ligacoes, setLigacoes] = useState(String(cfg.metaLigacoes));
  const [reunioes, setReunioes] = useState(String(cfg.metaReunioes));
  const [vendas, setVendas] = useState(String(cfg.metaVendas));
  const [salvando, setSalvando] = useState(false);

  // Config mudou (chegou do banco / realtime) → ressincroniza o formulário.
  // Padrão recomendado: ajustar estado DURANTE o render, guardado por igualdade
  // (em vez de setState dentro de useEffect).
  if (snapshot !== cfg) {
    setSnapshot(cfg);
    setLembrete(cfg.lembrete);
    setLigacoes(String(cfg.metaLigacoes));
    setReunioes(String(cfg.metaReunioes));
    setVendas(String(cfg.metaVendas));
  }

  async function salvar() {
    setSalvando(true);
    try {
      await dashboardConfigApi.save({
        lembrete: lembrete.trim(),
        metaLigacoes: Math.max(0, parseInt(ligacoes, 10) || 0),
        metaReunioes: Math.max(0, parseInt(reunioes, 10) || 0),
        metaVendas: Math.max(0, parseInt(vendas, 10) || 0),
      });
      notify.success("Painel do Dashboard salvo", "Aparece para todos os usuários.");
    } catch (e) {
      notify.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  const inputNum =
    "h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40";

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-brand)]/10 text-[var(--color-brand)]">
          <LayoutDashboard className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle>Painel do Dashboard</CardTitle>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            Define o Lembrete do Dia e a Meta do Dia exibidos no topo do Dashboard para todos os usuários.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <Label>📌 Lembrete do Dia</Label>
              <textarea
                value={lembrete}
                onChange={(e) => setLembrete(e.target.value)}
                rows={2}
                placeholder="Ex.: Nenhum cliente deve ficar sem retorno hoje. (vazio = frase automática do dia)"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40"
              />
            </div>
            <div>
              <Label>🎯 Meta do Dia</Label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="mb-1 block text-[11px] text-[var(--color-text-dim)]">Ligações</span>
                  <input type="number" min={0} value={ligacoes} onChange={(e) => setLigacoes(e.target.value)} className={inputNum} />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-[var(--color-text-dim)]">Reuniões</span>
                  <input type="number" min={0} value={reunioes} onChange={(e) => setReunioes(e.target.value)} className={inputNum} />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-[var(--color-text-dim)]">Vendas</span>
                  <input type="number" min={0} value={vendas} onChange={(e) => setVendas(e.target.value)} className={inputNum} />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar painel"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ExibirParceiraCard() {
  const enabled = useBoolSetting("exibir_logo_parceira", true);
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--color-brand)]/10 text-[var(--color-brand)]">
            <ImagePlus className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>Exibir logo parceira</CardTitle>
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">
              Ligado: a logo da Multimarcas aparece no canto direito (topo das telas e nas artes), ao lado da LB.
              Desligado: aparece somente a LB Representações.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => {
            const novo = !enabled;
            settings.setBool("exibir_logo_parceira", novo);
            notify.success(novo ? "Logo parceira ativada" : "Logo parceira desativada");
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            enabled ? "bg-[var(--color-brand)]" : "bg-[var(--color-surface-2)] border border-[var(--color-border)]"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </Card>
  );
}

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-[var(--color-text-dim)]">
          Personalize a aparência do sistema — todas as imagens ficam salvas neste navegador.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Dados em tempo real
        </h2>
        <AutoRefreshCard />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Painel do Dashboard
        </h2>
        <PainelDashboardCard />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Marca e co-branding
        </h2>
        <ExibirParceiraCard />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Logos e artes do sistema
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {SLOTS.map((s) => (
            <SlotCard key={s.key} slot={s} />
          ))}
        </div>
      </section>

      <Card className="bg-[var(--color-surface-2)]/50">
        <p className="text-xs text-[var(--color-text-dim)]">
          <strong>Dica:</strong> Para que todos os usuários da empresa vejam as mesmas imagens,
          eu posso evoluir isso pra <em>Supabase Storage</em> — assim as artes ficam no servidor
          e sincronizam entre todos. Por enquanto, cada navegador tem sua cópia local.
        </p>
      </Card>
    </div>
  );
}
