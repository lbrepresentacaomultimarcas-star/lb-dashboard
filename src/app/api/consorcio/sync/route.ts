import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fontes públicas da Multimarcas (pasta do Drive enviada pela LB).
const PASTA_RAIZ = "1XQ_U1YaWlDlbPE4jWYQ3xWJ3zbpuMo9W";
const PLANILHA_CREDITOS = "1_NJYVzpt1IWYyRjH9_I_TknlBSHPvudskPj25sAIBzY";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/* ------------------------------ parsing helpers ----------------------------- */

/** CSV com aspas (campos como "R$ 62.628,96" têm vírgula interna). */
function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentro) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else dentro = false;
      } else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

const numBR = (v: string): number | null => {
  const limpo = v.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) && limpo !== "" ? n : null;
};

/** "25 (valor crédito)" → {pct:25, base:"credito"}; "50 (valor lance)" → lance. */
function parseEmbutido(v: string): { pct: number | null; base: "credito" | "lance" | null } {
  const pct = numBR((v.match(/[\d,.]+/) ?? [""])[0] ?? "");
  const base = /lance/i.test(v) ? "lance" : /cr[eé]dito/i.test(v) ? "credito" : null;
  return { pct, base };
}

const simNao = (v: string): boolean | null => (/^sim$/i.test(v.trim()) ? true : /^n[aã]o$/i.test(v.trim()) ? false : null);

/** Lista uma pasta pública do Drive (visão embutida — sem credenciais). */
async function listarPasta(id: string): Promise<{ id: string; titulo: string }[]> {
  const r = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!r.ok) return [];
  const html = await r.text();
  const out: { id: string; titulo: string }[] = [];
  const re = /id="entry-([A-Za-z0-9_-]+)"[\s\S]*?flip-entry-title">([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ id: m[1], titulo: m[2].trim() });
  return out;
}

/* ---------------------------------- handler --------------------------------- */

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const admin = supabaseAdmin();

  // 1) Planilha de créditos (CSV público) → liberados + bloqueados
  const csvRes = await fetch(
    `https://docs.google.com/spreadsheets/d/${PLANILHA_CREDITOS}/export?format=csv`,
    { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" },
  );
  if (!csvRes.ok) return Response.json({ error: `Planilha inacessível (${csvRes.status})` }, { status: 502 });
  const rows = parseCsv(await csvRes.text());

  type Cred = {
    grupo: string; segmento: string | null; cod_bem: string; valor: number;
    prazo_total: number | null; taxa_adm: number | null; antecipacao_tx: number | null;
    taxa_fr: number | null; taxa_seguro: number | null; plano_light: boolean | null;
    pct_embutido: number | null; base_embutido: string | null;
  };
  const creditos: Cred[] = [];
  const grupos = new Map<string, Record<string, unknown>>();

  for (const r of rows) {
    // Esquerda (0–10): bens liberados
    const seg = (r[0] ?? "").trim().toUpperCase();
    if (/^(IMV|AUT|MOT|CAM|SRV)$/.test(seg) && (r[1] ?? "").trim() && (r[2] ?? "").trim()) {
      const emb = parseEmbutido(r[10] ?? "");
      const valor = numBR(r[3] ?? "");
      if (valor !== null) {
        const c: Cred = {
          grupo: r[1].trim(), segmento: seg, cod_bem: r[2].trim(), valor,
          prazo_total: numBR(r[4] ?? ""), taxa_adm: numBR(r[5] ?? ""),
          antecipacao_tx: numBR(r[6] ?? ""), taxa_fr: numBR(r[7] ?? ""),
          taxa_seguro: numBR(r[8] ?? ""), plano_light: simNao(r[9] ?? ""),
          pct_embutido: emb.pct, base_embutido: emb.base,
        };
        creditos.push(c);
        if (!grupos.has(c.grupo))
          grupos.set(c.grupo, {
            grupo: c.grupo, segmento: seg, situacao: "liberado",
            prazo_total: c.prazo_total, taxa_adm: c.taxa_adm, antecipacao_tx: c.antecipacao_tx,
            taxa_fr: c.taxa_fr, taxa_seguro: c.taxa_seguro, plano_light: c.plano_light,
            pct_embutido: c.pct_embutido, base_embutido: c.base_embutido,
          });
      }
    }
    // Direita (12–20): grupos bloqueados totalmente
    const gB = (r[12] ?? "").trim();
    const segB = (r[13] ?? "").trim().toUpperCase();
    if (/^\d+$/.test(gB) && /^(IMV|AUT|MOT|CAM|SRV)$/.test(segB)) {
      const emb = parseEmbutido(r[20] ?? "");
      grupos.set(gB, {
        grupo: gB, segmento: segB, situacao: "bloqueado",
        prazo_total: numBR(r[14] ?? ""), taxa_adm: numBR(r[15] ?? ""),
        antecipacao_tx: numBR(r[16] ?? ""), taxa_fr: numBR(r[17] ?? ""),
        taxa_seguro: numBR(r[18] ?? ""), plano_light: simNao(r[19] ?? ""),
        pct_embutido: emb.pct, base_embutido: emb.base,
      });
    }
  }

  // 2) Pasta do mês (PDF oficial por grupo) — melhor esforço; não bloqueia o sync
  let pdfsMapeados = 0;
  try {
    const agora = new Date();
    const raiz = await listarPasta(PASTA_RAIZ);
    const anoPasta = raiz.find((e) => e.titulo.includes(`Tabelas de Vendas ${agora.getFullYear()}`));
    if (anoPasta) {
      const meses = await listarPasta(anoPasta.id);
      const alvo = meses.find((e) => e.titulo.toLowerCase().includes(MESES[agora.getMonth()].toLowerCase()));
      if (alvo) {
        const pdfs = await listarPasta(alvo.id);
        for (const p of pdfs) {
          const m = p.titulo.match(/^(\d+)_(?:.*_)?(IMV|AUT|MOT|CAM|SRV)\.pdf$/i);
          if (!m) continue;
          const g = m[1];
          const url = `https://drive.google.com/file/d/${p.id}/view`;
          const ex = grupos.get(g);
          if (ex) {
            if (!ex.pdf_url) { ex.pdf_url = url; pdfsMapeados++; }
          } else {
            grupos.set(g, { grupo: g, segmento: m[2].toUpperCase(), situacao: "liberado", pdf_url: url });
            pdfsMapeados++;
          }
        }
      }
    }
  } catch {
    /* Drive fora do ar não impede a atualização da planilha */
  }

  // 3) Upsert (escopo da org do admin logado)
  const agoraIso = new Date().toISOString();
  const gruposRows = Array.from(grupos.values()).map((g) => ({ ...g, org_id: auth.orgId, atualizado_em: agoraIso }));
  const creditosRows = creditos.map((c) => ({ ...c, org_id: auth.orgId, atualizado_em: agoraIso }));

  const r1 = await admin.from("consorcio_grupos").upsert(gruposRows, { onConflict: "org_id,grupo" });
  if (r1.error) return Response.json({ error: r1.error.message }, { status: 400 });
  const r2 = await admin.from("consorcio_creditos").upsert(creditosRows, { onConflict: "org_id,grupo,cod_bem" });
  if (r2.error) return Response.json({ error: r2.error.message }, { status: 400 });

  return Response.json({ ok: true, grupos: gruposRows.length, creditos: creditosRows.length, pdfs: pdfsMapeados });
}
