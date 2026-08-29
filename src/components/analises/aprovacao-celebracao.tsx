"use client";

// TELA DE APROVAÇÃO — o consultor vira o notebook/celular para o cliente ver.
//
// Duas coisas guiam o desenho:
//
//  • É para o CLIENTE, não para o operador. Por isso ocupa a tela inteira, o
//    nome dele vem grande, e não há nada de sistema à vista (nem status
//    técnico, nem botão de administração).
//  • Tem que passar seriedade. A entrada inteira fecha em ~1,2s e para: nada
//    fica piscando depois. Movimento perpétuo na frente de um cliente que
//    acabou de fechar negócio parece brinquedo, não conquista.
//
// Só aparece em decisão APROVADA. "Não aprovar" e "deixar em análise" seguem
// o caminho de sempre, sem cerimônia nenhuma.

import { useEffect, useRef } from "react";
import { ArrowRight, Check } from "lucide-react";

const OURO = "#D4A72C";
const OURO_CLARO = "#F4D67B";
const VERDE = "#10B981";

/** Primeiro nome, em caixa alta — é o que vai grande na tela. */
function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p.toUpperCase();
}

/**
 * A linha de apoio muda com a frase escolhida pelo administrador.
 *
 * "LANCE APROVADO" não é a mesma notícia que "PROPOSTA APROVADA": uma fala do
 * cenário com lance, a outra da proposta inteira. Dizer a mesma coisa nos dois
 * casos entregaria um texto genérico logo no momento que mais importa.
 */
function apoioDe(mensagem: string): string {
  const m = mensagem.toUpperCase();
  if (m.includes("LANCE") && m.includes("INCLUSO")) {
    return "Sua proposta foi aprovada com o lance já incluído.";
  }
  if (m.includes("LANCE")) {
    return "Seu cenário foi aprovado com o lance informado.";
  }
  if (m.includes("CONCLUÍDA") || m.includes("CONCLUIDA")) {
    return "Sua proposta foi concluída com sucesso.";
  }
  return "Sua proposta foi aprovada com sucesso.";
}

const ETAPAS = ["Análise concluída", "Proposta aprovada", "Próxima etapa liberada"];

/**
 * Confetes discretos: poucos, dourados, e param sozinhos.
 *
 * A lista é calculada uma vez no módulo, não por render: são valores fixos
 * (nada de aleatório), então recalcular a cada render seria trabalho à toa —
 * e guardar em ref para ler no render é justamente o que o React 19 proíbe.
 */
const CONFETES = Array.from({ length: 22 }, (_, i) => ({
  esq: 4 + ((i * 37) % 92),
  atraso: (i % 7) * 0.18,
  duracao: 3.4 + (i % 5) * 0.5,
  largura: 4 + (i % 3) * 2,
  altura: 8 + (i % 4) * 3,
  cor: i % 5 === 0 ? VERDE : i % 2 === 0 ? OURO : OURO_CLARO,
  giro: (i % 2 === 0 ? 1 : -1) * (12 + (i % 5) * 9),
}));

function Confetes() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {CONFETES.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 rounded-[1px]"
          style={{
            left: `${p.esq}%`,
            width: p.largura,
            height: p.altura,
            background: p.cor,
            opacity: 0.85,
            transform: `rotate(${p.giro}deg)`,
            // 2 voltas só: o confete cai, termina, e a tela fica quieta.
            animation: `lb-confete ${p.duracao}s linear ${p.atraso}s 2 both`,
          }}
        />
      ))}
    </div>
  );
}

