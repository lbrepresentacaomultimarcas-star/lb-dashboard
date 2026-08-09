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
        // já existe lead ATIVO desse telefone? então só registra a nova mensagem
        const { data: existente } = await db
          .from("central_leads")
          .select("id")
          .eq("org_id", orgId)
          .eq("external_id", lead.externalId)
          .is("encerrado_em", null)
          .maybeSingle();

        if (existente) {
          await db.from("central_leads_eventos").insert({
            org_id: orgId,
            central_lead_id: existente.id,
            tipo: "observacao",
            detalhe: `Nova mensagem no WhatsApp${lead.anuncio ? ` (anúncio: ${lead.anuncio})` : ""}.`,
            autor_nome: "Meta · Click-to-WhatsApp",
          });
          continue;
        }

        const { data: criado, error } = await db
          .from("central_leads")
          .insert({
            org_id: orgId,
            nome: lead.nome,
            telefone: lead.telefone,
            origem: lead.origem,
            observacoes: lead.observacoes,
            status: "novo",
            prioridade: "alta", // veio de anúncio pago: responder rápido
            external_id: lead.externalId,
            wa_contato: lead.payload,
          })
          .select("id")
          .single();

        if (error) {
          // corrida com outra entrega do mesmo webhook (índice único) — não é falha
          if (error.code === "23505") continue;
          console.error("[intake] falha ao inserir lead:", error.message);
          continue;
        }

        await db.from("central_leads_eventos").insert({
          org_id: orgId,
          central_lead_id: criado.id,
          tipo: "criado",
          detalhe: lead.anuncio
            ? `Lead recebido do anúncio Click-to-WhatsApp: ${lead.anuncio}`
            : "Lead recebido pelo WhatsApp",
          autor_nome: "Meta · Click-to-WhatsApp",
        });
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

/** Compara em tempo constante (evita timing attack no verify token). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Confere o X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App Secret). */
function assinaturaValida(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("[intake] META_APP_SECRET não configurado no ambiente");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;
  const esperado = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return safeEqual(header, esperado);
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
  referral?: Referral;
};
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
  origem: string;
  observacoes?: string;
  anuncio?: string;
  externalId: string;
  payload: unknown;
};

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

        const partes: string[] = [];
        if (msg.type === "text" && msg.text?.body) partes.push(`Mensagem: “${msg.text.body.trim()}”`);
        if (veioDeAnuncio) {
          if (ref?.headline) partes.push(`Anúncio: ${ref.headline}`);
          if (ref?.source_id) partes.push(`ID do anúncio: ${ref.source_id}`);
          if (ref?.source_url) partes.push(`Link: ${ref.source_url}`);
        }

        out.push({
          nome,
          telefone,
          origem: veioDeAnuncio ? "Meta Ads · Click-to-WhatsApp" : "WhatsApp",
          observacoes: partes.join("\n") || undefined,
          anuncio: anuncio ?? undefined,
          externalId: `wa:${telefone}`,
          payload: { mensagem: msg, contato, metadata: value?.metadata, recebido_em: new Date().toISOString() },
        });
      }
    }
  }
  return out;
}
