import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formularioLiberado, tokenDaPaginaPorId } from "@/lib/server/meta-conexao";

/**
 * PORTA DE ENTRADA DA META → CENTRAL DE LEADS (Click-to-WhatsApp).
 *
 * Recebe os webhooks da WhatsApp Business Platform (Cloud API). Quando o cliente
 * clica num anúncio Click-to-WhatsApp e manda a 1ª mensagem, a Meta envia um
 * evento `messages` cujo payload traz o objeto `referral` — é ele que prova que
 * a conversa nasceu de um anúncio (source_type: "ad", source_id: o ID do anúncio,
 * headline, ctwa_clid...).
 *
 * O que a rota faz:
 *   GET  → responde o handshake de verificação da Meta (hub.challenge).
 *   POST → valida a assinatura (X-Hub-Signature-256), extrai nome/telefone/anúncio
 *          e insere em `central_leads` com status 'novo'.
 *
 * REGRAS IMPORTANTES:
 *   - Deduplicação por TELEFONE (external_id = "wa:<numero>"), aproveitando o índice
 *     único (org_id, external_id). Assim a mesma pessoa não vira vários leads a cada
 *     mensagem que manda. Lead encerrado (perdido/convertido) libera um novo registro.
 *   - Não toca no Pipeline nem no funil: o lead cai na fila da Central para o admin
 *     distribuir, exatamente como um lead cadastrado à mão.
 *   - Responde 200 rápido mesmo em erro interno: a Meta reenvia e desativa webhooks
 *     que respondem erro repetidamente.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ GET
   Handshake: a Meta chama com hub.mode/hub.verify_token/hub.challenge e espera
   o challenge de volta em texto puro. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge");

  const esperado = process.env.META_VERIFY_TOKEN;
  if (!esperado) {
    console.error("[intake] META_VERIFY_TOKEN não configurado no ambiente");
    return new Response("verify token não configurado", { status: 500 });
  }

  if (mode === "subscribe" && token && safeEqual(token, esperado)) {
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return new Response("forbidden", { status: 403 });
}

/* ----------------------------------------------------------------- POST */
export async function POST(req: NextRequest) {
  // corpo CRU é obrigatório: a assinatura é calculada sobre os bytes originais
  const raw = await req.text();

  if (!assinaturaValida(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("assinatura inválida", { status: 401 });
  }

  try {
    const body = JSON.parse(raw) as WebhookBody;
    // A Meta manda TODOS os webhooks do app para a mesma URL. Separamos aqui:
    //   object "whatsapp_business_account" → mensagem de WhatsApp (Click-to-WhatsApp)
    //   object "page" + campo "leadgen"    → formulário instantâneo (Lead Ads)
    // Os dois caminhos devolvem o MESMO formato, então todo o resto (dedupe,
    // gravação, aviso ao gestor) é reaproveitado sem duplicar nada.
    const novos =
      body.object === "page" ? await extrairLeadsAds(body) : extrairLeads(body);

    if (novos.length > 0) {
      const db = supabaseAdmin();
      const orgId = process.env.LB_ORG_ID;
      if (!orgId) {
        console.error("[intake] LB_ORG_ID não configurado no ambiente");
        return Response.json({ ok: true, ignorado: "org não configurada" });
      }

      for (const lead of novos) {
        // Já existe lead ATIVO desse telefone? Então é a mesma conversa: só
        // registra a nova mensagem. A busca é por TELEFONE (não por external_id),
        // porque um cliente que voltou depois de um lead encerrado precisa gerar
        // um lead NOVO — e não ser descartado.
        const { data: ativos } = await db
          .from("central_leads")
          .select("id, produto")
          .eq("org_id", orgId)
          .eq("telefone", lead.telefone)
          .is("encerrado_em", null)
          // lead EXCLUÍDO não pode bloquear lead novo: ele some da tela, então
          // usar como "conversa em andamento" descartaria o lead novo em silêncio.
          .is("excluido_em", null)
          .order("recebido_em", { ascending: false })
          .limit(1);
        const existente = ativos?.[0] ?? null;

        // A Meta reenvia o mesmo webhook quando demora a receber o 200. Marcamos
        // cada evento com o id da mensagem (campo='wamid') usando as colunas de
        // auditoria que já existem — sem alterar o banco. Se já processamos essa
        // mensagem, ignora.
        if (lead.mensagemId) {
          const { data: repetida } = await db
            .from("central_leads_eventos")
            .select("id")
            .eq("org_id", orgId)
            .eq("campo", lead.idCampo ?? "wamid")
            .eq("valor_novo", lead.mensagemId)
            .limit(1)
            .maybeSingle();
          if (repetida) continue;
        }

        if (existente) {
          // Caso real: o cliente responde o interesse ("1", "carro"…) NUMA MENSAGEM
          // SEGUINTE, quando o lead já existe. Se ainda não temos o produto e a
          // mensagem revela o interesse, preenchemos agora.
          if (lead.produto && !existente.produto) {
            await db
              .from("central_leads")
              .update({ produto: lead.produto, atualizado_em: new Date().toISOString() })
              .eq("id", existente.id);
            await db.from("central_leads_eventos").insert({
              org_id: orgId,
              central_lead_id: existente.id,
              tipo: "editado",
              campo: "produto",
              valor_anterior: null,
              valor_novo: lead.produto,
              detalhe: `Interesse identificado automaticamente pela resposta do cliente: ${lead.produto}`,
              autor_nome: lead.idCampo === "leadgen" ? "Meta · Formulário" : "Meta · Click-to-WhatsApp",
            });
          }
          await db.from("central_leads_eventos").insert({
            org_id: orgId,
            central_lead_id: existente.id,
            tipo: "observacao",
            campo: lead.mensagemId ? (lead.idCampo ?? "wamid") : null,
            valor_novo: lead.mensagemId ?? null,
            detalhe: `Novo contato via ${lead.origem}${lead.anuncio ? ` (anúncio: ${lead.anuncio})` : ""}.`,
            autor_nome: lead.idCampo === "leadgen" ? "Meta · Formulário" : "Meta · Click-to-WhatsApp",
          });
          continue;
        }

        const novoLead = (externalId: string) => ({
          org_id: orgId,
          nome: lead.nome,
          telefone: lead.telefone,
          produto: lead.produto,
          origem: lead.origem,
          observacoes: lead.observacoes,
          status: "novo",
          // prazo informado no formulário manda; sem prazo, anúncio pago = "alta"
          prioridade: lead.prioridade ?? "alta",
          teste: lead.teste ?? false,
          external_id: externalId,
          wa_contato: lead.payload,
        });

        let { data: criado, error } = await db
          .from("central_leads")
          .insert(novoLead(lead.externalId))
          .select("id")
          .single();

        // 23505 = já existe lead com esse external_id. Duas situações bem diferentes:
        //
        //  (a) CORRIDA: duas entregas do mesmo webhook chegaram juntas e a outra
        //      acabou de criar o lead. Nesse caso NÃO pode virar lead novo —
        //      reconsultamos e tratamos como mensagem da conversa existente.
        //  (b) CLIENTE QUE VOLTOU: o external_id pertence a um lead ENCERRADO
        //      (perdido/convertido). Aí sim merece um lead novo, com sufixo único.
        if (error?.code === "23505") {
          const { data: agora } = await db
            .from("central_leads")
            .select("id")
            .eq("org_id", orgId)
            .eq("telefone", lead.telefone)
            .is("encerrado_em", null)
            .order("recebido_em", { ascending: false })
            .is("excluido_em", null)
            .limit(1);

          if (agora?.[0]) {
            // (a) corrida — só registra a mensagem no lead que venceu
            await db.from("central_leads_eventos").insert({
              org_id: orgId,
              central_lead_id: agora[0].id,
              tipo: "observacao",
              campo: lead.mensagemId ? (lead.idCampo ?? "wamid") : null,
              valor_novo: lead.mensagemId ?? null,
              detalhe: `Novo contato via ${lead.origem}.`,
              autor_nome: lead.idCampo === "leadgen" ? "Meta · Formulário" : "Meta · Click-to-WhatsApp",
            });
            continue;
          }

          // (b) cliente antigo que voltou
          ({ data: criado, error } = await db
            .from("central_leads")
            .insert(novoLead(`${lead.externalId}#${Date.now()}`))
            .select("id")
            .single());
        }

        if (error || !criado) {
          console.error("[intake] falha ao inserir lead:", error?.message);
          continue;
        }

        await db.from("central_leads_eventos").insert({
          org_id: orgId,
          central_lead_id: criado.id,
          tipo: "criado",
          campo: lead.mensagemId ? (lead.idCampo ?? "wamid") : null,
          valor_novo: lead.mensagemId ?? null,
          detalhe: lead.anuncio
            ? `Lead recebido do anúncio: ${lead.anuncio}`
            : `Lead recebido via ${lead.origem}`,
          autor_nome: lead.idCampo === "leadgen" ? "Meta · Formulário" : "Meta · Click-to-WhatsApp",
        });

        // avisa quem distribui — a Central já escuta `notificacoes` em tempo real,
        // então o sino acende sozinho, sem ninguém ficar olhando a tela
        await avisarAdmins(db, orgId, criado.id, lead);
      }
    }

    return Response.json({ ok: true, recebidos: novos.length });
  } catch (err) {
    // 200 de propósito: erro nosso não pode fazer a Meta desativar o webhook
    console.error("[intake] erro processando webhook:", err);
    return Response.json({ ok: true, erro: "processamento" });
  }
}

/* ------------------------------------------------------------- helpers */

/**
 * Notifica quem pode distribuir (admin/coordenador) que chegou lead novo.
 * Reusa a tabela `notificacoes`, que a Central já escuta em tempo real.
 * Falha aqui nunca derruba o webhook — o lead já está salvo.
 */
async function avisarAdmins(
  db: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  leadId: string,
  lead: { nome: string; produto?: string; anuncio?: string },
) {
  try {
    // profiles não tem org_id (instalação de uma empresa só) — filtra por papel
    const { data: gestores } = await db
      .from("profiles")
      .select("id")
      .in("papel", ["admin", "coordenador"])
      .eq("ativo", true);
    if (!gestores?.length) return;

    const detalhe = lead.produto ? ` · interesse: ${lead.produto}` : "";
    await db.from("notificacoes").insert(
      gestores.map((g) => ({
        org_id: orgId,
        user_id: g.id,
        tipo: "central_lead_novo",
        titulo: "Novo lead pelo WhatsApp",
        mensagem: `${lead.nome}${detalhe}${lead.anuncio ? ` (anúncio: ${lead.anuncio})` : ""}`,
        link: "/central",
        entidade: "central_lead",
        entidade_id: leadId,
      })),
    );
  } catch (err) {
    console.error("[intake] falha ao notificar admins (lead já foi salvo):", err);
  }
}

/** Compara em tempo constante (evita timing attack no verify token). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Confere o X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App Secret).
 *
 * O `.trim()` é proposital: copiar/colar a chave no painel da Vercel costuma
 * arrastar espaço ou quebra de linha invisível — e isso sozinho faz TODA
 * assinatura falhar.
 *
 * Quando a assinatura não bate, logamos um diagnóstico SEM expor a chave:
 * só o tamanho dela (o App Secret da Meta tem 32 caracteres hexadecimais).
 * Tamanho diferente de 32 = chave errada/incompleta.
 */
function assinaturaValida(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret) {
    console.error("[intake] META_APP_SECRET não configurado no ambiente");
    return false;
  }
  if (!header?.startsWith("sha256=")) {
    console.error("[intake] requisição sem cabeçalho x-hub-signature-256");
    return false;
  }
  const esperado = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const ok = safeEqual(header, esperado);
  if (!ok) {
    const hex32 = /^[0-9a-f]{32}$/i.test(secret);
    console.error(
      `[intake] assinatura não confere — diagnóstico: tamanho da chave=${secret.length} ` +
        `(esperado 32) · formato hexadecimal=${hex32 ? "sim" : "NÃO"} · ` +
        `${hex32 && secret.length === 32 ? "formato ok, mas o valor não corresponde ao app da Meta" : "a chave cadastrada está incorreta"}`,
    );
  }
  return ok;
}

