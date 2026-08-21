"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Unplug,
} from "lucide-react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

/**
 * Configurações → Integrações → Meta / Facebook Lead Ads.
 *
 * Assistente de 4 passos. Toda a parte técnica (OAuth, tokens, permissões,
 * webhook) acontece no servidor: nesta tela o administrador só clica em
 * Conectar, escolhe a Página, marca os formulários e testa.
 */

type Conexao = {
  metaUserNome: string | null;
  businessNome: string | null;
  escopos: string[];
  expiraEm: string | null;
  status: "ativa" | "expirada" | "revogada";
  ultimoErro: string | null;
  conectadoPor: string | null;
  conectadoEm: string;
};

type Pagina = {
  pageId: string;
  nome: string;
  categoria: string | null;
  fotoUrl: string | null;
  selecionada: boolean;
  webhookAtivo: boolean;
  ultimoErro: string | null;
};

type Formulario = {
  formId: string;
  nome: string;
  status: string | null;
  ativo: boolean;
};

type Status = {
  pronto: { appId: boolean; appSecret: boolean; cofre: boolean; verifyToken: boolean };
  conexao: Conexao | null;
  faltamEscopos: string[];
  paginas: Pagina[];
  pagina: Pagina | null;
  formularios: Formulario[];
  appsNaPagina: { id: string; nome: string | null; campos: string[] }[] | null;
  appIdDoCrm: string | null;
  webhookUrl: string;
  redirectUri: string;
  leadsRecebidos: number;
  ultimoLead: { nome: string; telefone: string; recebido_em: string } | null;
};

type Teste =
  | { ok: true; mensagem: string; lead?: { nome: string; telefone: string } }
  | { ok: false; mensagem?: string; error?: string };

const ESCOPO_LABEL: Record<string, string> = {
  pages_show_list: "ver suas Páginas",
  pages_read_engagement: "ler os dados da Página",
  pages_manage_metadata: "ligar o recebimento de leads",
  leads_retrieval: "ler os formulários preenchidos",
  business_management: "identificar o portfólio",
};

