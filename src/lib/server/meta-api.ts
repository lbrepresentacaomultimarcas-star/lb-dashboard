import "server-only";

import crypto from "node:crypto";

/**
 * Conversa com a Graph API da Meta.
 *
 * Só o servidor usa este arquivo. Nenhuma função devolve token para a tela —
 * quem guarda os tokens é o banco (cifrado) e quem os usa é o backend.
 *
 * Compartilha as mesmas variáveis de ambiente do webhook que já existe
 * (META_GRAPH_VERSION / META_GRAPH_BASE), para versão e host serem únicos.
 */

export const GRAPH_VERSION = () => process.env.META_GRAPH_VERSION?.trim() || "v26.0";
export const GRAPH_BASE = () => process.env.META_GRAPH_BASE?.trim() || "https://graph.facebook.com";
const g = (caminho: string) => `${GRAPH_BASE()}/${GRAPH_VERSION()}${caminho}`;

/** Permissões pedidas na autorização. Cada uma tem um motivo — nada a mais. */
export const ESCOPOS = [
  "pages_show_list", // listar as Páginas que você administra
  "pages_read_engagement", // ler nome/categoria/foto da Página
  "pages_manage_metadata", // inscrever o LB CRM nos leads da Página
  "leads_retrieval", // ler os dados do formulário preenchido
  "business_management", // identificar o portfólio/Business
  "ads_read", // SOMENTE LEITURA de investimento e desempenho (Central de Trafego)
  "pages_manage_ads", // listar os formulários da Página (a tela de Integrações depende dela)
] as const;

export function appId(): string {
  const v = process.env.META_APP_ID?.trim();
  if (!v) throw new Error("META_APP_ID não configurado no ambiente.");
  return v;
}

function appSecret(): string {
  const v = process.env.META_APP_SECRET?.trim();
  if (!v) throw new Error("META_APP_SECRET não configurado no ambiente.");
  return v;
}

/** true quando dá para tentar conectar (usado pela tela de status). */
export function credenciaisPresentes(): { appId: boolean; appSecret: boolean } {
  return {
    appId: !!process.env.META_APP_ID?.trim(),
    appSecret: !!process.env.META_APP_SECRET?.trim(),
  };
}

/**
 * Prova de que a chamada vem mesmo do nosso app. A Meta exige quando a opção
 * "Exigir chave secreta do app" está ligada — e é boa prática sempre enviar.
 */
function appsecretProof(token: string): string {
  return crypto.createHmac("sha256", appSecret()).update(token).digest("hex");
}

export class ErroMeta extends Error {
  constructor(
    message: string,
    readonly detalhe?: { code?: number; subcode?: number; type?: string },
  ) {
    super(message);
    this.name = "ErroMeta";
  }
}

type RespostaErro = {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
};

/** Chamada autenticada. Lança ErroMeta com a mensagem que a própria Meta deu. */
async function chamar<T>(
  caminho: string,
  opts: { token: string; metodo?: "GET" | "POST" | "DELETE"; params?: Record<string, string> },
): Promise<T> {
  const url = new URL(g(caminho));
  url.searchParams.set("access_token", opts.token);
  url.searchParams.set("appsecret_proof", appsecretProof(opts.token));
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);

  const r = await fetch(url, { method: opts.metodo ?? "GET", cache: "no-store" });
  const json = (await r.json().catch(() => ({}))) as T & RespostaErro;

  if (!r.ok || json.error) {
    const e = json.error;
    throw new ErroMeta(e?.message ?? `A Meta recusou a chamada (HTTP ${r.status}).`, {
      code: e?.code,
      subcode: e?.error_subcode,
      type: e?.type,
    });
  }
  return json as T;
}

/* --------------------------------- OAuth --------------------------------- */

/**
 * URL da tela oficial de autorização da Meta.
 *
 * A Meta tem DOIS produtos de login e eles pedem parâmetros diferentes:
 *
 *  · "Login do Facebook" (clássico) — as permissões vão na URL, em `scope`.
 *  · "Login do Facebook para Empresas" — as permissões ficam numa
 *    *configuração* criada no painel do app, e a URL manda só o `config_id`.
 *
 * Cadastrando META_LOGIN_CONFIG_ID no ambiente, o sistema usa o segundo modo.
 * Sem essa variável, segue no modo clássico. Assim os dois funcionam sem
 * precisar mexer no código de novo.
 */
