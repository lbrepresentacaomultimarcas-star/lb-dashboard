"use client";

// Painel de COMUNICAÇÃO da peça (módulo Resultados LB).
//
// Separa de propósito duas coisas que não se misturam:
//   • os NÚMEROS — valor, tipo, quantidade — vêm do resultado oficial da
//     administradora e nada aqui os altera;
//   • as PALAVRAS — quem assina e com que frase — são escolha do administrador.
//
// Nenhum campo é obrigatório: com tudo vazio a arte sai exatamente como saía
// antes deste painel existir.

import { useMemo, useState } from "react";
import { Building2, Check, Plus, Sparkles, Trash2, User } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import {
  MODELOS_COMUNICACAO,
  SELOS_PRONTOS,
  aplicarModelo,
  type ModeloComunicacao,
  type ModoAssinatura,
} from "@/lib/materiais";

export const EMPRESA_LB = "LB Representações";

/** O que a tela guarda. Vira `Comunicacao` na hora de desenhar. */
export type KitComunicacao = {
  modo: ModoAssinatura;
  consultor: string;
  selo: string;
  chamada: string;
  destaque: string;
  assinatura: string;
  /** Modelo aplicado, se ainda não houve edição manual. */
  modeloId: string | null;
};

export const KIT_VAZIO: KitComunicacao = {
  modo: "empresa",
  consultor: "",
  selo: "",
  chamada: "",
  destaque: "",
  assinatura: "",
  modeloId: null,
};

export function kitEstaVazio(k: KitComunicacao): boolean {
  return !k.selo.trim() && !k.chamada.trim() && !k.destaque.trim() && !k.assinatura.trim();
}

const MODOS: { id: ModoAssinatura; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "empresa", label: "Empresa", desc: "Resultado da LB", icon: Building2 },
  { id: "consultor", label: "Consultor", desc: "Nome em evidência", icon: User },
  { id: "personalizado", label: "Personalizado", desc: "Sua própria frase", icon: Sparkles },
];

