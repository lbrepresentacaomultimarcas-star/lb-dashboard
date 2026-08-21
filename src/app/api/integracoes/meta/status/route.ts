import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { siteBaseUrl } from "@/lib/site-url";
import { credenciaisPresentes, ESCOPOS, appsInscritos, modoLogin } from "@/lib/server/meta-api";
import { cofrePronto } from "@/lib/server/meta-crypto";
import {
  conexaoDaOrg,
  formulariosDaOrg,
  paginasDaOrg,
  tokenDaPagina,
} from "@/lib/server/meta-conexao";

export const dynamic = "force-dynamic";

/**
 * Tudo o que o assistente de integração precisa mostrar, numa chamada só.
 *
 * NUNCA devolve token — nem cifrado. Só nomes, status e contagens.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId } = guard;

  const cred = credenciaisPresentes();
  const conexao = await conexaoDaOrg(orgId);
  const paginas = await paginasDaOrg(orgId);
  const pagina = paginas.find((p) => p.selecionada) ?? null;
  const formularios = pagina ? await formulariosDaOrg(orgId, pagina.pageId) : [];

  // permissões que a Meta ainda não concedeu — explica falha antes de acontecer
  const faltamEscopos = conexao
    ? ESCOPOS.filter((e) => !conexao.escopos.includes(e))
    : [];

  // quem mais está recebendo os leads desta Página (revela app antigo grudado)
  let appsNaPagina: { id: string; nome: string | null; campos: string[] }[] | null = null;
  if (pagina) {
    const token = await tokenDaPagina(orgId, pagina.pageId);
    if (token) {
      try {
        const apps = await appsInscritos(pagina.pageId, token);
        appsNaPagina = apps.map((a) => ({ id: a.id, nome: a.name ?? null, campos: a.campos }));
      } catch {
        appsNaPagina = null; // sem permissão ou token vencido: a tela não quebra
      }
    }
  }

  // contagem real, direto da Central — fonte da verdade
  const db = supabaseAdmin();
  const { count } = await db
    .from("central_leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .like("origem", "Meta Ads%");

  const { data: ultimo } = await db
    .from("central_leads")
    .select("nome, telefone, produto, origem, recebido_em")
    .eq("org_id", orgId)
    .like("origem", "Meta Ads%")
    .order("recebido_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Response.json({
    pronto: {
      appId: cred.appId,
      appSecret: cred.appSecret,
      cofre: cofrePronto(),
      verifyToken: !!process.env.META_VERIFY_TOKEN,
    },
    conexao,
    faltamEscopos,
    paginas,
    pagina,
    formularios,
    appsNaPagina,
    appIdDoCrm: process.env.META_APP_ID?.trim() ?? null,
    modoLogin: modoLogin(),
    webhookUrl: `${siteBaseUrl(req.nextUrl.origin)}/api/central-leads/intake`,
    redirectUri: `${siteBaseUrl(req.nextUrl.origin)}/api/integracoes/meta/callback`,
    leadsRecebidos: count ?? 0,
    ultimoLead: ultimo ?? null,
  });
}