export function urlAutorizacao(redirectUri: string, state: string): string {
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION()}/dialog/oauth`);
  u.searchParams.set("client_id", appId());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");

  const configId = usarConfigId();
  if (configId) {
    u.searchParams.set("config_id", configId);
    // sem isto o Login para Empresas devolve token em vez de código
    u.searchParams.set("override_default_response_type", "true");
  } else {
    u.searchParams.set("scope", ESCOPOS.join(","));
  }
  return u.toString();
}

/**
 * O config_id que deve ser usado — ou nada, para cair no modo clássico.
 *
 * META_LOGIN_CLASSICO=1 força o modo clássico SEM apagar o config_id. Existe
 * porque a lista de permissões do "Login para Empresas" mora num painel da
 * Meta, e no clássico ela mora aqui em ESCOPOS. Quando é preciso pedir uma
 * permissão nova e o painel não coopera, essa chave resolve — e voltar atrás é
 * só apagá-la, sem depender de recuperar um segredo que a Vercel não devolve.
 */
function usarConfigId(): string | undefined {
  if (process.env.META_LOGIN_CLASSICO?.trim() === "1") return undefined;
  return process.env.META_LOGIN_CONFIG_ID?.trim() || undefined;
}

/** Qual modo de login está configurado (para a tela explicar o que falta). */
export function modoLogin(): "empresas" | "classico" {
  return usarConfigId() ? "empresas" : "classico";
}

/** Troca o `code` da autorização por um token de usuário (curta duração). */
export async function trocarCodePorToken(code: string, redirectUri: string): Promise<string> {
  const u = new URL(g("/oauth/access_token"));
  u.searchParams.set("client_id", appId());
  u.searchParams.set("client_secret", appSecret());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code", code);

  const r = await fetch(u, { cache: "no-store" });
  const json = (await r.json().catch(() => ({}))) as { access_token?: string } & RespostaErro;
  if (!r.ok || json.error || !json.access_token) {
    throw new ErroMeta(json.error?.message ?? "Não consegui concluir a autorização.", {
      code: json.error?.code,
      subcode: json.error?.error_subcode,
    });
  }
  return json.access_token;
}

/** Converte o token curto (≈2h) num de longa duração (≈60 dias). */
export async function tokenLongaDuracao(
  tokenCurto: string,
): Promise<{ token: string; expiraEm: string | null }> {
  const u = new URL(g("/oauth/access_token"));
  u.searchParams.set("grant_type", "fb_exchange_token");
  u.searchParams.set("client_id", appId());
  u.searchParams.set("client_secret", appSecret());
  u.searchParams.set("fb_exchange_token", tokenCurto);

  const r = await fetch(u, { cache: "no-store" });
  const json = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  } & RespostaErro;
  if (!r.ok || json.error || !json.access_token) {
    throw new ErroMeta(json.error?.message ?? "Não consegui renovar a autorização.");
  }
  return {
    token: json.access_token,
    expiraEm: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
  };
}

/** Permissões efetivamente concedidas + validade — para a tela mostrar a verdade. */
export async function inspecionarToken(token: string): Promise<{
  userId?: string;
  escopos: string[];
  expiraEm: string | null;
  valido: boolean;
}> {
  const u = new URL(g("/debug_token"));
  u.searchParams.set("input_token", token);
  u.searchParams.set("access_token", `${appId()}|${appSecret()}`);

  const r = await fetch(u, { cache: "no-store" });
  const json = (await r.json().catch(() => ({}))) as {
    data?: { user_id?: string; scopes?: string[]; expires_at?: number; is_valid?: boolean };
  };
  const d = json.data ?? {};
  return {
    userId: d.user_id,
    escopos: d.scopes ?? [],
    expiraEm: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
    valido: d.is_valid !== false,
  };
}

/** Retira a autorização do app na conta da Meta (usado ao desconectar). */
export async function revogarAutorizacao(token: string): Promise<void> {
  await chamar("/me/permissions", { token, metodo: "DELETE" });
}

/* ------------------------------ conta / perfil ---------------------------- */

export async function perfil(token: string): Promise<{ id: string; name?: string }> {
  return chamar("/me", { token, params: { fields: "id,name" } });
}

export async function primeiroNegocio(
  token: string,
): Promise<{ id: string; name?: string } | null> {
  try {
    const r = await chamar<{ data?: { id: string; name?: string }[] }>("/me/businesses", {
      token,
      params: { fields: "id,name", limit: "1" },
    });
    return r.data?.[0] ?? null;
  } catch {
    // business_management pode não ter sido concedida — não é impeditivo
    return null;
  }
}

/* --------------------------------- Páginas -------------------------------- */

export type PaginaMeta = {
  id: string;
  name: string;
  category?: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  tasks?: string[];
};

export async function listarPaginas(token: string): Promise<PaginaMeta[]> {
  const r = await chamar<{ data?: PaginaMeta[] }>("/me/accounts", {
    token,
    params: { fields: "id,name,category,access_token,picture{url},tasks", limit: "100" },
  });
  return r.data ?? [];
}

/** Inscreve o LB CRM nos leads da Página. É o passo que dispensa o Meta Developers. */
export async function assinarLeadgen(pageId: string, pageToken: string): Promise<void> {
  await chamar(`/${pageId}/subscribed_apps`, {
    token: pageToken,
    metodo: "POST",
    params: { subscribed_fields: "leadgen" },
  });
}

export async function desassinarLeadgen(pageId: string, pageToken: string): Promise<void> {
  await chamar(`/${pageId}/subscribed_apps`, { token: pageToken, metodo: "DELETE" });
}

/**
 * Quais aplicativos estão recebendo os leads desta Página.
 * É assim que o CRM mostra um app antigo ainda grudado na Página.
 */
export async function appsInscritos(
  pageId: string,
  pageToken: string,
): Promise<{ id: string; name?: string; campos: string[] }[]> {
  const r = await chamar<{
    data?: { id: string; name?: string; subscribed_fields?: string[] }[];
  }>(`/${pageId}/subscribed_apps`, {
    token: pageToken,
    params: { fields: "id,name,subscribed_fields" },
  });
  return (r.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    campos: a.subscribed_fields ?? [],
  }));
}

/* ------------------------------- formulários ------------------------------ */

export type FormularioMeta = {
  id: string;
  name: string;
  status?: string;
  leads_count?: number;
  created_time?: string;
};

export async function listarFormularios(
  pageId: string,
  pageToken: string,
): Promise<FormularioMeta[]> {
  const r = await chamar<{ data?: FormularioMeta[] }>(`/${pageId}/leadgen_forms`, {
    token: pageToken,
    params: { fields: "id,name,status,leads_count,created_time", limit: "200" },
  });
  return r.data ?? [];
}

export type LeadDaMeta = {
  id: string;
  created_time?: string;
  field_data?: { name?: string; values?: string[] }[];
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
};

/** Últimos leads de um formulário — base do botão "Testar agora". */
export async function ultimosLeads(
  formId: string,
  pageToken: string,
  limite = 1,
): Promise<LeadDaMeta[]> {
  const r = await chamar<{ data?: LeadDaMeta[] }>(`/${formId}/leads`, {
    token: pageToken,
    params: {
      fields: "id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform",
      limit: String(limite),
    },
  });
  return r.data ?? [];
}

/* ------------------------------ Anúncios --------------------------------- */
/*
 * Camada de mídia da CENTRAL DE TRÁFEGO.
 *
 * Tudo aqui é SOMENTE LEITURA: `ads_read` deixa o CRM enxergar investimento e
 * desempenho, e não deixa alterar nada. Mudar campanha exige `ads_management`,
 * que é uma decisão separada — enquanto ela não existir, a Central recomenda e
 * registra a autorização, mas quem executa é uma pessoa.
 */

export type ContaDeAnuncios = {
  id: string; // act_XXXXXXXX
  account_id?: string;
  name?: string;
  account_status?: number; // 1 = ativa, 2 = desativada, 3 = pendência...
  currency?: string;
};

/** Contas de anúncios que este usuário administra. */
export async function listarContasDeAnuncios(token: string): Promise<ContaDeAnuncios[]> {
  const r = await chamar<{ data?: ContaDeAnuncios[] }>("/me/adaccounts", {
    token,
    params: { fields: "id,account_id,name,account_status,currency", limit: "100" },
  });
  return r.data ?? [];
}

export type NivelInsight = "account" | "campaign" | "adset" | "ad";

export type LinhaInsight = {
  date_start?: string;
  date_stop?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  actions?: { action_type?: string; value?: string }[];
};

/**
 * Desempenho dia a dia. `time_increment: 1` devolve UMA LINHA POR DIA — é
 * exatamente o formato de trafego_snapshots, então o histórico se acumula sem
 * precisar recalcular nada depois.
 */
export async function insightsDeAnuncios(
  contaId: string,
  token: string,
  opts: { desde: string; ate: string; nivel: NivelInsight },
): Promise<LinhaInsight[]> {
  const campos = [
    "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
    "spend", "impressions", "reach", "clicks", "inline_link_clicks",
    "ctr", "cpc", "cpm", "frequency", "actions",
  ].join(",");

  const todas: LinhaInsight[] = [];
  let caminho: string | null = `/${contaId}/insights`;
  let params: Record<string, string> | undefined = {
    level: opts.nivel,
    time_range: JSON.stringify({ since: opts.desde, until: opts.ate }),
    time_increment: "1",
    fields: campos,
    limit: "500",
  };

  // a Meta pagina; sem seguir o cursor, período longo volta cortado em silêncio
  for (let pagina = 0; pagina < 20 && caminho; pagina++) {
    const r: { data?: LinhaInsight[]; paging?: { cursors?: { after?: string } } } =
      await chamar(caminho, { token, params });
    todas.push(...(r.data ?? []));
    const after = r.paging?.cursors?.after;
    if (!after || !(r.data ?? []).length) break;
    params = { ...params, after };
  }
  return todas;
}

/** Quantos leads a Meta contou nesta linha. */
export function leadsDaLinha(l: LinhaInsight): number {
  const alvos = ["lead", "leadgen.other", "onsite_conversion.lead_grouped"];
  let n = 0;
  for (const a of l.actions ?? []) {
    if (a.action_type && alvos.includes(a.action_type)) n += Number(a.value ?? 0);
  }
  return n;
}

/**
 * A conexão atual tem permissão para ler anúncios?
 *
 * Existe para a tela poder dizer "aguardando permissão" em vez de mostrar zero
 * — zero e "não sei" são coisas diferentes, e confundir as duas faria a Central
 * recomendar em cima de dado que ela não tem.
 */
export function podeLerAnuncios(escopos: string[] | null | undefined): boolean {
  return (escopos ?? []).includes("ads_read");
}

/* ------------------------- Criar formulário de lead ----------------------- */
/*
 * Formulário publicado na Meta NÃO pode ser editado — só duplicado. Então
 * "acrescentar a cidade" é, na prática, criar um formulário novo a partir da
 * definição do atual. Fazer isso pela API evita o construtor da interface, que
 * é onde o trabalho manual se perde.
 */

export type PerguntaFormulario = {
  type: string;
  key?: string;
  label?: string;
  options?: { key?: string; value: string }[];
};

export type DefinicaoFormulario = {
  id?: string;
  name?: string;
  locale?: string;
  questions?: PerguntaFormulario[];
  context_card?: Record<string, unknown>;
  thank_you_page?: Record<string, unknown>;
  privacy_policy?: Record<string, unknown>;
  follow_up_action_url?: string;
  block_display_for_non_targeted_viewer?: boolean;
};

/** Lê a definição completa de um formulário, para servir de molde. */
export async function lerFormulario(formId: string, pageToken: string): Promise<DefinicaoFormulario> {
  return chamar<DefinicaoFormulario>(`/${formId}`, {
    token: pageToken,
    params: {
      fields:
        "id,name,locale,questions,context_card,thank_you_page,privacy_policy," +
        "follow_up_action_url,block_display_for_non_targeted_viewer",
    },
  });
}

/**
 * Cria um formulário na Página. Devolve o id do novo.
 *
 * Os objetos compostos (cartão de contexto, tela final, política) vão como JSON
 * em string — é assim que a Graph API os aceita em POST.
 */
export async function criarFormulario(
  pageId: string,
  pageToken: string,
  def: DefinicaoFormulario & { name: string },
): Promise<string> {
  const params: Record<string, string> = { name: def.name };
  if (def.locale) params.locale = def.locale;
  if (def.questions) params.questions = JSON.stringify(def.questions);
  if (def.context_card) params.context_card = JSON.stringify(def.context_card);
  if (def.thank_you_page) params.thank_you_page = JSON.stringify(def.thank_you_page);
  if (def.privacy_policy) params.privacy_policy = JSON.stringify(def.privacy_policy);
  if (def.follow_up_action_url) params.follow_up_action_url = def.follow_up_action_url;
  if (def.block_display_for_non_targeted_viewer != null) {
    params.block_display_for_non_targeted_viewer = String(def.block_display_for_non_targeted_viewer);
  }
  const r = await chamar<{ id: string }>(`/${pageId}/leadgen_forms`, {
    token: pageToken,
    metodo: "POST",
    params,
  });
  return r.id;
}