type Referral = {
  source_type?: string;
  source_id?: string;
  source_url?: string;
  headline?: string;
  body?: string;
  ctwa_clid?: string;
};
type Mensagem = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  /** resposta tocando num botão de menu interativo */
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  /** resposta rápida de template */
  button?: { text?: string; payload?: string };
  referral?: Referral;
};

/**
 * Texto que o cliente "disse", venha ele digitado OU tocando num botão.
 * Sem isso, uma resposta por botão (menu 1–4) chegaria vazia e o interesse
 * nunca seria identificado.
 */
function textoDaMensagem(msg: Mensagem): string | undefined {
  const t =
    msg.text?.body ??
    msg.interactive?.button_reply?.title ??
    msg.interactive?.list_reply?.title ??
    msg.button?.text ??
    msg.interactive?.button_reply?.id ??
    msg.interactive?.list_reply?.id ??
    msg.button?.payload;
  return t?.trim() || undefined;
}

/** Descrição amigável pra mensagem sem texto (áudio, imagem, documento…). */
function descreveTipo(tipo: string | undefined): string {
  const mapa: Record<string, string> = {
    audio: "🎤 Mensagem de áudio",
    image: "🖼️ Enviou uma imagem",
    video: "🎬 Enviou um vídeo",
    document: "📎 Enviou um documento",
    sticker: "Enviou uma figurinha",
    location: "📍 Enviou a localização",
    contacts: "Enviou um contato",
  };
  return mapa[tipo ?? ""] ?? "Enviou uma mensagem";
}
type Contato = { wa_id?: string; profile?: { name?: string } };
type WebhookBody = {
  object?: string;
  entry?: {
    /** id da Página (Lead Ads) ou da conta do WhatsApp. */
    id?: string;
    changes?: {
      field?: string;
      value?: {
        /* WhatsApp */
        contacts?: Contato[];
        messages?: Mensagem[];
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        /* Lead Ads (formulário instantâneo) */
        leadgen_id?: string;
        page_id?: string;
        form_id?: string;
        ad_id?: string;
        adgroup_id?: string;
        created_time?: number;
      };
    }[];
  }[];
};

