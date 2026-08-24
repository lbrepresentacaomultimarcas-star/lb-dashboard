"use client";

// Sino de avisos + contador de pendências.
//
// Duas coisas diferentes moram aqui de propósito, porque no dia a dia elas se
// respondem:
//
//   • O NÚMERO vermelho conta LEADS PARADOS, não avisos por ler. É por isso que
//     ele não zera quando a pessoa abre o sino: abrir o sino não atende
//     ninguém. Ele só cai quando o lead é realmente trabalhado.
//   • A LISTA mostra os avisos recebidos, para saber o que chegou e quando.
//
// Quando o navegador deixa, o mesmo aviso sai também como notificação do
// sistema e como bolinha no ícone do app (PWA). Nada disso é obrigatório: se o
// navegador negar, o número dentro do CRM continua valendo.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, Check, Inbox } from "lucide-react";
import { notificacoesApi, useNotificacoes, useSession } from "@/lib/store";
import { temPermissao } from "@/lib/permissions";
import { usePendentes } from "@/lib/use-pendentes";
import { cn } from "@/lib/utils";

/** Pede permissão uma vez só; nunca insiste se a pessoa negou. */
function pedirPermissao() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

/** Bolinha no ícone do app. Só existe em alguns navegadores — falha em silêncio. */
function bolinhaDoApp(n: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (n > 0) void nav.setAppBadge?.(n);
    else void nav.clearAppBadge?.();
  } catch {
    /* sem badge no SO: o número dentro do CRM continua valendo */
  }
}

const quando = (iso: string) => {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export function NotificacoesSino() {
  const session = useSession();
  const notificacoes = useNotificacoes();
  const pendentes = usePendentes();
  const [aberto, setAberto] = useState(false);
  const anunciadas = useRef<Set<string> | null>(null);
  const caixa = useRef<HTMLDivElement | null>(null);

  const admin = temPermissao(session, "admin");

  const recentes = useMemo(() => notificacoes.slice(0, 12), [notificacoes]);
  const naoLidas = useMemo(() => notificacoes.filter((n) => !n.lida).length, [notificacoes]);

  useEffect(() => {
    pedirPermissao();
  }, []);

  // Bolinha do app acompanha o contador — inclusive quando ele zera.
  useEffect(() => {
    bolinhaDoApp(pendentes);
  }, [pendentes]);

  /**
   * Aviso do sistema quando chega notificação nova.
   *
   * A primeira passada só REGISTRA o que já existia: sem isso, abrir o CRM
   * dispararia um alerta para cada aviso antigo.
   */
  useEffect(() => {
    if (anunciadas.current === null) {
      anunciadas.current = new Set(notificacoes.map((n) => n.id));
      return;
    }
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      for (const n of notificacoes) anunciadas.current.add(n.id);
      return;
    }
    for (const n of notificacoes) {
      if (anunciadas.current.has(n.id)) continue;
      anunciadas.current.add(n.id);
      if (n.lida) continue;
      try {
        const aviso = new Notification(n.titulo, {
          body: n.mensagem ?? "",
          tag: n.id,
          icon: "/icon.png",
          badge: "/icon.png",
        });
        aviso.onclick = () => {
          window.focus();
          if (n.link) window.location.href = n.link;
        };
      } catch {
        /* navegador recusou: a lista do sino continua mostrando */
      }
    }
  }, [notificacoes]);

  // Fecha ao clicar fora — painel que só fecha no próprio botão irrita.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  if (!session) return null;

  const rotulo = pendentes > 0 ? `${pendentes} lead(s) aguardando atendimento` : "Avisos";

  return (
    <div className="relative" ref={caixa}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label={rotulo}
        title={rotulo}
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-lg transition-colors",
          pendentes > 0
            ? "text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
            : "text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
        )}
      >
        {pendentes > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {pendentes > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold leading-[18px] text-white tabular-nums"
            style={{ background: "var(--color-danger)", boxShadow: "0 0 0 2px var(--color-surface)" }}
          >
            {pendentes > 99 ? "99+" : pendentes}
          </span>
        )}
      </button>

      {aberto && (
        <div
          className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
          role="dialog"
          aria-label="Avisos"
        >
          {/* a cobrança vem primeiro: é o que precisa de ação */}
          {pendentes > 0 && (
            <Link
              href="/central"
              onClick={() => setAberto(false)}
              className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-danger)]/10 px-4 py-3 transition-colors hover:bg-[var(--color-danger)]/15"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
                style={{ background: "var(--color-danger)" }}
              >
                <Inbox className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--color-text)]">
                  {pendentes} {pendentes === 1 ? "lead aguardando" : "leads aguardando"}
                </span>
                <span className="block text-xs text-[var(--color-text-dim)]">
                  {admin ? "Ainda sem consultor — distribuir." : "Toque para abrir a fila."}
                </span>
              </span>
            </Link>
          )}

          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
              Avisos
            </span>
            {naoLidas > 0 && (
              <button
                onClick={() => void notificacoesApi.marcarTodasLidas()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)]"
              >
                <Check className="h-3 w-3" /> marcar lidas
              </button>
            )}
          </div>

          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {recentes.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-[var(--color-text-dim)]">Nenhum aviso por enquanto.</p>
            ) : (
              recentes.map((n) => {
                const conteudo = (
                  <>
                    <span className="flex items-start gap-2">
                      {!n.lida && (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: "var(--color-brand)" }}
                        />
                      )}
                      <span className={cn("min-w-0", n.lida && "pl-4")}>
                        <span className="block text-sm font-semibold text-[var(--color-text)]">{n.titulo}</span>
                        {n.mensagem && (
                          <span className="mt-0.5 block whitespace-pre-line text-xs leading-snug text-[var(--color-text-dim)]">
                            {n.mensagem}
                          </span>
                        )}
                        <span className="mt-1 block text-[10px] text-[var(--color-muted)]">{quando(n.criadoEm)}</span>
                      </span>
                    </span>
                  </>
                );
                const classe =
                  "block w-full border-t border-[var(--color-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-2)]";
                return n.link ? (
                  <Link
                    key={n.id}
                    href={n.link}
                    onClick={() => {
                      if (!n.lida) void notificacoesApi.marcarLida(n.id);
                      setAberto(false);
                    }}
                    className={classe}
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    onClick={() => !n.lida && void notificacoesApi.marcarLida(n.id)}
                    className={classe}
                  >
                    {conteudo}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