export function AprovacaoCelebracao({
  nomeCliente,
  mensagem,
  onContinuar,
}: {
  nomeCliente: string;
  mensagem: string;
  onContinuar: () => void;
}) {
  const botao = useRef<HTMLButtonElement | null>(null);

  // Esc fecha, e o foco vai para Continuar — quem estiver no teclado não fica
  // preso atrás de uma tela sem saída.
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
      aria-label="Proposta aprovada"
      className="lb-aprov-fundo fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-5 py-8"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 8%, rgba(16,185,129,0.20), transparent 60%)," +
          "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(212,167,44,0.16), transparent 62%)," +
          "linear-gradient(180deg, #0B1626 0%, #060A12 100%)",
      }}
    >
      <Confetes />

      {/* z-10: o confete nunca passa por cima do nome do cliente — é o que
          ele mais vai olhar, e legibilidade ganha do enfeite. */}
      <div className="relative z-10 w-full max-w-lg text-center">
        {/* selo */}
        <div className="relative mx-auto mb-6 h-24 w-24 sm:h-28 sm:w-28">
          <span
            aria-hidden
            className="lb-aprov-halo absolute inset-0 rounded-full"
            style={{ border: `2px solid ${VERDE}` }}
          />
          <span
            className="lb-aprov-selo absolute inset-0 grid place-items-center rounded-full"
            style={{
              background: "radial-gradient(circle at 30% 25%, rgba(16,185,129,0.35), rgba(6,10,18,0.9))",
              border: `2px solid ${VERDE}`,
              boxShadow: `0 0 46px -6px ${VERDE}, inset 0 1px 0 rgba(255,255,255,.12)`,
            }}
          >
            <svg viewBox="0 0 52 52" className="h-12 w-12 sm:h-14 sm:w-14" aria-hidden>
              <path
                className="lb-aprov-risco"
                d="M14 27.5 L22.5 36 L38 18"
                fill="none"
                stroke={VERDE}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>

        {/* nome do cliente */}
        <p
          className="lb-aprov-sobe text-sm font-semibold uppercase tracking-[0.28em]"
          style={{ color: OURO, animationDelay: "0.45s" }}
        >
          Parabéns,
        </p>
        <h2
          className="lb-aprov-sobe mt-1 font-bold leading-tight text-white"
          style={{
            fontSize: "clamp(1.9rem, 8vw, 3rem)",
            animationDelay: "0.55s",
            letterSpacing: "-0.02em",
            textWrap: "balance",
          }}
        >
          {primeiroNome(nomeCliente)}!
        </h2>

        {/* o resultado, na frase que o administrador escolheu */}
        <p
          className="lb-aprov-sobe mx-auto mt-4 max-w-md font-bold uppercase leading-tight"
          style={{
            fontSize: "clamp(1.15rem, 5vw, 1.6rem)",
            letterSpacing: "0.06em",
            // sem isso "PROPOSTA APROVADA COM LANCE / INCLUSO" deixa uma
            // palavra órfã na segunda linha — feio bem no meio da tela.
            textWrap: "balance",
            color: OURO_CLARO,
            textShadow: `0 0 26px rgba(212,167,44,0.5)`,
            animationDelay: "0.68s",
          }}
        >
          {mensagem}
        </p>
        <p
          className="lb-aprov-sobe mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/70 sm:text-base"
          style={{ animationDelay: "0.78s" }}
        >
          {apoioDe(mensagem)}
        </p>

        {/* etapas cumpridas */}
        <div
          className="lb-aprov-sobe mx-auto mt-7 w-full max-w-xs space-y-2.5 border-y py-5"
          style={{ borderColor: "rgba(255,255,255,0.12)", animationDelay: "0.9s" }}
        >
          {ETAPAS.map((e, i) => (
            <div
              key={e}
              className="lb-aprov-sobe flex items-center justify-center gap-2.5 text-sm text-white/85"
              style={{ animationDelay: `${1 + i * 0.12}s` }}
            >
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full"
                style={{ background: `${VERDE}26`, border: `1px solid ${VERDE}66` }}
              >
                <Check className="h-3 w-3" style={{ color: VERDE }} />
              </span>
              {e}
            </div>
          ))}
        </div>

        {/* próximo passo */}
        <p
          className="lb-aprov-sobe mt-6 text-[11px] font-bold uppercase tracking-[0.24em] text-white/45"
          style={{ animationDelay: "1.4s" }}
        >
          Próximo passo
        </p>
        <p
          className="lb-aprov-sobe mt-1.5 text-base font-semibold text-white sm:text-lg"
          style={{ animationDelay: "1.48s" }}
        >
          Ficha cadastral e geração do contrato
        </p>

        <button
          ref={botao}
          onClick={onContinuar}
          className="lb-aprov-sobe mt-8 inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl text-sm font-bold uppercase tracking-wider transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{
            background: `linear-gradient(135deg, ${OURO_CLARO}, ${OURO})`,
            color: "#1B1405",
            boxShadow: `0 14px 40px -14px ${OURO}`,
            animationDelay: "1.6s",
          }}
        >
          Continuar <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
