import "server-only";

import crypto from "node:crypto";

/**
 * Entrega um lead no NOSSO próprio webhook, montando e assinando o aviso
 * exatamente como a Meta faria.
 *
 * Por que isso existe: a entrega automática da Meta depende de uma cadeia de
 * permissões que pode travar sem aviso (assinatura do webhook, Lead Access
 * Manager, papéis na Página). Buscando o lead pela API e entregando aqui, o
 * caminho de gravação continua sendo UM SÓ — o mesmo do webhook real, com
 * anti-duplicata, etiqueta de prazo e aviso ao gestor. Se a Meta voltar a
 * entregar sozinha, o lead repetido é descartado pelo controle que já existe.
 */

export type ResultadoEntrega =
  | { ok: true; http: number }
  | { ok: false; http: number; motivo: string };

export async function entregarLeadNoWebhook(
  baseUrl: string,
  dados: { pageId: string; formId?: string; leadgenId: string; criadoEm?: string },
): Promise<ResultadoEntrega> {
  const segredo = process.env.META_APP_SECRET?.trim();
  if (!segredo) {
    return { ok: false, http: 0, motivo: "META_APP_SECRET não configurado no servidor." };
  }

  const corpo = JSON.stringify({
    object: "page",
    entry: [
      {
        id: dados.pageId,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: dados.leadgenId,
              page_id: dados.pageId,
              form_id: dados.formId,
              created_time: dados.criadoEm
                ? Math.floor(new Date(dados.criadoEm).getTime() / 1000)
                : Math.floor(Date.now() / 1000),
            },
          },
        ],
      },
    ],
  });

  const assinatura = "sha256=" + crypto.createHmac("sha256", segredo).update(corpo).digest("hex");

  try {
    const r = await fetch(`${baseUrl}/api/central-leads/intake`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": assinatura },
      body: corpo,
      cache: "no-store",
    });
    if (r.ok) return { ok: true, http: r.status };
    return {
      ok: false,
      http: r.status,
      motivo:
        r.status === 401
          ? "O webhook recusou a assinatura — META_APP_SECRET não confere."
          : `O webhook respondeu ${r.status}.`,
    };
  } catch {
    return { ok: false, http: 0, motivo: "Não consegui alcançar o webhook do sistema." };
  }
}
