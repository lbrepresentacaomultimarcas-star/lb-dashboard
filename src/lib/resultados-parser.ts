// Parser dos RESULTADOS OFICIAIS das assembleias da administradora.
// Arquivo puro (zero dependências) pra poder ser testado isolado.
//
// Formato real do texto extraído do PDF (pdf-parse), validado com arquivos
// oficiais de 08.07.2026 e 17.07.2026 cruzando com o resumo "Grupos
// Quantidade de consorciado que ofertaram lances":
//
//   • Cabeçalho de grupo:  "2063 37ª 08.07.26 1781 SE 16 Adendos 1687"
//       grupo · nº da assembleia · data · [cota + UF sorteada] · [adendos] · cotas ativas
//       Variações do meio: "Não Houve" (sem sorteio), "Encerramento 130 a 175",
//       "Todos 511 a 497" (encerramento com todos contemplados).
//   • Linha de segmento logo APÓS o cabeçalho: "AUTO Livre", "IMV Saldo Livre",
//     "IMV Plano Leve Livre", "MOTO Livre", "IMV Contemplados", "SRV Livre"…
//     → define o tipo de bem do grupo; "Livre" abre a lista de lances livres.
//   • O bloco "Fixo" (lances fixos) vem ANTES do cabeçalho do próprio grupo
//     (ordem de extração das colunas do PDF).
//   • Linha de lance vencedor: "951 SE 30,00% 11,82 9.884,33 R$"
//       cota · UF · % do lance · nº de parcelas · VALOR DO LANCE (não é o crédito!)
//   • "Não Houve Oferta" / "Não Houve Saldo" = modalidade sem contemplado.
//
// IMPORTANTE: o resultado oficial informa apenas a UF de cada cota (não a
// cidade) e NÃO divulga valor para contemplações por sorteio. O crédito dos
// lances é ESTIMADO a partir do % do lance (valor ÷ %).

export type TipoContemplacao = "Sorteio" | "Lance Fixo" | "Lance Livre";

export type LinhaImportada = {
  uf: string;
  grupo: string;
  cota: string;
  tipoBem: string | null;
  tipoContemplacao: TipoContemplacao;
  pctLance: number | null;
  parcelasLance: number | null;
  valorLance: number | null;
  creditoEstimado: number | null;
  numAssembleia: number | null;
  dataContemplacao: string | null; // "YYYY-MM-DD"
  mesRef: string; // "YYYY-MM"
  fonte: string | null;
};

export type ResultadoParse = {
  itens: LinhaImportada[]; // apenas Sergipe (UF = SE)
  totalBrasil: number; // contemplações reconhecidas no(s) arquivo(s) inteiro(s)
  totalSE: number;
  grupos: number; // grupos de consórcio lidos
};

const RE_HEADER = /^(\d{3,4})\s+(\d{1,3})[ªa°]\s+(\d{2})\.(\d{2})\.(\d{2,4})\s+(.+)$/;
const RE_WINNER =
  /^(\d{1,4})\s+([A-Z]{2})\s+(\d{1,3}(?:,\d{1,4})?)%\s+(\d{1,3}(?:,\d{1,2})?)\s+((?:\d{1,3}\.)*\d{1,3},\d{2})(?:\s*R\$)?$/;
const RE_SEGMENTO = /^(IMV|AUTO|AUT|MOTO|SRV|SERV|CAM)\b(.*)$/;
const RE_SORTEADA = /^(\d{1,4})\s+([A-Z]{2})\b/;

const BEM_LABEL: Record<string, string> = {
  IMV: "Imóvel",
  AUTO: "Automóvel",
  AUT: "Automóvel",
  MOTO: "Moto",
  SRV: "Serviço",
  SERV: "Serviço",
  CAM: "Caminhão",
};

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

type Vencedor = { cota: string; uf: string; pct: number; parcelas: number; valor: number };

type Grupo = {
  grupo: string;
  numAssembleia: number | null;
  dataIso: string | null;
  sorteada: { cota: string; uf: string } | null;
  bem: string | null;
  fixos: Vencedor[];
  livres: Vencedor[];
};

/** Lê o texto bruto do(s) PDF(s) oficial(is) e devolve as contemplações,
 *  filtrando Sergipe. Aceita vários arquivos concatenados com linhas
 *  "===ARQUIVO ...===" como separador. */
