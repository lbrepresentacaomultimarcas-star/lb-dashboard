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
import type { Ficha } from "../fichas";

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

/**
 * Célula de uma linha do formulário.
 *
 * `extra` existe porque o formulário real tem "Grupo: ____  Crédito: ____"
 * dentro da MESMA célula — dois rótulos numa caixa só.
 */
export type CelulaFicha = {
  rotulo: string;
  /** Chave no dicionário. Vazio = campo que se preenche à mão (ex.: CHECAGEM). */
  chave?: string;
  extra?: { rotulo: string; chave?: string };
  /** Fração da largura da linha. Sem peso, as células dividem por igual. */
  peso?: number;
  /** Multiplicador de altura — o campo de endereço é mais alto no papel. */
  altura?: number;
};

export type LinhaFicha = { celulas: CelulaFicha[] };

export type ModeloFicha = {
  id: string;
  nome: string;
  versao: number;
  cabecalho: {
    titulo: string;
    subtitulo?: string;
    mostrarLogo: boolean;
    /** Logo da administradora, à direita. */
    logoParceira?: boolean;
    /**
     * Selo do resultado no topo. O formulário de coleta da administradora NÃO
     * tem selo: ele coleta dado, não anuncia decisão. E é por isso que o aviso
     * de "análise interna" também não entra lá — sem afirmar resultado, não há
     * o que ressalvar.
     */
    mostrarSelo?: boolean;
  };
  /**
   * "grid"   — rótulo em cima, valor embaixo (visual de relatório).
   * "tabela" — linhas com borda e "Rótulo: valor" na mesma linha, que é como
   *            o formulário de papel da administradora é.
   */
  estilo?: "grid" | "tabela";
  /** Usado quando estilo === "grid". */
  secoes: SecaoFicha[];
  /** Usado quando estilo === "tabela". */
  tabela?: { titulo: string; linhas: LinhaFicha[] };
  rodape: {
    /** Aviso legal. Nunca deve sair da ficha. */
    aviso: string;
    /** Linhas de assinatura. Vazio = nenhuma. */
    assinaturas: string[];
    mostrarConsultor: boolean;
    mostrarData: boolean;
    /** Bloco institucional do pé do formulário (endereço, telefones…). */
    institucional?: string[];
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

/**
 * Dicionário COMPLETO: análise + ficha final.
 *
 * A ficha guarda só o que o CRM não tinha; nome, CPF, crédito e lance vêm da
 * análise. Juntar aqui é o que permite ao gerador de PDF continuar sem saber
 * de onde cada valor veio.
 */
export function dicionarioCompleto(
  a: Analise,
  f: Ficha | null,
  extras: Record<string, string> = {},
): Record<string, string> {
  const base = dicionarioDaAnalise(a);
  if (!f) return { ...base, ...extras };
  return {
    ...base,
    // consorciado
    rg: texto(f.rg),
    orgao_emissor: texto(f.orgaoEmissor),
    rg_completo: [f.rg, f.orgaoEmissor].filter(Boolean).join(" · ") || "—",
    naturalidade: texto(f.naturalidade),
    nacionalidade: texto(f.nacionalidade),
    estado_civil: texto(f.estadoCivil),
    nome_mae: texto(f.nomeMae),
    nome_pai: texto(f.nomePai),
    // cônjuge
    conjuge_nome: f.temConjuge ? texto(f.conjugeNome) : "Não possui",
    conjuge_cpf: f.temConjuge ? texto(f.conjugeCpf) : "—",
    conjuge_nascimento: f.temConjuge && f.conjugeNascimento ? data(f.conjugeNascimento) : "—",
    // No papel, cônjuge é UMA linha: nome, CPF e nascimento juntos.
    conjuge_completo: f.temConjuge
      ? [f.conjugeNome, f.conjugeCpf, f.conjugeNascimento ? data(f.conjugeNascimento) : null]
          .filter(Boolean)
          .join(" · ") || "—"
      : "Não possui",
    // endereço
    cep: texto(f.cep),
    endereco: texto(f.endereco),
    numero: texto(f.numero),
    complemento: texto(f.complemento),
    bairro: texto(f.bairro),
    cidade: texto(f.cidade) !== "—" ? texto(f.cidade) : base.cidade,
    estado: texto(f.estado),
    endereco_completo:
      [
        [f.endereco, f.numero].filter(Boolean).join(", "),
        f.complemento,
        f.bairro,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    cidade_uf: [f.cidade ?? a.cidade, f.estado].filter(Boolean).join(" / ") || "—",
    // bancários
    banco_tipo_conta: texto(f.bancoTipoConta),
    banco_nome: texto(f.bancoNome),
    banco_agencia: texto(f.bancoAgencia),
    banco_conta: texto(f.bancoConta),
    // operação
    contrato: texto(f.contrato),
    cota: texto(f.cota),
    grupo: texto(f.grupo),
    forma_pagamento: texto(f.formaPagamento),
    valor_entrada: brlOuTraco(f.valorEntrada),
    mes_participacao: texto(f.mesParticipacao),
    // rastro da ficha
    ficha_confirmada_por: texto(f.confirmadaPorNome),
    ficha_confirmada_em: f.confirmadaEm ? dataHora(f.confirmadaEm) : "—",
    resultado_proposta: a.mensagemAprovacao ?? STATUS_ANALISE_INFO[a.status].curto,
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

/**
 * FICHA FINAL DA OPERAÇÃO.
 *
 * Segue a estrutura da ficha de papel descrita no item 13 do pedido — dados do
 * consorciado, cônjuge, endereço, bancários e operação, nessa ordem. Ainda não
 * vi a foto da ficha física: quando ela chegar, é ESTE objeto que muda, e mais
 * nada. Nenhum campo aqui foi inventado — todos vieram da lista escrita.
 */
export const MODELO_FICHA_FINAL: ModeloFicha = {
  id: "coleta-pf-multimarcas-v1",
  nome: "Formulário de Coleta de Dados · Pessoa Física",
  versao: 2,
  estilo: "tabela",
  cabecalho: {
    titulo: "Formulário de Coleta de Dados",
    subtitulo: "Pessoa Física",
    mostrarLogo: false,
    logoParceira: true,
    mostrarSelo: false,
  },
  // O estilo "tabela" usa `tabela`; `secoes` fica vazio de propósito.
  secoes: [],
  tabela: {
    titulo: "Dados do Consorciado",
    linhas: [
      { celulas: [{ rotulo: "Nome do Cliente:", chave: "nome" }] },
      { celulas: [{ rotulo: "E-mail do Cliente:", chave: "email" }] },
      { celulas: [{ rotulo: "Telefone(s) do Cliente:", chave: "telefone" }] },
      { celulas: [{ rotulo: "CPF:", chave: "cpf" }, { rotulo: "Data de Nascimento:", chave: "nascimento" }] },
      { celulas: [{ rotulo: "RG e Órgão Emissor:", chave: "rg_completo" }, { rotulo: "VENDEDOR:", chave: "consultor" }] },
      { celulas: [{ rotulo: "Naturalidade:", chave: "naturalidade" }, { rotulo: "Nacionalidade:", chave: "nacionalidade" }] },
      { celulas: [{ rotulo: "Estado Civil:", chave: "estado_civil" }] },
      { celulas: [{ rotulo: "Nome, CPF e Data de Nascimento do Cônjuge:", chave: "conjuge_completo" }] },
      // CHECAGEM não tem origem no CRM: é a conferência de quem recebe a ficha,
      // feita à mão. Sai em branco, como no papel.
      { celulas: [{ rotulo: "CHECAGEM:" }] },
      { celulas: [{ rotulo: "Nome da Mãe:", chave: "nome_mae" }] },
      { celulas: [{ rotulo: "Nome do Pai:", chave: "nome_pai" }] },
      {
        celulas: [
          { rotulo: "CEP:", chave: "cep", altura: 2 },
          { rotulo: "Endereço completo (rua, número, complemento, bairro):", chave: "endereco_completo", altura: 2 },
        ],
      },
      { celulas: [{ rotulo: "Cidade:", chave: "cidade" }, { rotulo: "Estado:", chave: "estado" }] },
      { celulas: [{ rotulo: "Tipo de conta:", chave: "banco_tipo_conta" }, { rotulo: "Banco:", chave: "banco_nome" }] },
      { celulas: [{ rotulo: "Agência:", chave: "banco_agencia" }, { rotulo: "Conta:", chave: "banco_conta" }] },
      { celulas: [{ rotulo: "CONTRATO:", chave: "contrato" }, { rotulo: "COTA:", chave: "cota" }] },
      {
        celulas: [
          // No papel, Grupo e Crédito dividem a mesma caixa.
          { rotulo: "Grupo:", chave: "grupo", extra: { rotulo: "Crédito:", chave: "credito" } },
          { rotulo: "Forma de pagamento:", chave: "forma_pagamento" },
        ],
      },
      { celulas: [{ rotulo: "Mês que vai participar:", chave: "mes_participacao" }, { rotulo: "Valor de entrada:", chave: "valor_entrada" }] },
    ],
  },
  rodape: {
    // Sem selo de resultado, não há decisão a ressalvar: este documento coleta
    // dados, não afirma aprovação.
    aviso: "",
    assinaturas: [],
    mostrarConsultor: false,
    mostrarData: true,
    institucional: [
      "MULTIMARCAS ADMINISTRADORA DE CONSÓRCIOS LTDA",
      "Av. Amazonas, 126, Centro · Belo Horizonte/MG",
      "Fone: (31) 3036-1666 | Ouvidoria: 0800-722-1666",
      "multimarcasconsorcios.com.br",
    ],
  },
};

/** Um modelo guardado no banco vem como jsonb; validação mínima na entrada. */
export function lerModelo(bruto: unknown): ModeloFicha | null {
  if (!bruto || typeof bruto !== "object") return null;
  const m = bruto as Partial<ModeloFicha>;
  if (!Array.isArray(m.secoes) || !m.cabecalho || !m.rodape) return null;
  return m as ModeloFicha;
}
