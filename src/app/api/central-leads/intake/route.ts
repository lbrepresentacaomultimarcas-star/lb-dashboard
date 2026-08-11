import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
    const novos = extrairLeads(body);

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
            .eq("campo", "wamid")
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
              autor_nome: "Meta · Click-to-WhatsApp",
            });
          }
          await db.from("central_leads_eventos").insert({
            org_id: orgId,
            central_lead_id: existente.id,
            tipo: "observacao",
            campo: lead.mensagemId ? "wamid" : null,
            valor_novo: lead.mensagemId ?? null,
            detalhe: `Nova mensagem no WhatsApp${lead.anuncio ? ` (anúncio: ${lead.anuncio})` : ""}.`,
            autor_nome: "Meta · Click-to-WhatsApp",
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
          prioridade: "alta", // veio de anúncio pago: responder rápido
          external_id: externalId,
          wa_contato: lead.payload,
        });

        let { data: criado, error } = await db
          .from("central_leads")
          .insert(novoLead(lead.externalId))
          .select("id")
          .single();

        // 23505 = o external_id "wa:<telefone>" já pertence a um lead ENCERRADO
        // (cliente antigo que voltou). Como não há lead ativo, ele merece um lead
        // novo — reinsere com um sufixo único em vez de descartar o contato.
        if (error?.code === "23505") {
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
          campo: lead.mensagemId ? "wamid" : null,
          valor_novo: lead.mensagemId ?? null,
          detalhe: lead.anuncio
            ? `Lead recebido do anúncio Click-to-WhatsApp: ${lead.anuncio}`
            : "Lead recebido pelo WhatsApp",
          autor_nome: "Meta · Click-to-WhatsApp",
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
    changes?: {
      field?: string;
      value?: {
        contacts?: Contato[];
        messages?: Mensagem[];
        metadata?: { phone_number_id?: string; display_phone_number?: string };
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
  /** wamid — usado pra não processar 2x a mesma mensagem (a Meta reenvia). */
  mensagemId?: string;
  externalId: string;
  payload: unknown;
};

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
