/**
 * Temporadas / Campanhas Sazonais — PACOTE de tema (camada 100% visual).
 *
 * Tudo aqui é DADO/visual. Nenhuma regra de negócio depende do tema: o tema só
 * ENTREGA identidade visual, textos, metas (alvo) e efeitos. A lógica do CRM
 * (ranking, performance, índice, produção, comissão, funil) é lida só pra
 * preencher barras — nunca alterada.
 *
 * O "pacote" é um único objeto (`estilo`, salvo em jsonb). Campo novo no futuro
 * = chave nova aqui + campo no formulário. Nunca migration, nunca refatoração.
 */

export type StatusTema = "rascunho" | "ativo" | "inativo" | "arquivado";

/** Métricas EXISTENTES que uma barra pode ler (somente leitura). */
export type MetricaBarra = "faturamento" | "fechamentos" | "producao" | "performance";

export type EfeitoAoAtingir = {
  fogos?: boolean;
  confetes?: boolean;
  brilho?: boolean;
  animacao?: boolean;
  som?: string; // url
};

export type BarraConfig = {
  ativa?: boolean;
  rotulo?: string;
  /** qual número JÁ existente alimenta a barra */
  metrica?: MetricaBarra;
  alvo?: number;
  efeitoAoAtingir?: EfeitoAoAtingir;
};

export type Premiacao = {
  tipo: "medalha" | "trofeu" | "selo" | "badge" | "faixa" | "titulo";
  icone: string; // emoji ou url
  nome: string;
  criterio?: string;
};

/** O PACOTE visual completo do tema (tudo opcional → só sobrescreve o que quiser). */
export type EstiloTema = {
  descricao?: string;

  // — Cores —
  primaria?: string;
  secundaria?: string;
  terciaria?: string;
  ouro?: string;
  prata?: string;
  bronze?: string;
  texto?: string;

  // — Tipografia —
  fontePrincipal?: string;
  fonteSecundaria?: string;
  /** link de webfont (ex.: Google Fonts) carregado só na gamificação */
  fonteUrl?: string;

  // — Assets / imagens (url) ou emoji —
  logo?: string;
  banner?: string;
  background?: string; // css (cor/gradiente) ou url
  podio?: string;
  trofeu?: string;
  medalhas?: { ouro?: string; prata?: string; bronze?: string };
  avatares?: string; // moldura/estilo (preset/url)
  icones?: string;

  // — Componentes (tokens de estilo) —
  componentes?: { botaoRaio?: string; cardRaio?: string; borda?: string };

  // — Efeitos —
  efeitos?: {
    particulas?: boolean;
    confetes?: boolean;
    brilho?: boolean;
    animacoes?: boolean;
    particulasCores?: string[];
  };

  // — Campanha / objetivos (TEXTO + alvo; só motivacional/visual) —
  campanha?: {
    nome?: string;
    descricao?: string;
    textoMotivacional?: string;
    regras?: string;
    metaPrincipal?: string;
  };

  // — Barras de progresso (leem números existentes; efeito ao atingir) —
  barras?: { individual?: BarraConfig; coletiva?: BarraConfig; equipe?: BarraConfig };

  // — Premiações —
  premiacoes?: Premiacao[];

  // — Extras (curingas) —
  sons?: { fanfarra?: string; destaque?: string };
  cssPersonalizado?: string;
};

export type Tema = {
  id: string;
  nome: string;
  slug: string;
  status: StatusTema;
  estilo: EstiloTema;
  dataInicio?: string;
  dataFim?: string;
  criadoEm: string;
};

// ============================================================
// LB PREMIUM — reproduz o visual ATUAL do ranking (fallback seguro).
// ============================================================
export const ESTILO_LB_PREMIUM: EstiloTema = {
  descricao: "Tema padrão LB — identidade premium navy/dourado (visual atual).",
  primaria: "#FACC15",
  secundaria: "#6366f1",
  terciaria: "#a855f7",
  ouro: "#f59e0b",
  prata: "#3b82f6",
  bronze: "#f43f5e",
  texto: "#ffffff",
  background:
    "radial-gradient(ellipse at 25% 0%, rgba(99,102,241,0.16), transparent 55%), radial-gradient(ellipse at 85% 95%, rgba(168,85,247,0.15), transparent 55%), #06070d",
  trofeu: "🏆",
  medalhas: { ouro: "🥇", prata: "🥈", bronze: "🥉" },
  efeitos: { particulas: true, confetes: false, brilho: true, animacoes: true, particulasCores: ["#FACC15", "#818cf8"] },
};

/** Tema usado quando NENHUM tema está ativo (= visual de hoje). */
export const TEMA_LB_PREMIUM: Tema = {
  id: "lb-premium",
  nome: "LB Premium",
  slug: "lb-premium",
  status: "ativo",
  estilo: ESTILO_LB_PREMIUM,
  criadoEm: "",
};

// ============================================================
// Temas padrão (semeados na 1ª vez; depois editáveis pelo painel).
// ============================================================
export type TemaSeed = { nome: string; slug: string; status: StatusTema; estilo: EstiloTema };

