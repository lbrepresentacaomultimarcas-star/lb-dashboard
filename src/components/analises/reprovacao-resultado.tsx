"use client";

// TELA DE RESULTADO NÃO APROVADO.
//
// Mesma estrutura da tela de aprovação — o consultor também vira esta para o
// cliente. O que muda é o tom, e é onde está o trabalho:
//
//  • Sem confete, sem dourado, sem brilho de conquista.
//  • Sem vermelho gritante: "recusado" em vermelho na cara de quem acabou de
//    se abrir com você fecha a porta para a próxima tentativa. A cor é aço,
//    e o × aparece uma vez, discreto.
//  • O texto diz "NESTA ANÁLISE" sempre que a frase escolhida permitir —
//    resultado de hoje não é sentença definitiva.
//
// Não é tela de erro do sistema. É um resultado profissional.

import { useEffect, useRef } from "react";
import { ArrowRight, Check, FileSearch, X } from "lucide-react";

const ACO = "#94A3B8";
const ACO_CLARO = "#CBD5E1";
const ATENCAO = "#E0A458";

function primeiroNome(nome: string): string {
  return (nome.trim().split(/\s+/)[0] ?? "").toUpperCase();
}

/** Linha de apoio conforme a frase escolhida pelo administrador. */
function apoioDe(mensagem: string): string {
  const m = mensagem.toUpperCase();
  if (m.includes("NÃO FOI POSSÍVEL")) {
    return "A análise foi concluída e, neste momento, não foi possível aprovar a proposta.";
  }
  if (m.includes("NESTA ANÁLISE")) {
    return "A proposta foi avaliada e não foi aprovada nesta análise.";
  }
  return "A análise desta proposta foi concluída e, neste momento, não foi aprovada para prosseguimento.";
}

const ETAPAS: { texto: string; ok: boolean }[] = [
  { texto: "Dados analisados", ok: true },
  { texto: "Proposta avaliada", ok: true },
  { texto: "Resultado não aprovado", ok: false },
];

export function ReprovacaoResultado({
  nomeCliente,
  mensagem,
  onContinuar,
}: {
  nomeCliente: string;
  mensagem: string;
  onContinuar: () => void;
}) {
  const botao = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    botao.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onContinuar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onContinuar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resultado da análise"
      className="lb-aprov-fundo fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-5 py-8"
      style={{
        background:
          "radial-gradient(ellipse 78% 58% at 50% 10%, rgba(148,163,184,0.16), transparent 62%)," +
          "linear-gradient(180deg, #101722 0%, #06090F 100%)",
      }}
    >
      <div className="relative z-10 w-full max-w-lg text-center">
        {/* selo sóbrio */}
        <div className="relative mx-auto mb-6 h-24 w-24 sm:h-28 sm:w-28">
          <span
            className="lb-aprov-selo absolute inset-0 grid place-items-center rounded-full"
            style={{
              background: "radial-gradient(circle at 30% 25%, rgba(148,163,184,0.22), rgba(6,9,15,0.92))",
              border: `2px solid ${ACO}66`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
            }}
          >
            <FileSearch className="h-10 w-10 sm:h-11 sm:w-11" style={{ color: ACO_CLARO }} />
          </span>
        </div>

        <h2
          className="lb-aprov-sobe font-bold leading-tight text-white"
          style={{
            fontSize: "clamp(1.5rem, 6.5vw, 2.25rem)",
            animationDelay: "0.2s",
            letterSpacing: "-0.01em",
            textWrap: "balance",
          }}
        >
          {primeiroNome(nomeCliente)}
        </h2>

        <p
          className="lb-aprov-sobe mx-auto mt-4 max-w-md font-bold uppercase leading-tight"
          style={{
            fontSize: "clamp(1.05rem, 4.6vw, 1.45rem)",
            letterSpacing: "0.06em",
            textWrap: "balance",
            color: ACO_CLARO,
            animationDelay: "0.32s",
          }}
        >
          {mensagem}
        </p>
        <p
          className="lb-aprov-sobe mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/65 sm:text-base"
          style={{ animationDelay: "0.42s" }}
        >
          {apoioDe(mensagem)}
        </p>

        <div
          className="lb-aprov-sobe mx-auto mt-7 w-full max-w-xs space-y-2.5 border-y py-5"
          style={{ borderColor: "rgba(255,255,255,0.1)", animationDelay: "0.54s" }}
        >
          {ETAPAS.map((e, i) => (
            <div
              key={e.texto}
              className="lb-aprov-sobe flex items-center justify-center gap-2.5 text-sm"
              style={{ animationDelay: `${0.64 + i * 0.12}s`, color: e.ok ? "rgba(255,255,255,.8)" : ACO_CLARO }}
            >
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full"
                style={
                  e.ok
                    ? { background: "rgba(148,163,184,0.16)", border: `1px solid ${ACO}55` }
                    : { background: "rgba(224,164,88,0.14)", border: `1px solid ${ATENCAO}66` }
                }
              >
                {e.ok ? (
                  <Check className="h-3 w-3" style={{ color: ACO_CLARO }} />
                ) : (
                  <X className="h-3 w-3" style={{ color: ATENCAO }} />
                )}
              </span>
              {e.texto}
            </div>
          ))}
        </div>

        <button
          ref={botao}
          onClick={onContinuar}
          className="lb-aprov-sobe mt-8 inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl border text-sm font-bold uppercase tracking-wider transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{
            borderColor: "rgba(255,255,255,0.25)",
            color: "#fff",
            animationDelay: "1.05s",
          }}
        >
          Continuar <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
