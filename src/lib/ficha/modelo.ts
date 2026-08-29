// MODELO da ficha — o desenho como DADO, não como código.
//
// É a separação que o item 11 do pedido exige: quando o modelo real chegar
// (a foto da ficha que hoje é preenchida à mão), muda-se este descritor —
// seções, campos, ordem, cabeçalho, assinaturas — e o gerador de PDF continua
// o mesmo. O gerador NÃO conhece nenhum campo por nome: ele lê seções e
// desenha rótulo + valor.
//
// Quem liga os dois é o DICIONÁRIO: `dicionarioDaAnalise()` transforma uma
// análise num mapa `chave → texto pronto`. Campo novo = uma linha no
// dicionário. Layout novo = um modelo novo. Nunca os dois ao mesmo tempo.

import {
  AVISO_ANALISE_INTERNA,
  STATUS_ANALISE_INFO,
  brlOuTraco,
  pctOuTraco,
  type Analise,
} from "../analises";
import { telefoneBonito } from "../telefone";

/* --------------------------------- Descritor -------------------------------- */

export type CampoFicha = {
  /** Chave no dicionário. Se não existir, o campo sai em branco (não quebra). */
  chave: string;
  rotulo: string;
  /** Quantas colunas de 4 o campo ocupa. Default 1. */
  largura?: 1 | 2 | 3 | 4;
  /** Campo de leitura longa (observações) ganha caixa alta. */
  alto?: boolean;
};

export type SecaoFicha = {
  titulo: string;
  campos: CampoFicha[];
};

export type ModeloFicha = {
  id: string;
  nome: string;
  versao: number;
  cabecalho: {
    titulo: string;
    subtitulo?: string;
    mostrarLogo: boolean;
  };
  secoes: SecaoFicha[];
  rodape: {
    /** Aviso legal. Nunca deve sair da ficha. */
    aviso: string;
    /** Linhas de assinatura. Vazio = nenhuma. */
    assinaturas: string[];
    mostrarConsultor: boolean;
    mostrarData: boolean;
  };
};

/* ------------------------------- Dicionário --------------------------------- */

/**
 * Data sem hora ("1990-04-12") vira meia-noite UTC e, num fuso negativo,
 * RETROCEDE UM DIA. Numa ficha de cliente isso é a data de nascimento errada.
 * Meio-dia local mata a borda — mesmo remédio já usado em resultados.ts.
 */
const data = (iso?: string) => {
  if (!iso) return "—";
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return new Date(soData ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR");
};
const dataHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const texto = (v?: string | null) => (v && v.trim() ? v.trim() : "—");

/**
 * Todos os valores que a ficha pode mostrar, já formatados para leitura.
 *
 * Ponto único de formatação: o PDF não faz conta nem escolhe formato. Assim a
 * tela e o documento nunca discordam sobre quanto é o lance.
 */
export function dicionarioDaAnalise(a: Analise, extras: Record<string, string> = {}): Record<string, string> {
  const info = STATUS_ANALISE_INFO[a.status];
  return {
    // cliente
    nome: texto(a.nome),
    cpf: texto(a.cpf),
    nascimento: a.nascimento ? data(a.nascimento) : "—",
    email: texto(a.email),
    telefone: a.telefone ? telefoneBonito(a.telefone) : "—",
    cidade: texto(a.cidade),

    // objetivo
    objetivo: texto(a.objetivo),

    // operação
    credito: brlOuTraco(a.credito),
    parcela: brlOuTraco(a.parcela),
    modalidade: a.comLance ? "Com lance" : "Sem lance",
    lance_valor: a.comLance ? brlOuTraco(a.lanceValor) : "—",
    lance_pct: a.comLance ? pctOuTraco(a.lancePct) : "—",
    lance_embutido: a.comLance ? brlOuTraco(a.lanceEmbutido) : "—",
    observacoes: texto(a.observacoes),

    // análise interna
    status: info.curto,
    status_longo: info.label,
    decisao_observacao: texto(a.decisaoObservacao),
    decidido_por: texto(a.decididoPorNome),
    decidido_em: a.decididoEm ? dataHora(a.decididoEm) : "—",

    // rastro
    consultor: texto(a.criadoPorNome),
    criado_em: dataHora(a.criadoEm),
    emitido_em: dataHora(new Date().toISOString()),

    ...extras,
  };
}

/* ------------------------------ Modelo padrão ------------------------------- */

/**
 * PROVISÓRIO — e assumidamente.
 *
 * O modelo real ainda vai chegar (foto da ficha usada hoje). Este aqui existe
 * só para o módulo já funcionar ponta a ponta: ele cobre os dados que o CRM
 * tem, na ordem em que uma ficha costuma pedir. Quando o modelo verdadeiro
 * chegar, o que muda é ESTE objeto — nada além dele.
 */
export const MODELO_PROVISORIO: ModeloFicha = {
  id: "provisorio-v1",
  nome: "Ficha LB (provisória)",
  versao: 1,
  cabecalho: {
    titulo: "FICHA DE ANÁLISE",
    subtitulo: "LB Representações · Consórcios",
    mostrarLogo: true,
  },
  secoes: [
    {
      titulo: "Dados do cliente",
      campos: [
        { chave: "nome", rotulo: "Nome completo", largura: 4 },
        { chave: "cpf", rotulo: "CPF", largura: 2 },
        { chave: "nascimento", rotulo: "Data de nascimento", largura: 2 },
        { chave: "telefone", rotulo: "Telefone", largura: 2 },
        { chave: "email", rotulo: "E-mail", largura: 2 },
        { chave: "cidade", rotulo: "Cidade", largura: 4 },
      ],
    },
    {
      titulo: "Objetivo",
      campos: [{ chave: "objetivo", rotulo: "Bem pretendido", largura: 4 }],
    },
    {
      titulo: "Dados da operação",
      campos: [
        { chave: "credito", rotulo: "Valor do crédito", largura: 2 },
        { chave: "parcela", rotulo: "Valor da parcela", largura: 2 },
        { chave: "modalidade", rotulo: "Modalidade", largura: 2 },
        { chave: "lance_valor", rotulo: "Valor do lance", largura: 2 },
        { chave: "lance_pct", rotulo: "Percentual do lance", largura: 2 },
        { chave: "lance_embutido", rotulo: "Lance embutido", largura: 2 },
        { chave: "observacoes", rotulo: "Observações", largura: 4, alto: true },
      ],
    },
    {
      titulo: "Análise interna LB Representações",
      campos: [
        { chave: "status_longo", rotulo: "Resultado", largura: 2 },
        { chave: "decidido_em", rotulo: "Data da análise", largura: 2 },
        { chave: "decidido_por", rotulo: "Analisado por", largura: 2 },
        { chave: "consultor", rotulo: "Consultor responsável", largura: 2 },
        { chave: "decisao_observacao", rotulo: "Parecer", largura: 4, alto: true },
      ],
    },
  ],
  rodape: {
    aviso: AVISO_ANALISE_INTERNA,
    // Vazio de propósito: o pedido diz para não inventar o que ainda não foi
    // definido. Quando a ficha real chegar, as linhas dela entram aqui.
    assinaturas: [],
    mostrarConsultor: true,
    mostrarData: true,
  },
};

/** Um modelo guardado no banco vem como jsonb; validação mínima na entrada. */
export function lerModelo(bruto: unknown): ModeloFicha | null {
  if (!bruto || typeof bruto !== "object") return null;
  const m = bruto as Partial<ModeloFicha>;
  if (!Array.isArray(m.secoes) || !m.cabecalho || !m.rodape) return null;
  return m as ModeloFicha;
}