export const TEMAS_PADRAO: TemaSeed[] = [
  { nome: "LB Premium", slug: "lb-premium", status: "ativo", estilo: ESTILO_LB_PREMIUM },
  {
    nome: "Copa do Mundo",
    slug: "copa-do-mundo",
    status: "inativo",
    estilo: {
      descricao: "Clima de Copa: gols, artilheiros e troféu.",
      primaria: "#FFD700", secundaria: "#009639", terciaria: "#002776",
      ouro: "#FFD700", prata: "#C0C0C0", bronze: "#CD7F32",
      background: "radial-gradient(ellipse at 50% 0%, rgba(0,150,57,0.18), transparent 60%), #05140a",
      trofeu: "🏆", medalhas: { ouro: "⚽", prata: "🥈", bronze: "🥉" },
      efeitos: { particulas: true, confetes: true, brilho: true, animacoes: true, particulasCores: ["#FFD700", "#009639"] },
      campanha: {
        nome: "Copa do Mundo",
        metaPrincipal: "Faça 6 fechamentos e conquiste a Medalha Artilheiro.",
        textoMotivacional: "Cada venda é um gol. Vai pra cima! ⚽",
      },
      premiacoes: [
        { tipo: "medalha", icone: "⚽", nome: "Artilheiro", criterio: "6+ fechamentos no ciclo" },
        { tipo: "trofeu", icone: "🏆", nome: "Campeão", criterio: "1º lugar do ranking" },
      ],
      barras: { coletiva: { ativa: true, rotulo: "Gols da equipe", metrica: "fechamentos", alvo: 50, efeitoAoAtingir: { confetes: true, fogos: true } } },
    },
  },
  {
    nome: "Natal",
    slug: "natal",
    status: "inativo",
    estilo: {
      descricao: "Espírito natalino — vermelho, verde e neve.",
      primaria: "#c1121f", secundaria: "#1a7431", terciaria: "#FFD700",
      ouro: "#FFD700", prata: "#e5e7eb", bronze: "#b87333",
      background: "radial-gradient(ellipse at 50% 0%, rgba(193,18,31,0.18), transparent 60%), #0a0f0a",
      trofeu: "🎄", medalhas: { ouro: "🎁", prata: "🔔", bronze: "⭐" },
      efeitos: { particulas: true, confetes: true, brilho: true, animacoes: true, particulasCores: ["#ffffff", "#c1121f"] },
      campanha: {
        nome: "Natal",
        metaPrincipal: "Feche R$ 200.000 em cartas até 24/12.",
        textoMotivacional: "Espalhe o espírito natalino fechando negócios! 🎄",
      },
      premiacoes: [
        { tipo: "titulo", icone: "🎅", nome: "Papai Noel das Vendas", criterio: "Maior faturamento do mês" },
        { tipo: "medalha", icone: "🎁", nome: "Bom de Presente", criterio: "Bateu a meta de Natal" },
      ],
      barras: { coletiva: { ativa: true, rotulo: "Meta de Natal", metrica: "faturamento", alvo: 200000, efeitoAoAtingir: { confetes: true, brilho: true } } },
    },
  },
  {
    nome: "Black Friday",
    slug: "black-friday",
    status: "inativo",
    estilo: {
      descricao: "Alto contraste — preto, amarelo e vermelho.",
      primaria: "#FFD500", secundaria: "#FF3B00", terciaria: "#111111",
      ouro: "#FFD500", prata: "#9ca3af", bronze: "#FF3B00",
      background: "radial-gradient(ellipse at 50% 0%, rgba(255,213,0,0.12), transparent 55%), #000000",
      trofeu: "🔥", medalhas: { ouro: "🔥", prata: "⚡", bronze: "💥" },
      efeitos: { particulas: false, confetes: false, brilho: true, animacoes: true, particulasCores: ["#FFD500"] },
      campanha: {
        nome: "Black Friday",
        metaPrincipal: "O maior volume de fechamentos do ano.",
        textoMotivacional: "É agora ou agora. Bora vender! ⚡",
      },
      premiacoes: [
        { tipo: "badge", icone: "🔥", nome: "Em Alta", criterio: "5+ vendas seguidas" },
        { tipo: "selo", icone: "⚡", nome: "Relâmpago", criterio: "Venda mais rápida" },
      ],
    },
  },
  {
    nome: "Ano Novo",
    slug: "ano-novo",
    status: "inativo",
    estilo: {
      descricao: "Virada — dourado, prata e fogos.",
      primaria: "#FFD700", secundaria: "#C0C0C0", terciaria: "#0a0a0a",
      ouro: "#FFD700", prata: "#C0C0C0", bronze: "#b87333",
      background: "radial-gradient(ellipse at 50% 0%, rgba(255,215,0,0.16), transparent 60%), #07070d",
      trofeu: "🎆", medalhas: { ouro: "🎆", prata: "✨", bronze: "⭐" },
      efeitos: { particulas: true, confetes: true, brilho: true, animacoes: true, particulasCores: ["#FFD700", "#ffffff"] },
      campanha: {
        nome: "Ano Novo",
        metaPrincipal: "Comece o ano no topo do ranking.",
        textoMotivacional: "Novo ciclo, novas conquistas! 🎆",
      },
      premiacoes: [
        { tipo: "trofeu", icone: "🎆", nome: "Virada de Chave", criterio: "1º lugar na virada" },
        { tipo: "titulo", icone: "⭐", nome: "MVP do Ano", criterio: "Melhor desempenho do ano" },
      ],
      barras: { equipe: { ativa: true, rotulo: "Meta da virada", metrica: "producao", alvo: 1000000, efeitoAoAtingir: { fogos: true, confetes: true } } },
    },
  },
];

// ============================================================
// Helpers PUROS (testáveis)
// ============================================================

/** Tema ativo da lista, ou o LB Premium (visual atual) se nenhum estiver ativo. */
export function temaAtivoDe(temas: Tema[]): Tema {
  return temas.find((t) => t.status === "ativo") ?? TEMA_LB_PREMIUM;
}

/** Gera slug kebab-case a partir do nome. */
export function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "tema";
}

/** Slug único: acrescenta -2, -3… se já existir (usado ao duplicar). */
export function slugUnico(base: string, existentes: string[]): string {
  const set = new Set(existentes);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