function Campo({
  rotulo,
  valor,
  onChange,
  placeholder,
  linhas,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
  linhas?: number;
}) {
  return (
    <div>
      <Label>{rotulo}</Label>
      {linhas ? (
        <textarea
          rows={linhas}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm leading-snug text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40"
        />
      ) : (
        <Input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

export function AssinaturaComercial({
  kit,
  onChange,
  consultores,
  proprios,
  onSalvarFrase,
  onApagarFrase,
}: {
  kit: KitComunicacao;
  onChange: (k: KitComunicacao) => void;
  consultores: string[];
  proprios: ModeloComunicacao[];
  onSalvarFrase: (nome: string) => void;
  onApagarFrase: (id: string) => void;
}) {
  const [nomeNovo, setNomeNovo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const modelos = useMemo(() => {
    const todos = [...proprios, ...MODELOS_COMUNICACAO];
    // No modo personalizado ele parte de qualquer frase; nos outros, só as que
    // fazem sentido para quem vai assinar a peça.
    return kit.modo === "personalizado" ? todos : todos.filter((m) => m.modo === kit.modo);
  }, [kit.modo, proprios]);

  /** Preenche os campos com um modelo. Enquanto ele não editar à mão, trocar de
   *  consultor reescreve o nome sozinho. */
  function aplicar(m: ModeloComunicacao) {
    const c = aplicarModelo(m, { consultor: kit.consultor, empresa: EMPRESA_LB });
    onChange({
      ...kit,
      modo: m.modo,
      selo: c.selo ?? "",
      chamada: c.chamada ?? "",
      destaque: c.destaque ?? "",
      assinatura: c.assinatura ?? "",
      modeloId: m.id,
    });
  }

  /** Edição manual solta o vínculo com o modelo — a partir daí o texto é dele
   *  e o sistema não sobrescreve mais nada. */
  const editar = (campo: "selo" | "chamada" | "destaque" | "assinatura") => (v: string) =>
    onChange({ ...kit, [campo]: v, modeloId: null });

  function trocarConsultor(nome: string) {
    const base = { ...kit, consultor: nome };
    const m = kit.modeloId ? [...proprios, ...MODELOS_COMUNICACAO].find((x) => x.id === kit.modeloId) : null;
    if (!m) return onChange(base);
    const c = aplicarModelo(m, { consultor: nome, empresa: EMPRESA_LB });
    onChange({
      ...base,
      selo: c.selo ?? "",
      chamada: c.chamada ?? "",
      destaque: c.destaque ?? "",
      assinatura: c.assinatura ?? "",
    });
  }

  function trocarModo(modo: ModoAssinatura) {
    onChange({ ...kit, modo });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--color-text)]">Como apresentar este resultado</h3>
        {!kitEstaVazio(kit) && (
          <button
            onClick={() => onChange({ ...KIT_VAZIO, consultor: kit.consultor, modo: kit.modo })}
            className="text-[11px] font-semibold text-[var(--color-text-dim)] underline-offset-2 hover:underline"
          >
            limpar
          </button>
        )}
      </div>

      {/* quem assina */}
      <div className="grid grid-cols-3 gap-2">
        {MODOS.map((m) => {
          const Icon = m.icon;
          const ativo = kit.modo === m.id;
          return (
            <button
              key={m.id}
              onClick={() => trocarModo(m.id)}
              className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                ativo
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10"
                  : "border-[var(--color-border)] hover:border-[var(--color-brand)]/50"
              }`}
            >
              <Icon className={`h-4 w-4 ${ativo ? "text-[var(--color-brand)]" : "text-[var(--color-text-dim)]"}`} />
              <span className="text-xs font-bold text-[var(--color-text)]">{m.label}</span>
              <span className="text-[10px] leading-tight text-[var(--color-text-dim)]">{m.desc}</span>
            </button>
          );
        })}
      </div>

      {/* consultor */}
      {kit.modo !== "empresa" && (
        <div>
          <Label>Consultor em evidência</Label>
          <div className="flex flex-wrap gap-1.5">
            {consultores.map((nome) => (
              <button
                key={nome}
                onClick={() => trocarConsultor(nome === kit.consultor ? "" : nome)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  kit.consultor === nome
                    ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                    : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                }`}
              >
                {nome}
              </button>
            ))}
            {!consultores.length && (
              <span className="text-[11px] text-[var(--color-text-dim)]">Nenhum consultor ativo cadastrado.</span>
            )}
          </div>
        </div>
      )}

      {/* frases prontas */}
      <div>
        <Label>Frase pronta (opcional — dá para editar depois)</Label>
        <div className="flex flex-wrap gap-1.5">
          {modelos.map((m) => {
            const meu = m.id.startsWith("meu:");
            return (
              <span key={m.id} className="inline-flex items-center">
                <button
                  onClick={() => aplicar(m)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    kit.modeloId === m.id
                      ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                      : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                  } ${meu ? "rounded-r-none" : ""}`}
                  title={m.grupo}
                >
                  {m.nome}
                </button>
                {meu && (
                  <button
                    onClick={() => onApagarFrase(m.id)}
                    aria-label={`Apagar a frase ${m.nome}`}
                    className="rounded-lg rounded-l-none border border-l-0 border-[var(--color-border)] px-1.5 py-1 text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* selos */}
      <div>
        <Label>Selo do topo</Label>
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {SELOS_PRONTOS.map((s) => (
            <button
              key={s}
              onClick={() => editar("selo")(s === kit.selo ? "" : s)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                kit.selo === s
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <Input
          value={kit.selo}
          onChange={(e) => editar("selo")(e.target.value)}
          placeholder="Ou escreva o seu — sai em caixa alta na faixa dourada"
        />
      </div>

      <Campo
        rotulo="Frase"
        valor={kit.chamada}
        onChange={editar("chamada")}
        placeholder="Ex.: Resultado conquistado com o acompanhamento de"
        linhas={2}
      />
      <Campo
        rotulo="Linha em destaque (fica dourada e grande)"
        valor={kit.destaque}
        onChange={editar("destaque")}
        placeholder="Ex.: LEONARDO BARBOSA"
      />
      <Campo
        rotulo="Assinatura do rodapé"
        valor={kit.assinatura}
        onChange={editar("assinatura")}
        placeholder={`Ex.: Leonardo Barbosa · ${EMPRESA_LB}`}
      />

      {/* guardar como frase própria */}
      {!kitEstaVazio(kit) &&
        (salvando ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              placeholder="Nome dessa frase (só para você achar depois)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && nomeNovo.trim()) {
                  onSalvarFrase(nomeNovo.trim());
                  setNomeNovo("");
                  setSalvando(false);
                }
              }}
            />
            <button
              disabled={!nomeNovo.trim()}
              onClick={() => {
                onSalvarFrase(nomeNovo.trim());
                setNomeNovo("");
                setSalvando(false);
              }}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-brand)] px-3 text-xs font-bold text-[var(--color-brand)] disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" /> Guardar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSalvando(true)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)]"
          >
            <Plus className="h-3.5 w-3.5" /> Guardar esta frase para reusar
          </button>
        ))}
    </div>
  );
}
