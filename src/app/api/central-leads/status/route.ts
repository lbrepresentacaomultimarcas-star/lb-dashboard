import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Status da conexão com a Meta (cartão em Configurações).
 *
 * Só admin. Devolve BOOLEANOS sobre a configuração (nunca o valor de nenhum
 * segredo) + um resumo dos leads que já chegaram pelo WhatsApp.
 *
 * POR QUE O NÚMERO APARECE AQUI
 *
 * Ter as variáveis de ambiente configuradas prova que ESTE LADO está pronto —
 * não prova que o WhatsApp da empresa está do outro lado. Enquanto o número
 * ligado à Meta for o número de TESTE, o cartão ficava verde e os anúncios não
 * traziam ninguém: verde que engana custa lead.
 *
 * O número que recebeu a mensagem vem no próprio webhook
 * (`metadata.display_phone_number`), e o intake já o guarda em `wa_contato`.
 * Então dá para mostrar o número REAL, sem token e sem chamar a Meta.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Metadata = { display_phone_number?: string; phone_number_id?: string };

/** Só dígitos, para comparar número sem depender de máscara. */
const digitos = (v: string) => v.replace(/\D/g, "");

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  // configuração do ambiente — só presença, jamais o conteúdo
  const config = {
    verifyToken: !!process.env.META_VERIFY_TOKEN,
    appSecret: !!process.env.META_APP_SECRET,
    orgId: !!process.env.LB_ORG_ID,
  };

  const db = supabaseAdmin();
  const orgId = process.env.LB_ORG_ID ?? auth.orgId;

  const { data: ultimos } = await db
    .from("central_leads")
    .select("nome, telefone, produto, origem, recebido_em, wa_contato")
    .eq("org_id", orgId)
    .like("origem", "%WhatsApp%")
    .order("recebido_em", { ascending: false })
    .limit(1);

  const { count } = await db
    .from("central_leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .like("origem", "%WhatsApp%");

  const ultimo = ultimos?.[0] ?? null;

  // QUAL NÚMERO DA EMPRESA RECEBEU. Vem do webhook, não de configuração nossa:
  // é a única prova de qual número está de fato ligado à Cloud API.
  const meta = ((ultimo?.wa_contato as { metadata?: Metadata } | null)?.metadata ?? null) as Metadata | null;
  const display = meta?.display_phone_number ?? null;
  const numero = display
    ? {
        display,
        // Número que não começa em 55 não é brasileiro — é o número de teste
        // que a Meta cria sozinha. Anúncio real nunca cai nele.
        ehTesteMeta: !digitos(display).startsWith("55"),
      }
    : null;

  return Response.json({
    config,
    pronto: config.verifyToken && config.appSecret && config.orgId,
    callbackUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://lb-dashboard-virid.vercel.app"}/api/central-leads/intake`,
    totalRecebidos: count ?? 0,
    numero,
    ultimo: ultimo
      ? {
          nome: ultimo.nome,
          telefone: ultimo.telefone,
          produto: ultimo.produto,
          origem: ultimo.origem,
          recebidoEm: ultimo.recebido_em,
        }
      : null,
  });
}
