"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, RefreshCw, Smartphone } from "lucide-react";

import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

/**
 * WHATSAPP PELO MESMO CAMINHO DO FORMULÁRIO.
 *
 * Este cartão não configura nada no Meta Developers. Ele usa a autorização que
 * o admin já deu no "Conectar Meta" e liga o webhook da conta do WhatsApp no
 * CRM — exatamente como a Página do formulário já é ligada.
 *
 * Vincular NÃO mexe em número de telefone: não registra, não verifica, não
 * migra. O número no celular continua onde está.
 */

type Numero = {
  id: string;
  numero: string | null;
  nome: string | null;
  plataforma: string | null;
  verificacao: string | null;
  qualidade: string | null;
  ehTesteMeta: boolean;
};

type Waba = {
  id: string;
  nome: string | null;
  negocio: string | null;
  revisao: string | null;
  verificacao: string | null;
  vinculadaAoCrm: boolean;
  appsInscritos: { id: string; nome: string | null }[];
  numeros: Numero[];
  erro?: string;
};

type Auditoria = {
  conectado: boolean;
  modoLogin: "empresas" | "classico";
  etapas: { passo: string; ok: boolean; detalhe?: string }[];
  permissoes: string[];
  faltam: string[];
  wabas: Waba[];
};

const NOMES: Record<string, string> = {
  whatsapp_business_management: "Gerenciar contas do WhatsApp",
  whatsapp_business_messaging: "Receber e enviar mensagens",
};

export function WhatsappMetaCard() {
  const [dados, setDados] = useState<Auditoria | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/integracoes/meta/whatsapp");
      if (!r.ok) throw new Error(r.status === 403 ? "Só administradores" : "Falha ao consultar");
      setDados((await r.json()) as Auditoria);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao consultar");
    } finally {
      setCarregando(false);
    }
  }, []);

  // fora do corpo do efeito: React 19 reclama de setState síncrono em effect
  useEffect(() => {
    const id = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(id);
  }, [carregar]);

  async function vincular(wabaId: string, ligar: boolean) {
    setOcupado(wabaId);
    try {
      const r = await fetch("/api/integracoes/meta/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wabaId, ligar }),
      });
      const j = (await r.json()) as { erro?: string };
      if (!r.ok) throw new Error(j.erro ?? "A Meta recusou");
      notify.success(ligar ? "Conta vinculada ao CRM" : "Conta desvinculada");
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não consegui vincular");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--color-brand)]/10 text-[var(--color-brand)]">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>WhatsApp da Meta (contas e números)</CardTitle>
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">
              Mesma autorização do formulário. Vincular liga o webhook das mensagens no CRM e não
              mexe no número que está no celular.
            </p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => void carregar()} disabled={carregando}>
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {erro ? (
        <p className="mt-4 text-xs text-[var(--color-text-dim)]">{erro}</p>
      ) : !dados ? (
        <p className="mt-4 text-xs text-[var(--color-text-dim)]">Consultando a Meta…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <ul className="space-y-1.5">
            {dados.etapas.map((e) => (
              <li key={e.passo} className="flex items-start gap-2 text-xs">
                {e.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success,#22c55e)]" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warn,#f59e0b)]" />
                )}
                <span className={e.ok ? "text-[var(--color-text-dim)]" : "font-medium"}>
                  {e.passo}
                  {e.detalhe ? (
                    <span className="text-[var(--color-text-dim)]"> — {e.detalhe}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          {dados.conectado && dados.faltam.length > 0 ? (
            <div className="rounded-lg border border-[var(--color-warn,#f59e0b)]/35 bg-[var(--color-warn,#f59e0b)]/8 p-3">
              <p className="text-xs font-semibold">Falta autorizar no Conectar Meta</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-[var(--color-text-dim)]">
                {dados.faltam.map((p) => (
                  <li key={p}>{NOMES[p] ?? p}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--color-text-dim)]">
                {dados.modoLogin === "empresas"
                  ? "A conexão está no modo Login para Empresas: a lista de permissões fica numa configuração dentro do painel da Meta. Acrescente as duas lá e depois use o botão abaixo."
                  : "Use o botão abaixo e aceite as duas permissões novas."}
              </p>
              {/*
                NÃO mandar o admin usar "Desconectar" para reautorizar: aquele
                botão apaga a Página e os formulários escolhidos, e derrubaria o
                fluxo de leads que já funciona. Este link vai direto para a
                autorização — a conexão é regravada por cima (upsert por org) e
                Página e formulários ficam intactos.
              */}
              <a
                href="/api/integracoes/meta/conectar"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Autorizar o WhatsApp na Meta
              </a>
              <p className="mt-1.5 text-[11px] text-[var(--color-text-dim)]">
                Não desconecta nada: a Página e os formulários continuam como estão.
              </p>
            </div>
          ) : null}

          {dados.conectado && dados.wabas.length === 0 ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
              <p className="text-xs text-[var(--color-text-dim)]">
                Nenhuma conta do WhatsApp apareceu neste portfólio. Isso acontece quando a
                autorização ainda não inclui as permissões do WhatsApp, ou quando a conta pertence a
                outro portfólio empresarial.
              </p>
            </div>
          ) : null}

          {dados.wabas.map((w) => (
            <div key={w.id} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{w.nome ?? "Conta sem nome"}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-dim)]">
                    {w.negocio} · {w.id}
                    {w.verificacao ? ` · verificação: ${w.verificacao}` : ""}
                  </p>
                </div>
                <Button
                  variant={w.vinculadaAoCrm ? "ghost" : "primary"}
                  onClick={() => void vincular(w.id, !w.vinculadaAoCrm)}
                  disabled={ocupado === w.id}
                >
                  <Link2 className="mr-1.5 h-4 w-4" />
                  {w.vinculadaAoCrm ? "Desvincular" : "Vincular ao CRM"}
                </Button>
              </div>

              {w.vinculadaAoCrm ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-success,#22c55e)]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-success,#22c55e)]">
                  <CheckCircle2 className="h-3 w-3" /> Mensagens desta conta chegam no CRM
                </p>
              ) : null}

              {w.erro ? (
                <p className="mt-2 text-xs text-[var(--color-text-dim)]">
                  Não consegui ler os números: {w.erro}
                </p>
              ) : w.numeros.length === 0 ? (
                <p className="mt-2 text-xs text-[var(--color-text-dim)]">
                  Nenhum número nesta conta.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {w.numeros.map((n) => (
                    <li key={n.id} className="text-xs">
                      <span className="font-medium">{n.numero ?? "sem número"}</span>
                      {n.nome ? (
                        <span className="text-[var(--color-text-dim)]"> · {n.nome}</span>
                      ) : null}
                      {n.plataforma ? (
                        <span className="text-[var(--color-text-dim)]"> · {n.plataforma}</span>
                      ) : null}
                      {n.ehTesteMeta ? (
                        <span className="ml-2 rounded-full bg-[var(--color-warn,#f59e0b)]/12 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-warn,#f59e0b)]">
                          número de teste
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
