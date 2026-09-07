import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { tokenDoUsuario } from "@/lib/server/meta-conexao";
import {
  ErroMeta,
  appsInscritosNaWaba,
  appId,
  assinarWaba,
  desassinarWaba,
  listarNegocios,
  modoLogin,
  numerosDaWaba,
  permissoesConcedidas,
  wabasDoNegocio,
} from "@/lib/server/meta-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WHATSAPP PELO MESMO CAMINHO DO FORMULÁRIO.
 *
 * O leadgen nunca precisou de configuração manual no Meta Developers porque o
 * CRM liga o webhook sozinho, pela Graph API, com a autorização que o admin já
 * deu. Esta rota faz o mesmo do lado do WhatsApp:
 *
 *   FORMULÁRIO   POST /{page-id}/subscribed_apps   (assinarLeadgen)
 *   WHATSAPP     POST /{waba-id}/subscribed_apps   (assinarWaba)
 *
 * GET  = auditoria. Só leitura: permissões concedidas, portfólios, contas do
 *        WhatsApp, números de cada uma e quais apps já recebem os eventos.
 * POST = vincular/desvincular uma conta do WhatsApp ao CRM.
 *
 * NADA AQUI MEXE EM NÚMERO DE TELEFONE. Inscrever um app numa conta não
 * registra, não verifica, não migra e não remove número — só roteia eventos.
 * Registrar número é outro endpoint, que esta rota não chama de propósito.
 */

const PRECISA = ["whatsapp_business_management", "whatsapp_business_messaging"] as const;

/** Mensagem da Meta, sem vazar token nem segredo. */
const motivo = (e: unknown) =>
  e instanceof ErroMeta ? e.message : e instanceof Error ? e.message : "falha desconhecida";

type Etapa = { passo: string; ok: boolean; detalhe?: string };

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId } = guard;

  const etapas: Etapa[] = [];
  const token = await tokenDoUsuario(orgId);

  if (!token) {
    return Response.json({
      conectado: false,
      modoLogin: modoLogin(),
      etapas: [
        {
          passo: "Autorização da Meta",
          ok: false,
          detalhe:
            "Nenhuma conexão ativa. Use o botão Conectar em Configurações → Integrações antes.",
        },
      ],
      permissoes: [],
      faltam: [...PRECISA],
      negocios: [],
      wabas: [],
    });
  }

  // 1) O QUE A META CONCEDEU. Pedir não é receber: sem estas duas permissões,
  //    nada do resto responde, e o erro seria confuso lá na frente.
  let concedidas: string[] = [];
  try {
    const p = await permissoesConcedidas(token);
    concedidas = p.filter((x) => x.status === "granted").map((x) => x.permission);
    etapas.push({ passo: "Permissões concedidas", ok: true, detalhe: `${concedidas.length} ativas` });
  } catch (e) {
    etapas.push({ passo: "Permissões concedidas", ok: false, detalhe: motivo(e) });
  }
  const faltam = PRECISA.filter((p) => !concedidas.includes(p));

  // 2) PORTFÓLIOS
  let negocios: { id: string; name?: string }[] = [];
  try {
    negocios = await listarNegocios(token);
    etapas.push({
      passo: "Portfólios empresariais",
      ok: negocios.length > 0,
      detalhe: negocios.map((n) => `${n.name ?? "sem nome"} (${n.id})`).join(", ") || "nenhum",
    });
  } catch (e) {
    etapas.push({ passo: "Portfólios empresariais", ok: false, detalhe: motivo(e) });
  }

  // 3) CONTAS DO WHATSAPP + NÚMEROS + QUEM JÁ RECEBE OS EVENTOS
  const meuApp = (() => {
    try {
      return appId();
    } catch {
      return null;
    }
  })();

  const wabas: {
    id: string;
    nome: string | null;
    negocio: string | null;
    revisao: string | null;
    verificacao: string | null;
    vinculadaAoCrm: boolean;
    appsInscritos: { id: string; nome: string | null }[];
    numeros: {
      id: string;
      numero: string | null;
      nome: string | null;
      plataforma: string | null;
      verificacao: string | null;
      qualidade: string | null;
      ehTesteMeta: boolean;
    }[];
    erro?: string;
  }[] = [];

  for (const n of negocios) {
    let achadas: Awaited<ReturnType<typeof wabasDoNegocio>> = [];
    try {
      achadas = await wabasDoNegocio(n.id, token);
    } catch (e) {
      etapas.push({ passo: `Contas do WhatsApp de ${n.name ?? n.id}`, ok: false, detalhe: motivo(e) });
      continue;
    }
    for (const w of achadas) {
      let numeros: typeof wabas[number]["numeros"] = [];
      let apps: { id: string; nome: string | null }[] = [];
      let erro: string | undefined;
      try {
        numeros = (await numerosDaWaba(w.id, token)).map((x) => ({
          id: x.id,
          numero: x.display_phone_number ?? null,
          nome: x.verified_name ?? null,
          plataforma: x.platform_type ?? null,
          verificacao: x.code_verification_status ?? null,
          qualidade: x.quality_rating ?? null,
          // número que não começa em 55 não é brasileiro: é o de teste da Meta
          ehTesteMeta: !(x.display_phone_number ?? "").replace(/\D/g, "").startsWith("55"),
        }));
      } catch (e) {
        erro = motivo(e);
      }
      try {
        apps = (await appsInscritosNaWaba(w.id, token)).map((a) => ({
          id: a.id,
          nome: a.name ?? null,
        }));
      } catch {
        // sem permissão para listar: não invalida o resto
      }
      wabas.push({
        id: w.id,
        nome: w.name ?? null,
        negocio: n.name ?? n.id,
        revisao: w.account_review_status ?? null,
        verificacao: w.business_verification_status ?? null,
        vinculadaAoCrm: !!meuApp && apps.some((a) => a.id === meuApp),
        appsInscritos: apps,
        numeros,
        erro,
      });
    }
  }

  etapas.push({
    passo: "Contas do WhatsApp encontradas",
    ok: wabas.length > 0,
    detalhe: wabas.length ? `${wabas.length} conta(s)` : "nenhuma conta do WhatsApp neste portfólio",
  });

  return Response.json({
    conectado: true,
    modoLogin: modoLogin(),
    etapas,
    permissoes: concedidas,
    faltam,
    negocios,
    wabas,
  });
}

/** Liga (ou desliga) o webhook de uma conta do WhatsApp no CRM. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;

  const corpo = (await req.json().catch(() => ({}))) as { wabaId?: string; ligar?: boolean };
  const wabaId = corpo.wabaId?.trim();
  if (!wabaId) return Response.json({ erro: "Informe a conta do WhatsApp." }, { status: 400 });

  const token = await tokenDoUsuario(guard.orgId);
  if (!token) return Response.json({ erro: "Conecte a Meta antes." }, { status: 400 });

  try {
    if (corpo.ligar === false) await desassinarWaba(wabaId, token);
    else await assinarWaba(wabaId, token);
    return Response.json({ ok: true, ligado: corpo.ligar !== false });
  } catch (e) {
    return Response.json({ erro: motivo(e) }, { status: 502 });
  }
}