type LeadExtraido = {
  nome: string;
  telefone: string;
  produto?: string;
  origem: string;
  observacoes?: string;
  anuncio?: string;
  /** wamid / leadgen_id — usado pra não processar 2x o mesmo evento (a Meta reenvia). */
  mensagemId?: string;
  /** rótulo do id acima na auditoria: "wamid" (WhatsApp) ou "leadgen" (formulário). */
  idCampo?: string;
  externalId: string;
  payload: unknown;
  /** Etiqueta de urgência derivada do prazo informado no formulário.
   *  Ausente = mantém o padrão de anúncio pago ("alta"). */
  prioridade?: "urgente" | "alta" | "normal" | "baixa";
  /** Lead da ferramenta de teste da Meta — entra, mas fora das métricas. */
  teste?: boolean;
};

/**
 * O lead veio da FERRAMENTA DE TESTE da Meta?
 *
 * A ferramenta preenche os campos com texto genérico, tipo
 * "<test lead: dummy data for full_name>". O lead entra normalmente (para
 * provar que o caminho funciona), mas fica etiquetado como teste e não conta
 * em métrica, ranking nem produtividade.
 */
function ehLeadDeTeste(campos: CampoFormulario[]): boolean {
  const tudo = campos
    .map((c) => c.values?.join(" ") ?? "")
    .join(" ")
    .toLowerCase();
  return (
    tudo.includes("test lead") ||
    tudo.includes("dummy data") ||
    /<\s*test/.test(tudo)
  );
}

