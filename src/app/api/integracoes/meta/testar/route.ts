import { NextRequest } from "next/server";
import crypto from "node:crypto";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { siteBaseUrl } from "@/lib/site-url";
import { ErroMeta, ultimosLeads } from "@/lib/server/meta-api";
import {
  formulariosDaOrg,
  paginasDaOrg,
  registrarLeadRecebido,
  tokenDaPagina,
} from "@/lib/server/meta-conexao";

export const dynamic = "force-dynamic";

/**
 * "Testar agora" — prova de ponta a ponta.
 *
 * Em vez de simular por dentro, o teste MONTA o mesmo aviso que a Meta manda e
 * envia para o nosso próprio webhook, assinado igual ao de verdade. Assim ele
 * exercita o caminho inteiro: assinatura, leitura do formulário na Meta,
 * anti-duplicata, gravação na Central e aviso ao gestor. Se este teste passa,
 * o lead real também passa.
 */

async function jaEstaNaCentral(orgId: string, leadgenId: string) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("central_leads")
    .select("id, nome, telefone, produto, origem, recebido_em")
    .eq("org_id", orgId)
    .like("external_id", `lead:${leadgenId}%`)
    .limit(1)
    .maybeSingle();
  return data as
    | { id: string; nome: string; telefone: string; produto: string | null; origem: string | null; recebido_em: string }
    | null;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId } = guard;

  const segredo = process.env.META_APP_SECRET?.trim();
  if (!segredo) {
    return Response.json(
      { error: "Falta META_APP_SECRET no servidor — sem ela o webhook recusa qualquer aviso." },
      { status: 400 },
    );
  }

  const pagina = (await paginasDaOrg(orgId)).find((p) => p.selecionada);
  if (!pagina) return Response.json({ error: "Escolha uma Página primeiro." }, { status: 400 });

  const pageToken = await tokenDaPagina(orgId, pagina.pageId);
  if (!pageToken) {
    return Response.json({ error: "Acesso à Página perdido. Conecte a Meta de novo." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { formId?: string };
  const forms = await formulariosDaOrg(orgId, pagina.pageId);
  const alvo = body.formId
    ? forms.find((f) => f.formId === body.formId)
    : (forms.find((f) => f.ativo && f.status === "ACTIVE") ?? forms.find((f) => f.ativo));

  if (!alvo) {
    return Response.json(
      { error: "Nenhum formulário ativo para testar. Marque pelo menos um." },
      { status: 400 },
    );
  }

  // 1) pega o lead mais recente que a Meta tem nesse formulário
  let leadgenId: string | undefined;
  let criadoEm: string | undefined;
  try {
    const leads = await ultimosLeads(alvo.formId, pageToken, 1);
    leadgenId = leads[0]?.id;
    criadoEm = leads[0]?.created_time;
  } catch (e) {
    const msg = e instanceof ErroMeta ? e.message : "Não consegui ler os leads na Meta.";
    return Response.json({ error: msg, etapa: "ler-lead" }, { status: 502 });
  }

  if (!leadgenId) {
    return Response.json({
      ok: false,
      etapa: "sem-lead",
      formulario: alvo.nome,
      mensagem:
        `O formulário "${alvo.nome}" ainda não tem nenhum lead na Meta. ` +
        "Preencha um lead de teste pela ferramenta de testes da Meta e clique em Testar de novo.",
    });
  }

  const antes = await jaEstaNaCentral(orgId, leadgenId);

  // 2) monta e assina o aviso, exatamente como a Meta faria
  const corpo = JSON.stringify({
    object: "page",
    entry: [
      {
        id: pagina.pageId,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: leadgenId,
              page_id: pagina.pageId,
              form_id: alvo.formId,
              created_time: criadoEm
                ? Math.floor(new Date(criadoEm).getTime() / 1000)
                : Math.floor(Date.now() / 1000),
            },
          },
        ],
      },
    ],
  });
  const assinatura = "sha256=" + crypto.createHmac("sha256", segredo).update(corpo).digest("hex");

  // 3) entrega no nosso próprio webhook
  const url = `${siteBaseUrl(req.nextUrl.origin)}/api/central-leads/intake`;
  let httpWebhook = 0;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": assinatura },
      body: corpo,
      cache: "no-store",
    });
    httpWebhook = r.status;
    if (!r.ok) {
      return Response.json(
        {
          ok: false,
          etapa: "webhook",
          http: r.status,
          error:
            r.status === 401
              ? "O webhook recusou a assinatura — a chave secreta do app (META_APP_SECRET) não confere."
              : `O webhook respondeu ${r.status}.`,
        },
        { status: 502 },
      );
    }
  } catch {
    return Response.json(
      { ok: false, etapa: "webhook", error: "Não consegui alcançar o webhook do sistema." },
      { status: 502 },
    );
  }

  // 4) confere na Central
  const depois = await jaEstaNaCentral(orgId, leadgenId);
  if (!depois) {
    return Response.json({
      ok: false,
      etapa: "central",
      http: httpWebhook,
      mensagem:
        "O aviso foi aceito, mas o lead não apareceu na Central. Normalmente é permissão " +
        "de leitura do formulário (leads_retrieval) — reconecte autorizando tudo.",
    });
  }

  await registrarLeadRecebido(orgId, alvo.formId);

  return Response.json({
    ok: true,
    jaExistia: !!antes,
    formulario: alvo.nome,
    pagina: pagina.nome,
    lead: {
      nome: depois.nome,
      telefone: depois.telefone,
      produto: depois.produto,
      origem: depois.origem,
      recebidoEm: depois.recebido_em,
    },
    mensagem: antes
      ? `Tudo certo. Esse lead já tinha entrado antes — o sistema reconheceu e não duplicou.`
      : `Tudo certo. O lead "${depois.nome}" acabou de entrar na Central de Leads.`,
  });
}
