"use client";

// TELA "EM ANÁLISE" — dourada. Expectativa, e depois a revelação.
//
// Duas fases:
//   CONTANDO  → contador regressivo real + as etapas do processo acendendo
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
import { ArrowRight, Hourglass, Loader2, ScanSearch, X } from "lucide-react";

const OURO = "#D4A72C";
const OURO_CLARO = "#F4D67B";
const AMBAR = "#F59E0B";

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

/**
 * As três etapas do processo.
 *
 * Elas acendem conforme o tempo anda — não porque o sistema esteja realmente
 * lendo documento nenhum, mas porque a espera precisa ter forma. É o mesmo
 * papel da barra de progresso: dizer "está andando", não inventar dado.
 */
const PASSOS = ["Analisando documentos", "Verificando dados", "Avaliando critérios"];

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
  const passoAtual = Math.min(PASSOS.length - 1, Math.floor(andado * PASSOS.length));

  useEffect(() => {
    if (pronto) botao.current?.focus();
  }, [pronto]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={pronto ? "Análise finalizada" : "Análise em andamento"}
      /* items-start + my-auto no filho: centraliza quando sobra espaço e,
         quando o conteúdo é mais alto que a tela, NÃO corta o topo.
         Com items-center o começo fica acima do scroll e some. */
      className="lb-aprov-fundo fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-5 py-8"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 8%, rgba(212,167,44,0.20), transparent 62%)," +
          "linear-gradient(180deg, #1A1408 0%, #08070A 100%)",
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

      <div className="relative z-10 my-auto w-full max-w-lg text-center">
        {/* etiqueta de estado */}
        <span
          className="lb-aprov-sobe mb-7 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ borderColor: `${OURO}55`, background: `${OURO}14`, color: OURO_CLARO }}
        >
          <Hourglass className="h-3.5 w-3.5" />
          {pronto ? "Análise finalizada" : "Análise em andamento"}
        </span>

        {/* anel */}
        <div className="relative mx-auto mb-7 h-28 w-28 sm:h-32 sm:w-32">
          {!pronto && (
            <svg viewBox="0 0 100 100" className="lb-anal-anel absolute inset-0 h-full w-full" aria-hidden>
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="3" />
              <circle
                cx="50" cy="50" r="46" fill="none"
                stroke={AMBAR} strokeWidth="3" strokeLinecap="round"
                strokeDasharray="70 220"
              />
            </svg>
          )}
          {/* progresso real do tempo — este não gira, ele preenche */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
            <circle
              cx="50" cy="50" r="40" fill="none"
              stroke={OURO_CLARO}
              strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${andado * 251.3} 251.3`}
              style={{ transition: "stroke-dasharray 0.5s linear" }}
              opacity={0.9}
            />
          </svg>
          <span
            className="absolute inset-4 grid place-items-center rounded-full"
            style={{
              background: "radial-gradient(circle at 30% 25%, rgba(212,167,44,0.26), rgba(8,7,10,0.9))",
              boxShadow: `0 0 40px -10px ${OURO}`,
            }}
          >
            <ScanSearch
              className={pronto ? "h-11 w-11" : "h-10 w-10"}
              style={{ color: OURO_CLARO }}
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
              A análise da proposta de <span className="font-semibold text-white">{nomeCliente}</span> foi concluída.
            </p>
            <button
              ref={botao}
              onClick={onConferir}
              disabled={conferindo}
              className="lb-aprov-sobe mt-9 inline-flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-xl text-base font-bold uppercase tracking-wider transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-70"
              style={{
                background: `linear-gradient(135deg, ${OURO_CLARO}, ${OURO})`,
                color: "#1B1405",
                boxShadow: `0 16px 44px -14px ${OURO}`,
                animationDelay: "0.24s",
              }}
            >
              {conferindo ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Conferir resultado <ArrowRight className="h-5 w-5" />
            </button>
            <p
              className="lb-aprov-sobe mt-3 text-[11px] text-white/45"
              style={{ animationDelay: "0.34s" }}
            >
              O resultado será exibido após sua confirmação.
            </p>
          </>
        ) : (
          <>
            <h2
              className="lb-aprov-sobe font-bold leading-tight text-white"
              style={{ fontSize: "clamp(1.5rem, 6.5vw, 2.2rem)", textWrap: "balance", animationDelay: "0.12s" }}
            >
              {nomeCliente}
            </h2>
            <p
              className="lb-aprov-sobe mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/70 sm:text-base"
              style={{ animationDelay: "0.22s" }}
            >
              Sua proposta está sendo analisada.
            </p>

            {/* contador */}
            <div
              className="lb-aprov-sobe mx-auto mt-7 w-full max-w-sm rounded-2xl border px-5 py-5"
              style={{
                borderColor: `${OURO}3a`,
                background: "rgba(212,167,44,0.06)",
                animationDelay: "0.32s",
              }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: OURO_CLARO }}>
                Tempo restante
              </p>
              <p
                className="mt-1 font-bold tabular-nums"
                style={{
                  fontSize: "clamp(2.4rem, 12vw, 3.4rem)",
                  color: OURO_CLARO,
                  textShadow: `0 0 30px rgba(212,167,44,0.45)`,
                  letterSpacing: "0.02em",
                }}
              >
                {relogio(restante)}
              </p>
              {minutos && (
                <p className="text-[11px] text-white/45">Tempo definido pelo administrador: {minutos} minutos</p>
              )}

              {/* trilha das etapas */}
              <div className="mt-5">
                <div className="relative mx-2 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${andado * 100}%`,
                      background: `linear-gradient(90deg, ${OURO}, ${OURO_CLARO})`,
                      transition: "width 0.5s linear",
                    }}
                  />
                  {PASSOS.map((_, i) => (
                    <span
                      key={i}
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                      style={{
                        left: `${(i / (PASSOS.length - 1)) * 100}%`,
                        marginLeft: i === 0 ? 0 : i === PASSOS.length - 1 ? -10 : -5,
                        background: i <= passoAtual ? OURO_CLARO : "rgba(255,255,255,0.18)",
                        boxShadow: i === passoAtual ? `0 0 12px 2px ${OURO}` : "none",
                      }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between gap-1 text-[10px] sm:text-[11px]">
                  {PASSOS.map((p, i) => (
                    <span
                      key={p}
                      className={i === passoAtual ? "lb-anal-passo font-semibold" : ""}
                      style={{
                        color: i <= passoAtual ? OURO_CLARO : "rgba(255,255,255,0.35)",
                        textAlign: i === 0 ? "left" : i === PASSOS.length - 1 ? "right" : "center",
                        flex: 1,
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p
              className="lb-aprov-sobe mt-5 text-xs text-white/45"
              style={{ animationDelay: "0.5s" }}
            >
              Aguarde a conclusão do processo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
