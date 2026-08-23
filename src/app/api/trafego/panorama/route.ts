import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { conexaoDaOrg } from "@/lib/server/meta-conexao";
import { podeLerAnuncios } from "@/lib/server/meta-api";

/**
 * PANORAMA DA CENTRAL DE TRÁFEGO.
 *
 * Junta os dois lados da história: o que a Meta cobrou (trafego_snapshots) e o
 * que aconteceu com o lead depois que ele chegou (central_leads).
 *
 * Só lê. E quando a amostra é pequena demais para sustentar conclusão, devolve
 * isso explicitamente em vez de um número que parece resposta — é a diferença
 * entre "ainda não sei" e "é zero".
 */

export const dynamic = "force-dynamic";

/** Abaixo disto, comparar grupos é sorte, não análise. */
const MINIMO_PARA_CONCLUIR = 30;

type Linha = {
  conta_id: string;
  campanha_id: string | null;
  campanha_nome: string | null;
  objeto_id: string;
  objeto_nome: string | null;
  data: string;
  gasto: number | null;
  impressoes: number | null;
  cliques: number | null;
  leads: number | null;
};

const soma = (a: number, b: number | null | undefined) => a + Number(b ?? 0);

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId } = guard;

  const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias") ?? 30), 1), 400);
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

  const db = supabaseAdmin();
  const conexao = await conexaoDaOrg(orgId);

  const { data: snapsRaw } = await db
    .from("trafego_snapshots")
    .select("conta_id, campanha_id, campanha_nome, objeto_id, objeto_nome, data, gasto, impressoes, cliques, leads")
    .eq("org_id", orgId)
    .gte("data", desde);
  const snaps = (snapsRaw ?? []) as Linha[];

  const campanhas = snaps.filter((s) => s.objeto_id === s.campanha_id);
  const anuncios = snaps.filter((s) => s.objeto_id !== s.campanha_id && s.campanha_id);

  const agrupar = (linhas: Linha[], chave: (l: Linha) => string, nome: (l: Linha) => string) => {
    const m = new Map<string, {
      nome: string; conta: string; gasto: number; impressoes: number;
      cliques: number; leads: number; dias: Set<string>;
    }>();
    for (const l of linhas) {
      const k = chave(l);
      const a = m.get(k) ?? { nome: nome(l), conta: l.conta_id, gasto: 0, impressoes: 0, cliques: 0, leads: 0, dias: new Set<string>() };
      a.gasto = soma(a.gasto, l.gasto);
      a.impressoes = soma(a.impressoes, l.impressoes);
      a.cliques = soma(a.cliques, l.cliques);
      a.leads = soma(a.leads, l.leads);
      a.dias.add(l.data);
      m.set(k, a);
    }
    return [...m.values()]
      .map((a) => ({
        nome: a.nome,
        conta: a.conta,
        gasto: Number(a.gasto.toFixed(2)),
        impressoes: a.impressoes,
        cliques: a.cliques,
        leads: a.leads,
        dias: a.dias.size,
        cpl: a.leads > 0 ? Number((a.gasto / a.leads).toFixed(2)) : null,
        cpc: a.cliques > 0 ? Number((a.gasto / a.cliques).toFixed(2)) : null,
        ctr: a.impressoes > 0 ? Number(((100 * a.cliques) / a.impressoes).toFixed(2)) : null,
        // sem volume, nenhum julgamento sobre esta linha se sustenta
        conclusivo: a.leads >= MINIMO_PARA_CONCLUIR && a.dias.size >= 7,
      }))
      .sort((x, y) => y.gasto - x.gasto);
  };

  const porCampanha = agrupar(campanhas, (l) => l.campanha_id ?? l.objeto_id, (l) => l.campanha_nome ?? "(sem nome)");
  const porAnuncio = agrupar(anuncios, (l) => l.objeto_id, (l) => l.objeto_nome ?? "(sem nome)");

  const gastoTotal = porCampanha.reduce((a, c) => a + c.gasto, 0);
  const leadsMeta = porCampanha.reduce((a, c) => a + c.leads, 0);
  const semLead = porCampanha.filter((c) => c.leads === 0 && c.gasto > 0);
  const gastoSemLead = semLead.reduce((a, c) => a + c.gasto, 0);

  /* ---- o que aconteceu com o lead depois de chegar ---- */
  const desdeISO = new Date(Date.now() - dias * 86400000).toISOString();
  const { data: leadsRaw } = await db
    .from("central_leads")
    .select("produto, cidade, prazo_interesse, prioridade, faixa_credito, vendedor_id, atendido_em, convertido_em, criado_em, teste, excluido_em, wa_contato, lead_id")
    .eq("org_id", orgId)
    .gte("criado_em", desdeISO);
  const leads = (leadsRaw ?? []).filter((l) => !l.teste && !l.excluido_em);

  const contar = (f: (l: (typeof leads)[number]) => string | null | undefined) => {
    const m: Record<string, number> = {};
    for (const l of leads) { const k = f(l) || "(não informado)"; m[k] = (m[k] ?? 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([nome, total]) => ({ nome, total }));
  };

  const promovidos = leads.filter((l) => l.lead_id).map((l) => l.lead_id as string);
  let vendas = 0;
  if (promovidos.length) {
    const { count } = await db
      .from("vendas").select("*", { count: "exact" }).eq("org_id", orgId).in("lead_id", promovidos).limit(0);
    vendas = count ?? 0;
  }

  const funil = {
    recebidos: leads.length,
    distribuidos: leads.filter((l) => l.vendedor_id).length,
    atendidos: leads.filter((l) => l.atendido_em).length,
    oportunidades: leads.filter((l) => l.convertido_em).length,
    vendas,
  };

  const ultima = snaps.length
    ? snaps.map((s) => s.data).sort().slice(-1)[0]
    : null;

  return Response.json({
    periodo: { dias, desde },
    conexao: {
      ativa: conexao?.status === "ativa",
      podeLerAnuncios: podeLerAnuncios(conexao?.escopos),
      escopos: conexao?.escopos ?? [],
    },
    coleta: { ultimoDia: ultima, linhas: snaps.length },
    midia: {
      gasto: Number(gastoTotal.toFixed(2)),
      leads: leadsMeta,
      cpl: leadsMeta > 0 ? Number((gastoTotal / leadsMeta).toFixed(2)) : null,
      gastoSemLead: Number(gastoSemLead.toFixed(2)),
      fatiaSemLead: gastoTotal > 0 ? Number(((100 * gastoSemLead) / gastoTotal).toFixed(1)) : null,
      campanhasSemLead: semLead.length,
    },
    campanhas: porCampanha,
    anuncios: porAnuncio.slice(0, 20),
    crm: {
      total: leads.length,
      funil,
      porProduto: contar((l) => l.produto),
      porCidade: contar((l) => l.cidade),
      porPrazo: contar((l) => l.prazo_interesse),
      porFaixa: contar((l) => l.faixa_credito),
      porPlataforma: contar((l) => {
        const p = (l.wa_contato as { lead?: { platform?: string } } | null)?.lead?.platform;
        return p === "ig" ? "Instagram" : p === "fb" ? "Facebook" : null;
      }),
    },
    minimoParaConcluir: MINIMO_PARA_CONCLUIR,
  });
}