/**
 * PRAZO DE COMPRA → ETIQUETA DE PRIORIDADE.
 *
 * Reusa o sistema de etiquetas que a Central de Leads JÁ tem (Urgente/Alta/
 * Normal/Baixa, colorido na fila) em vez de inventar outro. O texto exato da
 * resposta é preservado na primeira linha das observações, então o consultor vê
 * a diferença entre "1 a 3 meses" e "3 a 6 meses" mesmo os dois entrando como
 * Normal.
 */
type Prazo = { etiqueta: string; prioridade: "urgente" | "alta" | "normal" | "baixa" };

/** true quando a pergunta é sobre prazo/intenção de compra. */
function ehCampoPrazo(k: string): boolean {
  return (
    k.includes("quando") ||
    k.includes("prazo") ||
    k.includes("pretende") ||
    k.includes("intencao")
  );
}

function detectarPrazo(campos: CampoFormulario[]): Prazo | undefined {
  let resposta: string | undefined;
  for (const c of campos) {
    if (ehCampoPrazo(chave(c.name))) {
      resposta = c.values?.[0]?.trim();
      break;
    }
  }
  if (!resposta) return undefined;

  const t = resposta.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const regras: [RegExp, Prazo][] = [
    [/quanto antes|\bagora\b|imediat|urgente/, { etiqueta: "🔥 QUENTE", prioridade: "urgente" }],
    [/30\s*dias|proximo\s*mes/, { etiqueta: "🟢 PRÓXIMO", prioridade: "alta" }],
    [/1\s*a\s*3|um a tres/, { etiqueta: "🟡 MORNO", prioridade: "normal" }],
    [/3\s*a\s*6|tres a seis/, { etiqueta: "🔵 FUTURO", prioridade: "normal" }],
    [/pesquisan|pesquisa|so olhando|sem previsao/, { etiqueta: "⚪ PESQUISA", prioridade: "baixa" }],
  ];
  for (const [re, p] of regras) {
    if (re.test(t)) return { etiqueta: `${p.etiqueta} — ${resposta}`, prioridade: p.prioridade };
  }
  // resposta que não casa com nenhuma regra: preserva o texto, mantém o padrão
  return { etiqueta: `⏱️ PRAZO — ${resposta}`, prioridade: "alta" };
}

