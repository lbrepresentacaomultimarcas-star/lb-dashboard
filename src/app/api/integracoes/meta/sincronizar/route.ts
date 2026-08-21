import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { siteBaseUrl } from "@/lib/site-url";
import { ErroMeta, ultimosLeads } from "@/lib/server/meta-api";
import { entregarLeadNoWebhook } from "@/lib/server/meta-entrega";
import { formulariosDaOrg, paginasDaOrg, tokenDaPagina } from "@/lib/server/meta-conexao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * BUSCADOR DE LEADS — o plano B que virou plano principal.
 *
 * Em vez de esperar a Meta avisar (entrega que depende de várias permissões e
 * falha em silêncio), o sistema PERGUNTA à Meta se há lead novo e entrega no
 * próprio webhook. Roda sozinho de tempos em tempos (cron da Vercel) e também
 * pelo botão "Buscar leads agora" em Configurações → Integrações.
 *
 * Lead repetido não vira lead duplicado: quem decide isso é o controle que já
 * existe no intake (evento por leadgen_id + telefone ativo).
 */

const QUANTOS_POR_FORMULARIO = 25;

type Resumo = {
  ok: boolean;
  formulariosLidos: number;
  leadsVistos: number;
  entregues: number;
  falhas: number;
  detalhes: string[];
};

async function sincronizar(orgId: string, baseUrl: string): Promise<Resumo> {
  const detalhes: string[] = [];
  let formulariosLidos = 0;
  let leadsVistos = 0;
  let entregues = 0;
  let falhas = 0;

  const pagina = (await paginasDaOrg(orgId)).find((p) => p.selecionada);
  if (!pagina) {
    return { ok: false, formulariosLidos: 0, leadsVistos: 0, entregues: 0, falhas: 0, detalhes: ["Nenhuma Página escolhida."] };
  }

  const token = await tokenDaPagina(orgId, pagina.pageId);
  if (!token) {
    return { ok: false, formulariosLidos: 0, leadsVistos: 0, entregues: 0, falhas: 0, detalhes: ["Sem acesso à Página — reconecte a Meta."] };
  }

  const forms = (await formulariosDaOrg(orgId, pagina.pageId)).filter((f) => f.ativo);
  if (forms.length === 0) {
    return { ok: false, formulariosLidos: 0, leadsVistos: 0, entregues: 0, falhas: 0, detalhes: ["Nenhum formulário marcado para receber."] };
  }

  for (const f of forms) {
    formulariosLidos++;
    let leads;
    try {
      leads = await ultimosLeads(f.formId, token, QUANTOS_POR_FORMULARIO);
    } catch (e) {
      falhas++;
      detalhes.push(`"${f.nome}": ${e instanceof ErroMeta ? e.message : "falha ao ler na Meta"}`);
      continue;
    }

    leadsVistos += leads.length;
    // do mais antigo para o mais novo: a Central fica na ordem certa
    for (const lead of [...leads].reverse()) {
      const r = await entregarLeadNoWebhook(baseUrl, {
        pageId: pagina.pageId,
        formId: f.formId,
        leadgenId: lead.id,
        criadoEm: lead.created_time,
      });
      if (r.ok) entregues++;
      else {
        falhas++;
        detalhes.push(r.motivo);
      }
    }
  }

  return { ok: falhas === 0, formulariosLidos, leadsVistos, entregues, falhas, detalhes: [...new Set(detalhes)].slice(0, 5) };
}

/** Descobre a empresa quando a chamada vem do cron (sem usuário logado). */
async function orgDoCron(): Promise<string | null> {
  const doAmbiente = process.env.LB_ORG_ID?.trim();
  if (doAmbiente) return doAmbiente;
  const db = supabaseAdmin();
  const { data } = await db.from("meta_conexoes").select("org_id").limit(1).maybeSingle();
  return (data as { org_id: string } | null)?.org_id ?? null;
}

/** GET — chamado pelo cron da Vercel (protegido por CRON_SECRET). */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET?.trim();
  const autorizado =
    !!segredo && req.headers.get("authorization") === `Bearer ${segredo}`;
  if (!autorizado) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const orgId = await orgDoCron();
  if (!orgId) return Response.json({ ok: false, motivo: "Nenhuma empresa conectada." });

  const r = await sincronizar(orgId, siteBaseUrl(req.nextUrl.origin));
  if (r.entregues > 0 || r.falhas > 0) {
    console.log(
      `[meta-sync] formulários=${r.formulariosLidos} leads=${r.leadsVistos} entregues=${r.entregues} falhas=${r.falhas}` +
        (r.detalhes.length ? ` · ${r.detalhes.join(" | ")}` : ""),
    );
  }
  return Response.json(r);
}

/** POST — botão "Buscar leads agora" na tela do admin. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const r = await sincronizar(guard.orgId, siteBaseUrl(req.nextUrl.origin));
  return Response.json(r);
}
