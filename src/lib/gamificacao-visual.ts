/**
 * Camada de APRESENTAÇÃO da gamificação. Funções puras que só LEEM o desempenho
 * já calculado pelo ranking (`pctMeta`, `vendas`). Nada aqui é gravado, e nada
 * interfere em ordenação, metas, comissão ou fechamento.
 *
 * XP = 10 por ponto percentual da meta + 25 por venda. Cada nível = 200 XP.
 */
export const XP_POR_NIVEL = 200;
const MARGEM_SUBINDO = 30;

export type Progresso = {
  xp: number;
  nivel: number;
  xpNoNivel: number;
  pctNivel: number;
  faltam: number;
  subindo: boolean;
};

const positivo = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function progressoJogador(d: { pctMeta: number; vendas: number }): Progresso {
  const xp = Math.round(positivo(d.pctMeta) * 10) + Math.round(positivo(d.vendas)) * 25;
  const xpNoNivel = xp % XP_POR_NIVEL;
  const faltam = XP_POR_NIVEL - xpNoNivel;
  return {
    xp,
    nivel: Math.floor(xp / XP_POR_NIVEL) + 1,
    xpNoNivel,
    pctNivel: (xpNoNivel / XP_POR_NIVEL) * 100,
    faltam,
    subindo: xp > 0 && faltam <= MARGEM_SUBINDO,
  };
}

export type Conquista = { chave: string; icone: string; neon: string; natal: string };

export function conquistasDe(d: { pctMeta: number; vendas: number }, posicao: number): Conquista[] {
  const out: Conquista[] = [];
  if (posicao === 1 && d.vendas > 0) out.push({ chave: "lider", icone: "👑", neon: "Dono da cidade", natal: "Estrela do Natal" });
  if (d.pctMeta >= 150) out.push({ chave: "supermeta", icone: "🚀", neon: "Supermeta", natal: "Trenó turbinado" });
  if (d.pctMeta >= 100) out.push({ chave: "meta", icone: "🏆", neon: "Meta batida", natal: "Meta entregue" });
  else if (d.pctMeta >= 70) out.push({ chave: "ascensao", icone: "⚡", neon: "Em ascensão", natal: "Espírito em alta" });
  if (d.vendas >= 10) out.push({ chave: "v10", icone: "💎", neon: "10 fechamentos", natal: "Saco cheio de presentes" });
  else if (d.vendas >= 5) out.push({ chave: "v5", icone: "🔥", neon: "5 fechamentos", natal: "5 presentes entregues" });
  return out;
}

const TITULOS_NEON = ["Novato", "Piloto", "Especialista", "Elite", "Lenda da Cidade"];

export function tituloNeon(nivel: number) {
  return TITULOS_NEON[Math.min(Math.floor((nivel - 1) / 2), TITULOS_NEON.length - 1)];
}

/* ------------------------- memória de posição ------------------------- */

export type MemoriaPosicoes = {
  dia: string;
  /** posições no fim do último dia visto: a referência do "subiu/desceu" */
  base: Record<string, number>;
  atual: Record<string, number>;
};

/** Mantém a referência do dia anterior e atualiza a foto de hoje. */
export function atualizarMemoria(
  mem: MemoriaPosicoes | null,
  dia: string,
  atual: Record<string, number>,
): MemoriaPosicoes {
  if (!mem) return { dia, base: atual, atual };
  if (mem.dia !== dia) return { dia, base: mem.atual, atual };
  return { ...mem, atual };
}

/** Positivo = subiu. Quem não estava na referência não tem variação. */
export function variacaoPosicao(base: Record<string, number>, id: string, posicao: number) {
  const antes = base[id];
  return antes ? antes - posicao : 0;
}