/**
 * IDENTIFICAÇÃO AUTOMÁTICA DO INTERESSE.
 *
 * Lê a resposta do cliente e devolve o produto, casando com o menu enviado no
 * WhatsApp (1 Carro · 2 Moto · 3 Imóvel · 4 Investimento). Os rótulos seguem o
 * vocabulário que o CRM já usa em LEAD_TIPO_INFO.
 *
 * O número só conta quando a mensagem é praticamente só o número ("1", "opção 2"),
 * pra não confundir com "quero 2 motos" ou um valor tipo "3.000".
 */
function detectarInteresse(texto: string | undefined): string | undefined {
  if (!texto) return undefined;

  const t = texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // tira acentos
    .toLowerCase()
    .trim();

  // 1) resposta numérica do menu (mensagem curta, essencialmente só o número)
  const soNumero = t.match(/^(?:opcao\s*|op\.?\s*|n[uº]?\s*)?([1-4])[\s.)\]-]*$/);
  if (soNumero) {
    return { "1": "Carro", "2": "Moto", "3": "Imóvel", "4": "Investimento" }[soNumero[1]];
  }

  // 2) por palavra-chave (ordem importa: mais específico primeiro)
  const regras: [RegExp, string][] = [
    [/\b(caminhao|caminhoes|carreta|truck)\b/, "Caminhão"],
    [/\b(moto|motos|motocicleta|motoca|scooter)\b/, "Moto"],
    [/\b(carro|carros|automovel|veiculo|veiculos)\b/, "Carro"],
    [/\b(imovel|imoveis|casa|apartamento|apto|terreno|lote|chacara|sitio)\b/, "Imóvel"],
    [/\b(investimento|investir|invest|aplicacao|renda)\b/, "Investimento"],
    [/\b(maquina|maquinas|maquinario|trator|equipamento)\b/, "Maquinário"],
  ];
  for (const [re, produto] of regras) if (re.test(t)) return produto;

  return undefined;
}

/* ============================================================
   LEAD ADS — formulário instantâneo (object "page", campo "leadgen")
   ============================================================
   O webhook manda só o ID do lead. Os dados ficam na Graph API e são buscados
   com o token da PÁGINA, que vem da conexão feita em Configurações →
   Integrações (guardado cifrado). Sem conexão, cai no META_PAGE_TOKEN do
   ambiente — o modo manual antigo continua valendo.                         */

type CampoFormulario = { name?: string; values?: string[] };
type LeadDaMeta = {
  id?: string;
  created_time?: string;
  field_data?: CampoFormulario[];
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  /** "fb" | "ig" — de onde o cliente preencheu. */
  platform?: string;
  error?: { message?: string };
};

const GRAPH = () => process.env.META_GRAPH_VERSION?.trim() || "v26.0";
/** Base da Graph API. Só muda em teste automatizado; em produção fica a da Meta. */
const GRAPH_BASE = () => process.env.META_GRAPH_BASE?.trim() || "https://graph.facebook.com";

