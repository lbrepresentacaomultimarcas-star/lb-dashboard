"use client";

// TELA "EM ANÁLISE" — expectativa, e depois a revelação.
//
// Duas fases:
//   CONTANDO  → contador regressivo real + processamento discreto
//   PRONTO    → "análise finalizada" e o botão CONFERIR RESULTADO
//
// O contador NÃO é contado, é CALCULADO: a cada tique ele mede a distância até
// o instante de término que está no banco. Por isso recarregar a página, fechar
// a aba ou abrir no celular não muda nada — todos leem o mesmo horário de fim.
// Um setTimeout no navegador reiniciaria a cada F5.
//
// A pausa entre zerar e revelar é de propósito: é o momento em que o consultor
// chama o cliente e diz "vamos conferir juntos".

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, ScanSearch, X } from "lucide-react";

const AZUL = "#3E74AD";
const AZUL_CLARO = "#7FB2E5";
const OURO_CLARO = "#F4D67B";

/** Milissegundos que faltam até o término. Nunca negativo. */
function faltamMs(fimIso: string): number {
  return Math.max(0, new Date(fimIso).getTime() - new Date().getTime());
}

export function relogio(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function AnaliseAndamento({
  nomeCliente,
  fimIso,
  minutos,
  onConferir,
  onFechar,
  conferindo,
}: {
  nomeCliente: string;
  fimIso: string;
  minutos?: number;
  onConferir: () => void;
  /** Fecha a tela sem revelar — a análise continua correndo no banco. */
  onFechar: () => void;
  conferindo: boolean;
}) {
  /*
   * O primeiro valor NÃO pode vir do relógio.
   *
   * O React renderiza este componente no servidor e de novo no navegador; se o
   * valor inicial fosse "quanto falta agora", os dois mediriam instantes
   * diferentes e a hidratação acusaria divergência. Começa no tempo cheio —
   * que é igual dos dois lados — e o primeiro tique, já no navegador, corrige
   * em milissegundos.
   */
  const [restante, setRestante] = useState((minutos ?? 10) * 60_000);
  const botao = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const tique = () => setRestante(faltamMs(fimIso));
    // fora do corpo do efeito: o React 19 proíbe mexer em estado direto ali
    const agora = setTimeout(tique, 0);
    const id = setInterval(tique, 500);
    return () => {
      clearTimeout(agora);
      clearInterval(id);
    };
  }, [fimIso]);

  const pronto = restante <= 0;
  const totalMs = (minutos ?? 10) * 60_000;
  const andado = Math.min(1, Math.max(0, 1 - restante / totalMs));

  useEffect(() => {
    if (pronto) botao.current?.focus();
  }, [pronto]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={pronto ? "Análise finalizada" : "Análise em andamento"}
      className="lb-aprov-fundo fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-5 py-8"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 10%, rgba(62,116,173,0.22), transparent 62%)," +
          "linear-gradient(180deg, #0B1626 0%, #060A12 100%)",
      }}
    >
      {/* fechar sem revelar — a análise segue correndo no banco */}
      <button
        onClick={onFechar}
        aria-label="Fechar"
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative z-10 w-full max-w-lg text-center">
        {/* anel de processamento */}
        <div className="relative mx-auto mb-7 h-28 w-28 sm:h-32 sm:w-32">
          {!pronto && (
            <svg viewBox="0 0 100 100" className="lb-anal-anel absolute inset-0 h-full w-full" aria-hidden>
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="3" />
              <circle
                cx="50" cy="50" r="46" fill="none"
                stroke={AZUL_CLARO} strokeWidth="3" strokeLinecap="round"
                strokeDasharray="70 220"
              />
            </svg>
          )}
          {/* progresso real do tempo — este não gira, ele preenche */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
            <circle
              cx="50" cy="50" r="40" fill="none"
              stroke={pronto ? OURO_CLARO : AZUL}
              strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${andado * 251.3} 251.3`}
              style={{ transition: "stroke-dasharray 0.5s linear" }}
              opacity={0.85}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center">
            {/* o número grande fica embaixo, uma vez só — repetir o relógio
                dentro do anel e logo abaixo dele só divide a atenção */}
            <ScanSearch
              className={pronto ? "h-11 w-11" : "h-10 w-10"}
              style={{ color: pronto ? OURO_CLARO : AZUL_CLARO, opacity: pronto ? 1 : 0.85 }}
            />
          </span>
        </div>

        {pronto ? (
          <>
            <h2
              className="lb-aprov-sobe font-bold uppercase leading-tight text-white"
              style={{ fontSize: "clamp(1.5rem, 6.5vw, 2.2rem)", letterSpacing: "0.02em", textWrap: "balance" }}
            >
              Análise finalizada
            </h2>
            <p
              className="lb-aprov-sobe mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/70 sm:text-base"
              style={{ animationDelay: "0.12s" }}
            >
              O resultado da análise de <span className="font-semibold text-white">{nomeCliente}</span> está pronto.
            </p>
            <button
              ref={botao}
              onClick={onConferir}
              disabled={conferindo}
              className="lb-aprov-sobe mt-9 inline-flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-xl text-base font-bold uppercase tracking-wider transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-70"
              style={{
                background: `linear-gradient(135deg, ${OURO_CLARO}, #D4A72C)`,
                color: "#1B1405",
                boxShadow: "0 16px 44px -14px #D4A72C",
                animationDelay: "0.24s",
              }}
            >
              {conferindo ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Conferir resultado <ArrowRight className="h-5 w-5" />
            </button>
          </>
        ) : (
          <>
            <p
              className="lb-aprov-sobe text-xs font-bold uppercase tracking-[0.28em]"
              style={{ color: AZUL_CLARO, animationDelay: "0.1s" }}
            >
              Aguardando resultado
            </p>
            <h2
              className="lb-aprov-sobe mt-2 font-bold leading-tight text-white"
              style={{ fontSize: "clamp(1.5rem, 6.5vw, 2.2rem)", textWrap: "balance", animationDelay: "0.18s" }}
            >
              {nomeCliente}
            </h2>
            <p
              className="lb-aprov-sobe mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/70 sm:text-base"
              style={{ animationDelay: "0.28s" }}
            >
              Sua proposta está passando por uma análise.
            </p>

            <div
              className="lb-aprov-sobe mx-auto mt-7 flex w-full max-w-xs flex-col items-center gap-3 border-y py-5"
              style={{ borderColor: "rgba(255,255,255,0.12)", animationDelay: "0.38s" }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white/85">
                Análise em andamento
                <span className="flex gap-1" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="lb-anal-ponto h-1.5 w-1.5 rounded-full"
                      style={{ background: AZUL_CLARO, animationDelay: `${i * 0.18}s` }}
                    />
                  ))}
                </span>
              </span>
              <span className="text-xs text-white/50">Aguarde a conclusão do processo.</span>
            </div>

            <p
              className="lb-aprov-sobe mt-6 text-[11px] font-bold uppercase tracking-[0.24em] text-white/45"
              style={{ animationDelay: "0.5s" }}
            >
              Tempo restante
            </p>
            <p
              className="lb-aprov-sobe mt-1 font-bold tabular-nums text-white"
              style={{ fontSize: "clamp(2rem, 9vw, 3rem)", animationDelay: "0.56s" }}
            >
              {relogio(restante)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
