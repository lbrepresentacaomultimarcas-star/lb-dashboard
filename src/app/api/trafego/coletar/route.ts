import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { conexaoDaOrg, tokenDoUsuario } from "@/lib/server/meta-conexao";
import {
  ErroMeta,
  insightsDeAnuncios,
  leadsDaLinha,
  listarContasDeAnuncios,
  podeLerAnuncios,
  type LinhaInsight,
  type NivelInsight,
} from "@/lib/server/meta-api";

/**
 * COLETA DA CENTRAL DE TRÁFEGO.
 *
 * Busca o desempenho na Meta e guarda uma FOTO POR DIA em trafego_snapshots.
 *
 * Só lê. A única escrita é no histórico do próprio CRM — nenhuma campanha,
 * orçamento, público ou anúncio é tocado. Recoletar um período já coletado
 * atualiza as linhas em vez de duplicar, porque a Meta reprocessa números por
 * até 72h e o mesmo dia precisa convergir para o valor final.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NIVEIS: { api: NivelInsight; nosso: string }[] = [
  { api: "campaign", nosso: "campanha" },
  { api: "adset", nosso: "conjunto" },
  { api: "ad", nosso: "anuncio" },
];

const num = (v: string | undefined) => (v == null || v === "" ? null : Number(v));

function idDoNivel(l: LinhaInsight, nivel: string): string | null {
  if (nivel === "campanha") return l.campaign_id ?? null;
  if (nivel === "conjunto") return l.adset_id ?? null;
  return l.ad_id ?? null;
}
function nomeDoNivel(l: LinhaInsight, nivel: string): string | null {
  if (nivel === "campanha") return l.campaign_name ?? null;
  if (nivel === "conjunto") return l.adset_name ?? null;
  return l.ad_name ?? null;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const { orgId } = guard;

  const conexao = await conexaoDaOrg(orgId);
  if (!conexao || conexao.status !== "ativa") {
    return Response.json(
      { error: "A Meta não está conectada. Vá em Configurações → Integrações." },
      { status: 400 },
    );
  }
  // "sem permissão" e "zero" são coisas diferentes: sem isso a Central
  // recomendaria em cima de dado que ela não tem.
  if (!podeLerAnuncios(conexao.escopos)) {
    return Response.json(
      {
        error: "aguardando_permissao",
        detalhe:
          "A conexão com a Meta ainda não tem permissão para ler anúncios (ads_read). " +
          "Reconecte em Configurações → Integrações.",
        escopos: conexao.escopos,
      },
      { status: 409 },
    );
  }

  const token = await tokenDoUsuario(orgId);
  if (!token) return Response.json({ error: "Token da Meta indisponível." }, { status: 400 });

  const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias") ?? 30), 1), 400);
  const contaPedida = req.nextUrl.searchParams.get("conta")?.trim() || null;

  const ate = new Date();
  const desde = new Date(ate.getTime() - dias * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const db = supabaseAdmin();
  const relatorio: Record<string, unknown>[] = [];
  let gravadas = 0;

  try {
    const contas = await listarContasDeAnuncios(token);
    const alvo = contaPedida ? contas.filter((c) => c.id === contaPedida || c.account_id === contaPedida) : contas;

    for (const conta of alvo) {
      const porNivel: Record<string, number> = {};
      let gastoConta = 0;
      let leadsConta = 0;

      for (const { api, nosso } of NIVEIS) {
        const linhas = await insightsDeAnuncios(conta.id, token, {
          desde: iso(desde),
          ate: iso(ate),
          nivel: api,
        });
        porNivel[nosso] = linhas.length;

        const registros = linhas
          .map((l) => {
            const objetoId = idDoNivel(l, nosso);
            if (!objetoId || !l.date_start) return null;
            const leads = leadsDaLinha(l);
            const gasto = num(l.spend);
            if (nosso === "campanha") {
              gastoConta += gasto ?? 0;
              leadsConta += leads;
            }
            return {
              org_id: orgId,
              conta_id: conta.id,
              nivel: nosso,
              objeto_id: objetoId,
              objeto_nome: nomeDoNivel(l, nosso),
              campanha_id: l.campaign_id ?? null,
              campanha_nome: l.campaign_name ?? null,
              conjunto_id: l.adset_id ?? null,
              conjunto_nome: l.adset_name ?? null,
              data: l.date_start,
              gasto,
              impressoes: num(l.impressions),
              alcance: num(l.reach),
              cliques: num(l.clicks),
              cliques_link: num(l.inline_link_clicks),
              ctr: num(l.ctr),
              cpc: num(l.cpc),
              cpm: num(l.cpm),
              frequencia: num(l.frequency),
              leads,
              cpl: leads > 0 && gasto != null ? gasto / leads : null,
              bruto: l,
              coletado_em: new Date().toISOString(),
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        // em lotes: período longo em nível de anúncio passa de mil linhas
        for (let i = 0; i < registros.length; i += 500) {
          const lote = registros.slice(i, i + 500);
          const { error } = await db
            .from("trafego_snapshots")
            .upsert(lote, { onConflict: "org_id,conta_id,nivel,objeto_id,data", ignoreDuplicates: false });
          if (error) throw new Error(`gravar ${nosso}: ${error.message}`);
          gravadas += lote.length;
        }
      }

      relatorio.push({
        conta: conta.id,
        nome: conta.name ?? null,
        moeda: conta.currency ?? null,
        situacao: conta.account_status ?? null,
        linhas: porNivel,
        gasto_no_periodo: Number(gastoConta.toFixed(2)),
        leads_no_periodo: leadsConta,
      });
    }

    return Response.json({
      ok: true,
      periodo: { de: iso(desde), ate: iso(ate), dias },
      contas: relatorio,
      linhas_gravadas: gravadas,
    });
  } catch (e) {
    const msg = e instanceof ErroMeta ? e.message : e instanceof Error ? e.message : String(e);
    console.error("[trafego] falha na coleta:", msg);
    return Response.json({ error: "Falha ao coletar na Meta.", detalhe: msg }, { status: 502 });
  }
}
