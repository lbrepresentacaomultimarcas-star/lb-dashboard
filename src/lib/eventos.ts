"use client";

import { supabaseBrowser, supabaseEnabled } from "./supabase/client";

/**
 * EVENTO / DESAFIO EM DESTAQUE.
 *
 * Campanhas e gincanas que aparecem no topo do Dashboard enquanto estão
 * ativas. Sem evento ativo, o espaço simplesmente não existe — melhor um
 * dashboard limpo que um card vazio dizendo "nenhum desafio no momento".
 */
export type EventoDestaque = {
  id: string;
  nome: string;
  capaUrl?: string;
  frase?: string;
  descricao?: string;
  inicio: string;
  fim: string;
  /** A meta do evento inteiro (ex.: os R$ 8 mi da gincana). Opcional. */
  metaGeral?: number;
  /** A NOSSA meta. É esta que o time vê em destaque. */
  metaLb: number;
  mensagem?: string;
  ativo: boolean;
};

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));
const n = (v: unknown) => (v == null ? undefined : Number(v));

export const fromDb = (r: Row): EventoDestaque => ({
  id: String(r.id),
  nome: String(r.nome),
  capaUrl: s(r.capa_url),
  frase: s(r.frase),
  descricao: s(r.descricao),
  inicio: String(r.inicio),
  fim: String(r.fim),
  metaGeral: n(r.meta_geral),
  metaLb: Number(r.meta_lb ?? 0),
  mensagem: s(r.mensagem),
  ativo: Boolean(r.ativo),
});

export const eventosApi = {
  /**
   * O evento que deve aparecer agora.
   *
   * Ativo E dentro do período: um evento esquecido ligado desde julho não
   * pode continuar cobrando meta em setembro.
   */
  async emDestaque(): Promise<EventoDestaque | null> {
    if (!supabaseEnabled) return null;
    const hoje = new Date().toISOString().slice(0, 10);
    const { data } = await supabaseBrowser()
      .from("eventos_destaque")
      .select("*")
      .eq("ativo", true)
      .lte("inicio", hoje)
      .gte("fim", hoje)
      .order("inicio", { ascending: false })
      .limit(1);
    const linha = (data as Row[] | null)?.[0];
    return linha ? fromDb(linha) : null;
  },

  /** Todos, para a tela de administração (inclui encerrados = histórico). */
  async listar(): Promise<EventoDestaque[]> {
    if (!supabaseEnabled) return [];
    const { data } = await supabaseBrowser()
      .from("eventos_destaque")
      .select("*")
      .order("inicio", { ascending: false });
    return ((data as Row[] | null) ?? []).map(fromDb);
  },
};

/**
 * O placar do desafio.
 *
 * `realizado` chega de fora, calculado com o MESMO `vendasNoPeriodo` +
 * `totalFaturado` que o Dashboard já usa. Nenhuma conta de faturamento é
 * refeita aqui — se a regra mudar lá, muda aqui junto.
 */
export function placar(metaLb: number, realizado: number) {
  const meta = Math.max(0, metaLb);
  const feito = Math.max(0, realizado);
  const faltam = Math.max(0, meta - feito);
  // Sem meta definida não existe percentual: dividir por zero daria Infinity
  // e a barra apareceria cheia sem nada ter acontecido.
  const pct = meta > 0 ? (feito / meta) * 100 : 0;
  return {
    meta,
    realizado: feito,
    faltam,
    pct,
    /** Para a barra: nunca passa de 100, mesmo tendo superado a meta. */
    pctBarra: Math.min(100, pct),
    bateu: meta > 0 && feito >= meta,
  };
}

/**
 * Quantos dias ainda restam do evento. `0` = último dia. Negativo = encerrou.
 *
 * As duas datas são fixadas ao MEIO-DIA antes de subtrair. Meia-noite contra
 * meio-dia dava meio dia de diferença e o arredondamento somava um — o último
 * dia da campanha aparecia como "falta 1 dia". Meio-dia dos dois lados também
 * atravessa horário de verão sem escorregar.
 */
export function diasRestantes(fim: string): number {
  const h = new Date();
  const a = new Date(h.getFullYear(), h.getMonth(), h.getDate(), 12, 0, 0, 0);
  const b = new Date(`${fim}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