/** Busca os dados do formulário. Tenta os campos ricos; se a versão da API não
 *  suportar algum, refaz com o conjunto mínimo garantido. */
async function buscarLeadNaMeta(leadgenId: string, token: string): Promise<LeadDaMeta | null> {
  const pedir = async (campos: string) => {
    const url =
      `${GRAPH_BASE()}/${GRAPH()}/${encodeURIComponent(leadgenId)}` +
      `?fields=${campos}&access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url, { cache: "no-store" });
    return (await r.json()) as LeadDaMeta;
  };

  try {
    const rico = await pedir(
      "field_data,created_time,ad_id,ad_name,adset_name,campaign_name,form_id,platform",
    );
    if (!rico.error) return rico;

    const minimo = await pedir("field_data,created_time,ad_id,form_id");
    if (!minimo.error) return minimo;

    console.error(`[intake] Graph recusou o lead ${leadgenId}: ${minimo.error.message}`);
    return null;
  } catch (err) {
    console.error("[intake] falha de rede ao buscar o lead na Meta:", err);
    return null;
  }
}

/** Normaliza o nome do campo do formulário (sem acento, minúsculo). */
const chave = (s: string | undefined) =>
  (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Converte o field_data da Meta nos campos do CRM. */
function mapearFormulario(campos: CampoFormulario[]) {
  const val = (...nomes: string[]) => {
    for (const c of campos) {
      const k = chave(c.name);
      if (nomes.some((n) => k === n)) return c.values?.[0]?.trim() || undefined;
    }
    return undefined;
  };

  const nome =
    val("full_name", "nome", "nome_completo") ||
    [val("first_name", "primeiro_nome"), val("last_name", "sobrenome")].filter(Boolean).join(" ").trim() ||
    undefined;

  const telefone = val("phone_number", "telefone", "celular", "whatsapp");
  const email = val("email", "e_mail");

  // interesse: primeiro um campo que fale de interesse/produto; senão, deduz do texto
  let interesse: string | undefined;
  for (const c of campos) {
    const k = chave(c.name);
    if (k.includes("interesse") || k.includes("produto") || k.includes("procura")) {
      interesse = c.values?.[0]?.trim() || undefined;
      break;
    }
  }
  const produto =
    detectarInteresse(interesse) ?? // "Carro", "Moto"… quando a resposta casa
    interesse ?? // resposta livre do formulário, preservada como veio
    detectarInteresse(campos.map((c) => c.values?.join(" ") ?? "").join(" "));

  return { nome, telefone, email, produto, interesseBruto: interesse };
}

/** Monta os leads a partir do webhook `leadgen`. */
async function extrairLeadsAds(body: WebhookBody): Promise<LeadExtraido[]> {
  const out: LeadExtraido[] = [];
  for (const entry of body.entry ?? []) {
    // O token da Página vem da conexão feita em Configurações → Integrações.
    // Se ainda não houver conexão, cai no META_PAGE_TOKEN do ambiente — assim a
    // configuração manual que já funciona continua funcionando.
    const pageId = entry.id;
    const daConexao = pageId ? await tokenDaPaginaPorId(pageId) : null;
    const token = daConexao?.token ?? process.env.META_PAGE_TOKEN?.trim();
    if (!token) {
      console.error(
        `[intake] sem acesso à Página ${pageId ?? "?"} — conecte a Meta em Configurações → Integrações`,
      );
      continue;
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const leadgenId = change.value?.leadgen_id;
      if (!leadgenId) continue;

      // O admin escolhe QUAIS formulários entregam leads. Formulário desmarcado
      // é ignorado aqui; formulário desconhecido passa (melhor sobrar que faltar).
      const formId = change.value?.form_id;
      const orgDaPagina = daConexao?.orgId ?? process.env.LB_ORG_ID;
      if (orgDaPagina && !(await formularioLiberado(orgDaPagina, formId))) {
        console.log(`[intake] formulário ${formId} está desmarcado — lead ignorado`);
        continue;
      }

      const meta = await buscarLeadNaMeta(leadgenId, token);
      if (!meta) continue;

      const campos = meta.field_data ?? [];
      const m = mapearFormulario(campos);

      // sem telefone o consultor não consegue atender — registra assim mesmo,
      // com um identificador do próprio lead, para nada se perder.
      const telefone = m.telefone ?? `form:${leadgenId}`;

      const rede =
        meta.platform === "ig" ? "Instagram" : meta.platform === "fb" ? "Facebook" : "Formulário";
      const origem = `Meta Ads · ${rede}`;

      // etiqueta de prazo primeiro: é a informação que decide quem ligar antes
      const prazo = detectarPrazo(campos);

      const partes: string[] = [];
      if (prazo) partes.push(prazo.etiqueta);
      if (m.interesseBruto) partes.push(`Interesse informado: ${m.interesseBruto}`);
      if (m.email) partes.push(`E-mail: ${m.email}`);
      // demais respostas do formulário, para o consultor não perder nada
      for (const c of campos) {
        const k = chave(c.name);
        if (["full_name", "first_name", "last_name", "phone_number", "email"].includes(k)) continue;
        if (k.includes("interesse") || k.includes("produto") || k.includes("procura")) continue;
        if (ehCampoPrazo(k)) continue; // já virou a etiqueta lá em cima
        const v = c.values?.join(", ")?.trim();
        if (v) partes.push(`${c.name}: ${v}`);
      }
      if (meta.campaign_name) partes.push(`Campanha: ${meta.campaign_name}`);
      if (meta.adset_name) partes.push(`Conjunto: ${meta.adset_name}`);
      if (meta.ad_name) partes.push(`Anúncio: ${meta.ad_name}`);
      if (meta.ad_id) partes.push(`ID do anúncio: ${meta.ad_id}`);
      if (!m.telefone) partes.push("⚠️ O formulário não trouxe telefone.");

      out.push({
        nome: m.nome ?? "Lead do formulário",
        telefone,
        produto: m.produto,
        origem,
        observacoes: partes.join("\n") || undefined,
        anuncio: meta.ad_name ?? meta.campaign_name ?? undefined,
        mensagemId: leadgenId,
        idCampo: "leadgen",
        prioridade: prazo?.prioridade,
        teste: ehLeadDeTeste(campos),
        externalId: `lead:${leadgenId}`,
        payload: { lead: meta, webhook: change.value, recebido_em: new Date().toISOString() },
      });
    }
  }
  return out;
}

/** Percorre o payload e monta os leads das mensagens RECEBIDAS. */
function extrairLeads(body: WebhookBody): LeadExtraido[] {
  if (body.object !== "whatsapp_business_account") return [];
  const out: LeadExtraido[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const mensagens = value?.messages ?? [];
      if (mensagens.length === 0) continue; // status de entrega/leitura: ignora

      for (const msg of mensagens) {
        const telefone = msg.from ?? "";
        if (!telefone) continue;

        const contato = value?.contacts?.find((c) => c.wa_id === telefone) ?? value?.contacts?.[0];
        const nome = contato?.profile?.name?.trim() || `WhatsApp ${telefone}`;

        const ref = msg.referral;
        const veioDeAnuncio = ref?.source_type === "ad" || !!ref?.source_id;
        const anuncio = ref?.headline?.trim() || ref?.source_id;

        // texto digitado OU título do botão tocado
        const texto = textoDaMensagem(msg);

        const partes: string[] = [];
        if (texto) partes.push(`Mensagem: “${texto}”`);
        else partes.push(descreveTipo(msg.type));
        if (veioDeAnuncio) {
          if (ref?.headline) partes.push(`Anúncio: ${ref.headline}`);
          if (ref?.source_id) partes.push(`ID do anúncio: ${ref.source_id}`);
          if (ref?.source_url) partes.push(`Link: ${ref.source_url}`);
        }

        out.push({
          nome,
          telefone,
          produto: detectarInteresse(texto),
          origem: veioDeAnuncio ? "Meta Ads · Click-to-WhatsApp" : "WhatsApp",
          observacoes: partes.join("\n") || undefined,
          anuncio: anuncio ?? undefined,
          mensagemId: msg.id,
          externalId: `wa:${telefone}`,
          payload: { mensagem: msg, contato, metadata: value?.metadata, recebido_em: new Date().toISOString() },
        });
      }
    }
  }
  return out;
}
