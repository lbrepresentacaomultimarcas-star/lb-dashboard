import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * FILA DE DISTRIBUIÇÃO AUTOMÁTICA — administração.
 *
 * GET  = o estado da fila: quem participa, de quem é a vez, quanto cada um já
 *        recebeu e as últimas entregas.
 * POST = liga/desliga e define QUEM participa.
 *
 * Nada aqui distribui lead. Quem distribui é a função `distribuir_automatico`
 * no banco, chamada pelo webhook — porque é ela que consegue trancar a fila e
 * garantir que dois leads no mesmo segundo não caiam no mesmo consultor.
 *
 * A distribuição manual continua exatamente como está: esta rota não a
 * substitui nem a desliga.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Vendedor = { id: string; nome: string; ativo: boolean };
type Perfil = { id: string; vendedor_ref: string | null; ativo: boolean | null };

/**
 * Por que este consultor não receberia — a MESMA regra da distribuição manual
 * (`lib/destinatarios.ts`) e da função no banco. Dizer o motivo evita o admin
 * marcar alguém e não entender por que os leads passam direto por ele.
 */
function motivo(v: Vendedor, perfis: Perfil[]): string | null {
  if (!v.ativo) return "cadastro inativo";
  const p = perfis.find((x) => x.vendedor_ref === v.id);
  if (!p) return "sem login vinculado";
  if (p.ativo === false) return "acesso bloqueado";
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const db = supabaseAdmin();
  const orgId = auth.orgId;

  const [{ data: cfg }, { data: membros }, { data: vends }, { data: perfis }] = await Promise.all([
    db.from("central_fila_config").select("*").eq("org_id", orgId).maybeSingle(),
    db.from("central_fila_membros").select("vendedor_id, ordem").eq("org_id", orgId).order("ordem"),
    db.from("vendedores").select("id, nome, ativo").eq("org_id", orgId).order("nome"),
    db
      .from("profiles")
      .select("id, vendedor_ref, ativo")
      .or(`id.eq.${orgId},vendedor_id.eq.${orgId}`),
  ]);

  const vendedores = (vends ?? []) as Vendedor[];
  const listaPerfis = (perfis ?? []) as Perfil[];
  const nomeDe = new Map(vendedores.map((v) => [v.id, v.nome]));
  const naFila = new Set(((membros ?? []) as { vendedor_id: string }[]).map((m) => m.vendedor_id));

  // De quem é a vez — vem da MESMA função que a entrega usa, para a tela nunca
  // dizer um nome e o sistema entregar a outro.
  const { data: prox } = await db.rpc("proximo_da_fila", {
    p_org: orgId,
    p_depois_de: (cfg as { ultima_ordem?: number } | null)?.ultima_ordem ?? null,
  });
  const proximoId = (prox as { vendedor_id: string }[] | null)?.[0]?.vendedor_id ?? null;

  // Contadores: quem recebeu quantos, desde sempre.
  const { data: todas } = await db
    .from("central_fila_entregas")
    .select("vendedor_id")
    .eq("org_id", orgId);
  const contagem = new Map<string, number>();
  for (const e of (todas ?? []) as { vendedor_id: string }[]) {
    contagem.set(e.vendedor_id, (contagem.get(e.vendedor_id) ?? 0) + 1);
  }

  // As últimas entregas, para o admin conferir "quem recebeu o quê e quando".
  const { data: ultimas } = await db
    .from("central_fila_entregas")
    .select("central_lead_id, vendedor_id, ordem, telefone, criado_em")
    .eq("org_id", orgId)
    .order("criado_em", { ascending: false })
    .limit(20);

  return Response.json({
    ativa: !!(cfg as { ativa?: boolean } | null)?.ativa,
    participantes: ((membros ?? []) as { vendedor_id: string; ordem: number }[]).map((m) => {
      const v = vendedores.find((x) => x.id === m.vendedor_id);
      return {
        vendedorId: m.vendedor_id,
        nome: v?.nome ?? "consultor removido",
        ordem: m.ordem,
        recebeu: contagem.get(m.vendedor_id) ?? 0,
        impedimento: v ? motivo(v, listaPerfis) : "cadastro removido",
      };
    }),
    // Quem poderia entrar e ainda não está. Só quem de fato receberia.
    disponiveis: vendedores
      .filter((v) => !naFila.has(v.id) && motivo(v, listaPerfis) === null)
      .map((v) => ({ vendedorId: v.id, nome: v.nome })),
    proximo: proximoId ? { vendedorId: proximoId, nome: nomeDe.get(proximoId) ?? "consultor" } : null,
    totalDistribuido: (todas ?? []).length,
    ultimas: ((ultimas ?? []) as {
      central_lead_id: string;
      vendedor_id: string;
      ordem: number;
      telefone: string | null;
      criado_em: string;
    }[]).map((e) => ({
      leadId: e.central_lead_id,
      nome: nomeDe.get(e.vendedor_id) ?? "consultor",
      ordem: e.ordem,
      telefone: e.telefone,
      em: e.criado_em,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const db = supabaseAdmin();
  const orgId = auth.orgId;

  const body = (await req.json().catch(() => ({}))) as {
    ativa?: boolean;
    membros?: string[];
  };

  // A linha de configuração nasce aqui, na primeira vez que o admin mexe.
  // Sem ela, `distribuir_automatico` simplesmente não distribui — o padrão
  // seguro é a fila desligada.
  const { data: atual } = await db
    .from("central_fila_config")
    .select("ativa, ultima_ordem")
    .eq("org_id", orgId)
    .maybeSingle();

  const { error: errCfg } = await db.from("central_fila_config").upsert(
    {
      org_id: orgId,
      ativa: body.ativa ?? (atual as { ativa?: boolean } | null)?.ativa ?? false,
      atualizado_em: new Date().toISOString(),
      atualizado_por: auth.userId,
    },
    { onConflict: "org_id" },
  );
  if (errCfg) return Response.json({ error: errCfg.message }, { status: 400 });

  if (body.membros) {
    const escolhidos = [...new Set(body.membros.filter(Boolean))];

    // Só entra quem é desta empresa. Id vindo da tela não vira confiança.
    const { data: validos } = await db
      .from("vendedores")
      .select("id")
      .eq("org_id", orgId)
      .in("id", escolhidos.length ? escolhidos : ["00000000-0000-0000-0000-000000000000"]);
    const permitidos = new Set(((validos ?? []) as { id: string }[]).map((v) => v.id));

    const { data: hoje } = await db
      .from("central_fila_membros")
      .select("vendedor_id, ordem")
      .eq("org_id", orgId)
      .order("ordem");
    const atuais = (hoje ?? []) as { vendedor_id: string; ordem: number }[];

    /*
     * QUEM FICA MANTÉM O LUGAR.
     *
     * A `ordem` de quem já estava não é recalculada: renumerar embaralharia o
     * rodízio e faria a fila "pular" gente depois de qualquer edição. Quem sai
     * some, quem entra vai para o fim.
     */
    const sair = atuais.filter((m) => !permitidos.has(m.vendedor_id)).map((m) => m.vendedor_id);
    if (sair.length) {
      await db.from("central_fila_membros").delete().eq("org_id", orgId).in("vendedor_id", sair);
    }

    const jaEstao = new Set(atuais.map((m) => m.vendedor_id));
    let proximaOrdem = atuais.reduce((max, m) => Math.max(max, m.ordem), -1) + 1;
    const entrar = [...permitidos]
      .filter((id) => !jaEstao.has(id))
      .map((id) => ({ org_id: orgId, vendedor_id: id, ordem: proximaOrdem++ }));
    if (entrar.length) {
      const { error } = await db.from("central_fila_membros").insert(entrar);
      if (error) return Response.json({ error: error.message }, { status: 400 });
    }
  }

  try {
    await db.from("audit_log").insert({
      org_id: orgId,
      acao: "fila_automatica",
      entidade: "central_fila",
      usuario_email: auth.email,
      detalhes:
        body.ativa !== undefined
          ? `${auth.email} ${body.ativa ? "LIGOU" : "DESLIGOU"} a distribuição automática.`
          : `${auth.email} alterou os participantes da fila automática (${body.membros?.length ?? 0} consultor(es)).`,
    });
  } catch {
    /* auditoria não derruba a operação */
  }

  return Response.json({ ok: true });
}