function dataBR(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

function LinhaCopiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        {rotulo}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 font-mono text-[11px]">
          {valor}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(valor);
            setCopiado(true);
            notify.success("Copiado");
          }}
          className="shrink-0 rounded-md border border-[var(--color-border)] p-1.5 text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)]"
          aria-label={`Copiar ${rotulo}`}
        >
          {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function Passo({
  n,
  titulo,
  feito,
  ativo,
  children,
}: {
  n: number;
  titulo: string;
  feito: boolean;
  ativo: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border p-4 transition-colors"
      style={{
        borderColor: ativo ? "var(--color-brand)" : "var(--color-border)",
        background: ativo ? "rgba(37,99,255,.06)" : "transparent",
        opacity: !ativo && !feito ? 0.55 : 1,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
          style={{
            background: feito ? "var(--color-success, #22c55e)" : ativo ? "var(--color-brand)" : "var(--color-surface-2)",
            color: feito || ativo ? "#fff" : "var(--color-text-dim)",
          }}
        >
          {feito ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <h3 className="text-sm font-semibold">{titulo}</h3>
      </div>
      {children ? <div className="mt-3 pl-8.5">{children}</div> : null}
    </div>
  );
}

export function MetaLeadAdsCard() {
  const [s, setS] = useState<Status | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [teste, setTeste] = useState<Teste | null>(null);
  const [marcados, setMarcados] = useState<string[] | null>(null);
  const [formIdManual, setFormIdManual] = useState("");
  const [sync, setSync] = useState<string | null>(null);

  /**
   * `deMeta = false` → lê só o que já está guardado (abertura da tela, rápido).
   * `deMeta = true`  → vai até a Meta antes, para trazer Página ou formulário
   *                    criado depois da última visita. É o que o botão 🔄 faz.
   */
  const carregar = useCallback(async (deMeta = false) => {
    setCarregando(true);
    try {
      if (deMeta) {
        // falhar aqui não pode derrubar a tela: se a Meta não responder,
        // ainda mostramos o que está guardado.
        await Promise.allSettled([
          fetch("/api/integracoes/meta/paginas"),
          fetch("/api/integracoes/meta/formularios"),
        ]);
      }
      const r = await fetch("/api/integracoes/meta/status");
      if (!r.ok) throw new Error(r.status === 403 ? "Só administradores" : "Falha ao consultar");
      const json = (await r.json()) as Status;
      setS(json);
      setMarcados(json.formularios.filter((f) => f.ativo).map((f) => f.formId));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Falha ao consultar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(id);
  }, [carregar]);

  // mensagem de retorno da autorização (?meta=conectado | ?meta=erro&msg=)
  // lido direto da URL: evita prender a página inteira à leitura de query string
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("meta");
    if (!r) return;
    const id = setTimeout(() => {
      if (r === "conectado") notify.success("Conta da Meta conectada");
      else notify.error("A conexão não foi concluída", q.get("msg") ?? undefined);
      window.history.replaceState(null, "", window.location.pathname);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const faltaAmbiente = useMemo(() => {
    if (!s) return [];
    const f: string[] = [];
    if (!s.pronto.appId) f.push("META_APP_ID");
    if (!s.pronto.appSecret) f.push("META_APP_SECRET");
    if (!s.pronto.cofre) f.push("META_TOKEN_KEY");
    if (!s.pronto.verifyToken) f.push("META_VERIFY_TOKEN");
    return f;
  }, [s]);

  async function acao<T>(nome: string, url: string, corpo?: unknown): Promise<T | null> {
    setOcupado(nome);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: corpo ? { "content-type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const json = (await r.json()) as T & { error?: string; dica?: string };
      if (!r.ok) throw new Error([json.error, json.dica].filter(Boolean).join(" · "));
      return json;
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não deu certo");
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function escolherPagina(pageId: string) {
    const r = await acao<{ ok: boolean; formularios: number }>("pagina", "/api/integracoes/meta/paginas", { pageId });
    if (!r) return;
    notify.success(
      "Página conectada",
      r.formularios > 0
        ? `${r.formularios} formulário${r.formularios > 1 ? "s" : ""} encontrado${r.formularios > 1 ? "s" : ""}.`
        : "Nenhum formulário nesta Página ainda.",
    );
    setTeste(null);
    await carregar();
  }

  async function salvarFormularios() {
    if (!s?.pagina || !marcados) return;
    const r = await acao<{ ok: boolean; ativos: number }>("forms", "/api/integracoes/meta/formularios", {
      pageId: s.pagina.pageId,
      ativos: marcados,
    });
    if (!r) return;
    notify.success(`${r.ativos} formulário${r.ativos === 1 ? "" : "s"} recebendo leads`);
    await carregar();
  }

  async function adicionarFormularioManual() {
    if (!s?.pagina) return;
    const r = await acao<{ ok: boolean; adicionado: string }>(
      "addform",
      "/api/integracoes/meta/formularios",
      { pageId: s.pagina.pageId, adicionarFormId: formIdManual.trim() },
    );
    if (!r) return;
    notify.success("Formulário cadastrado e ativado");
    setFormIdManual("");
    await carregar();
  }

  async function buscarAgora() {
    setSync(null);
    const r = await acao<{
      ok: boolean; formulariosLidos: number; leadsVistos: number;
      entregues: number; falhas: number; detalhes: string[];
    }>("sync", "/api/integracoes/meta/sincronizar");
    if (!r) return;
    setSync(
      r.leadsVistos === 0
        ? "Nenhum lead novo na Meta ainda."
        : `${r.leadsVistos} lead(s) lido(s) · ${r.entregues} entregue(s) na Central` +
          (r.falhas ? ` · ${r.falhas} falha(s): ${r.detalhes.join(" | ")}` : ""),
    );
    await carregar();
  }

  async function testar() {
    setTeste(null);
    const r = await acao<Teste>("teste", "/api/integracoes/meta/testar");
    if (r) setTeste(r);
    await carregar();
  }

  async function desconectar() {
    if (!confirm("Desconectar a Meta? Os leads que já entraram continuam na Central.")) return;
    const r = await acao<{ ok: boolean; avisos: string[] }>("desconectar", "/api/integracoes/meta/desconectar");
    if (!r) return;
    notify.success("Meta desconectada", r.avisos[0]);
    setTeste(null);
    await carregar();
  }

  const conectado = !!s?.conexao && s.conexao.status === "ativa";
  const temPagina = !!s?.pagina;
  const temFormAtivo = (s?.formularios ?? []).some((f) => f.ativo);

  // app estranho ainda recebendo os leads da Página (ex.: CRM antigo)
  const intrusos = (s?.appsNaPagina ?? []).filter((a) => a.id !== s?.appIdDoCrm);
  const crmInscrito = (s?.appsNaPagina ?? []).some((a) => a.id === s?.appIdDoCrm);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#1877F2]/15 text-[#1877F2]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>Meta / Facebook Lead Ads</CardTitle>
            <p className="mt-1 text-xs text-[var(--color-text-dim)]">
              Os leads dos seus anúncios com formulário caem direto na Central de Leads — sem
              planilha e sem entrar no painel da Meta.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={() => void carregar(true)}
          disabled={carregando}
          title="Buscar na Meta Páginas e formulários novos"
        >
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {carregando && !s ? (
        <p className="mt-4 text-xs text-[var(--color-text-dim)]">Consultando…</p>
      ) : !s ? null : faltaAmbiente.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <ShieldAlert className="h-4 w-4" /> Falta configurar no servidor
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            Cadastre {faltaAmbiente.map((v) => <code key={v} className="mx-0.5 font-mono">{v}</code>)}
            nas variáveis de ambiente da Vercel e publique de novo. Sem isso a conexão não pode
            começar.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {/* PASSO 1 — conectar */}
          <Passo n={1} titulo="Conectar sua conta da Meta" feito={conectado} ativo={!conectado}>
            {conectado ? (
              <div className="space-y-1.5">
                <p className="text-xs">
                  Conectado como <strong>{s.conexao?.metaUserNome ?? "conta da Meta"}</strong>
                  {s.conexao?.businessNome ? ` · ${s.conexao.businessNome}` : ""}
                </p>
                <p className="text-[11px] text-[var(--color-text-dim)]">
                  Autorizado por {s.conexao?.conectadoPor} em {dataBR(s.conexao?.conectadoEm ?? null)} ·
                  a autorização vale até {dataBR(s.conexao?.expiraEm ?? null)}
                </p>
                {s.faltamEscopos.length > 0 && (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-[11px] text-amber-200">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>
                      Faltou autorizar:{" "}
                      {s.faltamEscopos.map((e) => ESCOPO_LABEL[e] ?? e).join(", ")}. Clique em
                      Conectar de novo e marque tudo.
                    </span>
                  </p>
                )}
                {s.conexao?.ultimoErro && (
                  <p className="text-[11px] text-red-300">Último aviso da Meta: {s.conexao.ultimoErro}</p>
                )}
              </div>
            ) : (
              <div>
                <a
                  href="/api/integracoes/meta/conectar"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Link2 className="h-4 w-4" /> Conectar com o Facebook
                </a>
                <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
                  Abre a tela oficial da Meta. Você autoriza uma vez e o sistema cuida do resto —
                  não precisa copiar token, código nem entrar no Meta Developers.
                </p>
              </div>
            )}
          </Passo>

          {!conectado && (
            <details className="rounded-xl border border-[var(--color-border)] p-3">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--color-text-dim)]">
                Primeira vez? Abra aqui os dados para cadastrar no app da Meta
              </summary>
              <div className="mt-3 space-y-2.5">
                <p className="text-[11px] text-[var(--color-text-dim)]">
                  No <strong>Meta Developers</strong>, dentro do app{" "}
                  {s.appIdDoCrm ? <code className="font-mono">{s.appIdDoCrm}</code> : "do LB CRM"},
                  adicione o produto <strong>Login do Facebook</strong> e cole a URL abaixo em
                  &quot;URIs de redirecionamento do OAuth válidos&quot;. É a única configuração
                  manual — depois dela nunca mais.
                </p>
                <LinhaCopiavel rotulo="URI de redirecionamento do OAuth" valor={s.redirectUri} />
                <LinhaCopiavel rotulo="URL do webhook (já cadastrada)" valor={s.webhookUrl} />
              </div>
            </details>
          )}

          {/* PASSO 2 — escolher a Página */}
          <Passo n={2} titulo="Escolher a Página do Facebook" feito={temPagina} ativo={conectado && !temPagina}>
            {!conectado ? (
              <p className="text-xs text-[var(--color-text-dim)]">Conecte a conta primeiro.</p>
            ) : s.paginas.length === 0 ? (
              <p className="text-xs text-[var(--color-text-dim)]">
                Nenhuma Página encontrada nessa conta. Confirme que você é administrador da Página
                e clique em atualizar.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {s.paginas.map((p) => (
                  <button
                    key={p.pageId}
                    type="button"
                    disabled={ocupado === "pagina"}
                    onClick={() => void escolherPagina(p.pageId)}
                    className="flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors disabled:opacity-60"
                    style={{
                      borderColor: p.selecionada ? "var(--color-brand)" : "var(--color-border)",
                      background: p.selecionada ? "rgba(37,99,255,.10)" : "var(--color-surface-2)",
                    }}
                  >
                    {p.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.fotoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="h-8 w-8 shrink-0 rounded-full bg-[var(--color-surface)]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{p.nome}</span>
                      <span className="block truncate text-[10px] text-[var(--color-text-dim)]">
                        {p.selecionada
                          ? p.webhookAtivo
                            ? "recebendo leads"
                            : "selecionada — recebimento não confirmado"
                          : (p.categoria ?? "Página")}
                      </span>
                    </span>
                    {p.selecionada && p.webhookAtivo && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-success,#22c55e)]" />
                    )}
                  </button>
                ))}
              </div>
            )}
            {s.pagina?.ultimoErro && (
              <p className="mt-2 text-[11px] text-red-300">{s.pagina.ultimoErro}</p>
            )}
          </Passo>

          {/* PASSO 3 — formulários */}
          <Passo n={3} titulo="Escolher os formulários" feito={temFormAtivo} ativo={temPagina && !temFormAtivo}>
            {!temPagina ? (
              <p className="text-xs text-[var(--color-text-dim)]">Escolha a Página primeiro.</p>
            ) : s.formularios.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-[var(--color-text-dim)]">
                  A Meta não devolveu a lista de formulários desta Página. Isso costuma ser falta da
                  permissão <code className="font-mono">pages_manage_ads</code> — e não impede nada:
                  informe o <strong>ID do formulário</strong> aqui embaixo que o sistema busca os
                  leads direto.
                </p>
                <p className="text-[11px] text-[var(--color-text-dim)]">
                  O ID aparece no Gerenciador de Anúncios → Formulários instantâneos, na coluna de
                  identificação do formulário (só números).
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {s.formularios.map((f) => {
                  const on = marcados?.includes(f.formId) ?? false;
                  return (
                    <label
                      key={f.formId}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setMarcados((m) =>
                            e.target.checked
                              ? [...(m ?? []), f.formId]
                              : (m ?? []).filter((x) => x !== f.formId),
                          )
                        }
                        className="h-4 w-4 accent-[var(--color-brand)]"
                      />
                      <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-dim)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{f.nome}</span>
                        {f.status && f.status !== "ACTIVE" && (
                          <span className="block text-[10px] text-[var(--color-text-dim)]">
                            {f.status === "ARCHIVED" ? "arquivado na Meta" : f.status.toLowerCase()}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
                <Button variant="secondary" disabled={ocupado === "forms"} onClick={() => void salvarFormularios()}>
                  {ocupado === "forms" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Salvar seleção
                </Button>
              </div>
            )}

            {temPagina && (
              <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                  Cadastrar formulário pelo ID
                </p>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={formIdManual}
                    onChange={(e) => setFormIdManual(e.target.value.replace(/\D/g, ""))}
                    placeholder="ex.: 1234567890123456"
                    inputMode="numeric"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--color-brand)]"
                  />
                  <Button
                    variant="secondary"
                    disabled={ocupado === "addform" || formIdManual.trim().length < 6}
                    onClick={() => void adicionarFormularioManual()}
                  >
                    {ocupado === "addform" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Cadastrar
                  </Button>
                </div>
              </div>
            )}
          </Passo>

          {/* PASSO 4 — testar */}
          <Passo n={4} titulo="Testar o recebimento" feito={teste?.ok === true} ativo={temFormAtivo}>
            {!temFormAtivo ? (
              <p className="text-xs text-[var(--color-text-dim)]">Marque ao menos um formulário.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button disabled={ocupado === "teste"} onClick={() => void testar()}>
                    {ocupado === "teste" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Testar agora
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={ocupado === "sync"}
                    onClick={() => void buscarAgora()}
                    title="Procura leads novos na Meta e traz para a Central"
                  >
                    {ocupado === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Buscar leads agora
                  </Button>
                </div>
                {sync && (
                  <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5 text-[11px]">
                    {sync}
                  </p>
                )}
                {teste && (
                  <div
                    className="rounded-lg border p-3 text-xs"
                    style={{
                      borderColor: teste.ok ? "rgba(34,197,94,.45)" : "rgba(245,158,11,.45)",
                      background: teste.ok ? "rgba(34,197,94,.10)" : "rgba(245,158,11,.10)",
                    }}
                  >
                    <p className={teste.ok ? "text-emerald-200" : "text-amber-200"}>
                      {teste.ok ? "✅ " : "⚠️ "}
                      {("mensagem" in teste && teste.mensagem) || ("error" in teste && teste.error) || ""}
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-[var(--color-text-dim)]">
                  O sistema busca leads novos na Meta sozinho, a cada 5 minutos. Os botões acima
                  servem para conferir na hora, sem esperar.
                </p>
              </div>
            )}
          </Passo>

          {/* app antigo ainda grudado na Página */}
          {temPagina && intrusos.length > 0 && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <AlertTriangle className="h-4 w-4" /> Outro aplicativo também recebe os leads desta Página
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-[var(--color-text-dim)]">
                {intrusos.map((a) => (
                  <li key={a.id}>
                    <strong className="text-[var(--color-text)]">{a.nome ?? "Aplicativo"}</strong> (ID {a.id})
                    {a.campos.length > 0 ? ` — recebendo: ${a.campos.join(", ")}` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-[var(--color-text-dim)]">
                Se for um sistema antigo que você não usa mais, remova em{" "}
                <a
                  href="https://business.facebook.com/settings/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline"
                >
                  Configurações do Business → Aplicativos <ExternalLink className="h-3 w-3" />
                </a>
                . Isso não afeta o LB CRM.
              </p>
            </div>
          )}

          {/* resumo + desconectar */}
          {conectado && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
              <div className="text-[11px] text-[var(--color-text-dim)]">
                <strong className="text-[var(--color-text)]">{s.leadsRecebidos}</strong> lead
                {s.leadsRecebidos === 1 ? "" : "s"} da Meta já entraram na Central
                {s.ultimoLead
                  ? ` · último: ${s.ultimoLead.nome} em ${new Date(s.ultimoLead.recebido_em).toLocaleString("pt-BR")}`
                  : ""}
                {temPagina && !crmInscrito && s.appsNaPagina !== null
                  ? " · atenção: o LB CRM não aparece inscrito na Página"
                  : ""}
              </div>
              <Button variant="ghost" disabled={ocupado === "desconectar"} onClick={() => void desconectar()}>
                <Unplug className="h-4 w-4" /> Desconectar
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
