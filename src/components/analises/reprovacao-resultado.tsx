"use client";

// TELA DE RESULTADO NÃO APROVADO — vermelha.
//
// Mesma altura visual da tela verde: o consultor também vira esta para o
// cliente, e um resultado negativo apresentado de qualquer jeito parece
// descaso. O que muda é o tom, e é aí que está o cuidado:
//
//  • Vermelho como IDENTIDADE do estado, não como alarme: o × é firme, o brilho
//    é contido, e nada pisca. Vermelho gritando na cara de quem acabou de se
//    abrir com você fecha a porta para a próxima tentativa.
//  • Sem confete, sem comemoração, sem "erro do sistema". É um resultado.
//  • As frases são as que o administrador escolheu — esta tela só apresenta.

import { useEffect, useRef } from "react";
import { ArrowRight, Check, X } from "lucide-react";

const VERMELHO = "#EF4444";
const VERMELHO_CLARO = "#FCA5A5";

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

const ETAPAS: { texto: string; estado: string; ok: boolean }[] = [
  { texto: "Dados analisados", estado: "Concluído", ok: true },
  { texto: "Proposta avaliada", estado: "Concluído", ok: true },
  { texto: "Resultado", estado: "Não aprovado", ok: false },
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
      /* items-start + my-auto no filho: centraliza quando sobra espaço e,
         quando o conteúdo é mais alto que a tela, NÃO corta o topo.
         Com items-center o começo fica acima do scroll e some. */
      className="lb-aprov-fundo fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-5 py-8"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 8%, rgba(239,68,68,0.18), transparent 62%)," +
          "linear-gradient(180deg, #1A0E12 0%, #070609 100%)",
      }}
    >
      <div className="relative z-10 my-auto w-full max-w-lg text-center">
        {/* etiqueta de estado */}
        <span
          className="lb-aprov-sobe mb-7 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ borderColor: `${VERMELHO}55`, background: `${VERMELHO}14`, color: VERMELHO_CLARO }}
        >
          <X className="h-3.5 w-3.5" /> Análise concluída
        </span>

        {/* selo */}
        <div className="relative mx-auto mb-7 h-24 w-24 sm:h-28 sm:w-28">
          <span
            aria-hidden
            className="lb-aprov-halo absolute inset-0 rounded-full"
            style={{ border: `2px solid ${VERMELHO}` }}
          />
          <span
            className="lb-aprov-selo absolute inset-0 grid place-items-center rounded-full"
            style={{
              background: "radial-gradient(circle at 30% 25%, rgba(239,68,68,0.32), rgba(9,6,8,0.92))",
              border: `2px solid ${VERMELHO}`,
              boxShadow: `0 0 46px -6px ${VERMELHO}, inset 0 1px 0 rgba(255,255,255,.10)`,
            }}
          >
            {/* o × é DESENHADO, como o check da tela verde: o gesto dá o peso */}
            <svg viewBox="0 0 52 52" className="h-12 w-12 sm:h-14 sm:w-14" aria-hidden>
              <path
                className="lb-aprov-risco"
                d="M17 17 L35 35"
                fill="none" stroke={VERMELHO} strokeWidth="4.5" strokeLinecap="round"
              />
              <path
                className="lb-aprov-risco2"
                d="M35 17 L17 35"
                fill="none" stroke={VERMELHO} strokeWidth="4.5" strokeLinecap="round"
              />
            </svg>
          </span>
        </div>

        <h2
          className="lb-aprov-sobe font-bold leading-tight text-white"
          style={{
            fontSize: "clamp(1.5rem, 6.5vw, 2.25rem)",
            animationDelay: "0.42s",
            letterSpacing: "-0.01em",
            textWrap: "balance",
          }}
        >
          {primeiroNome(nomeCliente)}
        </h2>

        <p
          className="lb-aprov-sobe mx-auto mt-4 max-w-md font-bold uppercase leading-tight"
          style={{
            fontSize: "clamp(1.1rem, 4.8vw, 1.55rem)",
            letterSpacing: "0.05em",
            textWrap: "balance",
            color: VERMELHO_CLARO,
            textShadow: "0 0 26px rgba(239,68,68,0.45)",
            animationDelay: "0.55s",
          }}
        >
          {mensagem}
        </p>
        <p
          className="lb-aprov-sobe mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/65 sm:text-base"
          style={{ animationDelay: "0.66s" }}
        >
          {apoioDe(mensagem)}
        </p>

        {/* etapas da análise */}
        <div
          className="lb-aprov-sobe mx-auto mt-7 w-full max-w-xs space-y-2 rounded-xl border px-4 py-4"
          style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", animationDelay: "0.78s" }}
        >
          {ETAPAS.map((e, i) => (
            <div
              key={e.texto}
              className="lb-aprov-sobe flex items-center gap-3 text-left"
              style={{ animationDelay: `${0.88 + i * 0.12}s` }}
            >
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                style={{ background: `${VERMELHO}1f`, border: `1px solid ${VERMELHO}66` }}
              >
                {e.ok ? (
                  <Check className="h-3.5 w-3.5" style={{ color: VERMELHO_CLARO }} />
                ) : (
                  <X className="h-3.5 w-3.5" style={{ color: VERMELHO }} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight text-white/90">{e.texto}</span>
                <span className="block text-[11px] leading-tight" style={{ color: VERMELHO_CLARO }}>
                  {e.estado}
                </span>
              </span>
            </div>
          ))}
        </div>

        <button
          ref={botao}
          onClick={onContinuar}
          className="lb-aprov-sobe mt-8 inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl text-sm font-bold uppercase tracking-wider transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{
            background: `linear-gradient(135deg, ${VERMELHO}, #B91C1C)`,
            color: "#fff",
            boxShadow: `0 14px 40px -14px ${VERMELHO}`,
            animationDelay: "1.3s",
          }}
        >
          Continuar <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
