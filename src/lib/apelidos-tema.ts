/**
 * Catálogo e sugestão de apelidos. Sugerir NÃO é atribuir: nada aqui aparece no
 * ranking até o administrador aprovar ou o consultor escolher uma opção
 * autorizada. A sugestão usa só números comerciais e o texto de preferência que
 * o próprio consultor informou, nunca a fotografia.
 */
export type TemaApelido = "natal" | "neon";

type Item = { nome: string; icone: string; tags: string[] };

export const APELIDOS: Record<TemaApelido, Item[]> = {
  natal: [
    { nome: "Papai Noel", icone: "🎅", tags: ["classico", "lider", "natal"] },
    { nome: "Mamãe Noel", icone: "🤶", tags: ["classico", "lider", "natal"] },
    { nome: "Rei do Natal", icone: "👑", tags: ["lider", "meta", "rei"] },
    { nome: "Rainha do Natal", icone: "👑", tags: ["lider", "meta", "rainha"] },
    { nome: "Duende das Vendas", icone: "🧝", tags: ["fechamentos", "divertido", "duende"] },
    { nome: "Rena Turbo", icone: "🦌", tags: ["fechamentos", "velocidade", "rena", "rapido"] },
    { nome: "Estrela de Natal", icone: "⭐", tags: ["meta", "destaque", "estrela"] },
    { nome: "Lenda do Trenó", icone: "🛷", tags: ["lider", "velocidade", "treno", "lenda"] },
    { nome: "Guardião dos Presentes", icone: "🎁", tags: ["carteira", "cuidado", "presente"] },
    { nome: "Comandante do Natal", icone: "🎖️", tags: ["lider", "equipe", "comando"] },
    { nome: "Mestre das Contemplações", icone: "🏅", tags: ["consorcio", "contemplacao", "mestre"] },
    { nome: "Fábrica de Sonhos", icone: "✨", tags: ["consorcio", "sonho", "cliente"] },
  ],
  neon: [
    { nome: "Chefão das Vendas", icone: "🕶️", tags: ["lider", "meta", "chefe"] },
    { nome: "Rainha da Neon City", icone: "👑", tags: ["lider", "meta", "rainha"] },
    { nome: "Rei da Neon City", icone: "👑", tags: ["lider", "meta", "rei"] },
    { nome: "Máquina de Fechamentos", icone: "⚙️", tags: ["fechamentos", "volume", "maquina"] },
    { nome: "Magnata do Crédito", icone: "💎", tags: ["consorcio", "credito", "valor"] },
    { nome: "Lenda do Asfalto", icone: "🏁", tags: ["velocidade", "carro", "lenda"] },
    { nome: "Piloto de Metas", icone: "✈️", tags: ["meta", "piloto", "velocidade"] },
    { nome: "Elite Comercial", icone: "⚡", tags: ["meta", "destaque", "elite"] },
    { nome: "Lenda da Neon City", icone: "🌆", tags: ["lider", "destaque", "lenda"] },
    { nome: "Comandante Neon", icone: "🎖️", tags: ["lider", "equipe", "comando"] },
  ],
};

export function iconeApelido(tema: TemaApelido, nome: string) {
  return APELIDOS[tema].find((a) => a.nome === nome)?.icone ?? (tema === "natal" ? "🎄" : "⚡");
}

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function sugerirApelidos(
  tema: TemaApelido,
  perfil: { pctMeta?: number; vendas?: number; preferencia?: string },
  limite = 4,
): string[] {
  const pref = normalizar(perfil.preferencia ?? "");
  const pontos = (a: Item) => {
    let p = 0;
    if ((perfil.pctMeta ?? 0) >= 100 && a.tags.includes("meta")) p += 3;
    if ((perfil.vendas ?? 0) >= 5 && a.tags.includes("fechamentos")) p += 3;
    if (pref) {
      if (normalizar(a.nome).split(/\s+/).some((w) => w.length > 3 && pref.includes(w))) p += 6;
      if (a.tags.some((t) => pref.includes(t))) p += 5;
    }
    return p;
  };
  return APELIDOS[tema]
    .map((a, i) => ({ a, i, p: pontos(a) }))
    .sort((x, y) => y.p - x.p || x.i - y.i)
    .slice(0, limite)
    .map((x) => x.a.nome);
}