export function parsearResultados(texto: string, mesRefPadrao: string, fonte: string): ResultadoParse {
  const grupos: Grupo[] = [];
  let atual: Grupo | null = null;
  let modo: "fixo" | "livre" | "outro" = "outro";
  let fixosPendentes: Vencedor[] = [];

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.replace(/\s+/g, " ").trim();
    if (!linha) continue;

    // Separador entre arquivos (importação de pasta): zera o estado.
    if (linha.startsWith("===ARQUIVO")) {
      atual = null;
      modo = "outro";
      fixosPendentes = [];
      continue;
    }

    // Seção de resumo no fim do arquivo: para de colecionar.
    if (/^Grupos Quantidade/i.test(linha)) {
      modo = "outro";
      atual = null;
      continue;
    }

    if (linha === "Fixo") {
      modo = "fixo";
      fixosPendentes = [];
      continue;
    }

    const h = RE_HEADER.exec(linha);
    if (h) {
      const [, grupo, ass, dd, mm, aa] = h;
      const ano = aa.length === 2 ? `20${aa}` : aa;
      const resto = h[6];
      const s = RE_SORTEADA.exec(resto);
      atual = {
        grupo,
        numAssembleia: Number(ass) || null,
        dataIso: `${ano}-${mm}-${dd}`,
        sorteada: s ? { cota: s[1], uf: s[2] } : null,
        bem: null,
        fixos: fixosPendentes,
        livres: [],
      };
      fixosPendentes = [];
      grupos.push(atual);
      modo = "outro"; // aguarda a linha de segmento pra saber se abre "Livre"
      continue;
    }

    const seg = RE_SEGMENTO.exec(linha);
    if (seg && atual) {
      atual.bem = BEM_LABEL[seg[1]] ?? seg[1];
      modo = /\bLivre\b/i.test(seg[2]) ? "livre" : "outro";
      continue;
    }

    const w = RE_WINNER.exec(linha);
    if (w) {
      const v: Vencedor = { cota: w[1], uf: w[2], pct: num(w[3]), parcelas: num(w[4]), valor: num(w[5]) };
      if (modo === "fixo") fixosPendentes.push(v);
      else if (modo === "livre" && atual) atual.livres.push(v);
      continue;
    }
    // Demais linhas (cabeçalhos de coluna, "Não Houve…", avisos) são ignoradas.
  }

  // Emite as contemplações de todos os grupos lidos.
  const todas: LinhaImportada[] = [];
  for (const g of grupos) {
    const dataIso = g.dataIso;
    const mesRef = dataIso ? dataIso.slice(0, 7) : mesRefPadrao;
    const base = {
      grupo: g.grupo,
      tipoBem: g.bem,
      numAssembleia: g.numAssembleia,
      dataContemplacao: dataIso,
      mesRef,
      fonte,
    };
    if (g.sorteada) {
      todas.push({
        ...base,
        uf: g.sorteada.uf,
        cota: g.sorteada.cota,
        tipoContemplacao: "Sorteio",
        pctLance: null,
        parcelasLance: null,
        valorLance: null,
        creditoEstimado: null,
      });
    }
    const emitLance = (v: Vencedor, tipo: TipoContemplacao) =>
      todas.push({
        ...base,
        uf: v.uf,
        cota: v.cota,
        tipoContemplacao: tipo,
        pctLance: v.pct,
        parcelasLance: v.parcelas,
        valorLance: v.valor,
        creditoEstimado: v.pct > 0 ? Math.round(v.valor / (v.pct / 100)) : null,
      });
    for (const v of g.fixos) emitLance(v, "Lance Fixo");
    for (const v of g.livres) emitLance(v, "Lance Livre");
  }

  // Dedup (mesmo arquivo importado 2x na mesma pasta, etc.)
  const vistos = new Map<string, LinhaImportada>();
  for (const t of todas) vistos.set(`${t.grupo}|${t.cota}|${t.mesRef}|${t.tipoContemplacao}`, t);
  const unicas = [...vistos.values()];

  const itens = unicas.filter((t) => t.uf === "SE");
  return { itens, totalBrasil: unicas.length, totalSE: itens.length, grupos: grupos.length };
}
