"use client";

// FICHA FINAL DA OPERAÇÃO — a última etapa, depois da proposta concluída.
//
// Substitui a ficha de papel. Guarda SÓ o que o CRM ainda não tinha (RG,
// filiação, cônjuge, endereço, dados bancários, contrato, cota, grupo). Nome,
// CPF, telefone, crédito, parcela e lance continuam morando na análise — a
// ficha lê de lá em vez de copiar, para não existir um segundo cadastro do
// mesmo cliente.

import { supabaseBrowser, supabaseEnabled } from "./supabase/client";
import type { Analise } from "./analises";

/* ----------------------------------- Tipos ---------------------------------- */

export type StatusFicha = "rascunho" | "confirmada";

export type Ficha = {
  id: string;
  analiseId: string;
  // consorciado
  rg?: string;
  orgaoEmissor?: string;
  naturalidade?: string;
  nacionalidade?: string;
  estadoCivil?: string;
  nomeMae?: string;
  nomePai?: string;
  // cônjuge
  /** Linha CHECAGEM do formulário — o mesmo campo que sai no PDF. */
  checagem?: string;
  temConjuge: boolean;
  conjugeNome?: string;
  conjugeCpf?: string;
  conjugeNascimento?: string;
  // endereço
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  // bancários — como o consorciado RECEBE (devolução), não como ele paga
  bancoMeio: MeioBancario;
  bancoTipoConta?: string;
  bancoNome?: string;
  bancoAgencia?: string;
  bancoConta?: string;
  pixTipo?: string;
  pixChave?: string;
  // operação
  contrato?: string;
  cota?: string;
  grupo?: string;
  /**
   * Valor do crédito contratado.
   *
   * O formulário de papel tem "Grupo: ___ Crédito: ___" na mesma caixa, mas
   * não havia onde digitar: o PDF puxava o crédito da ANÁLISE, e quando a
   * análise vinha sem valor a linha saía em branco na ficha impressa.
   *
   * Fica aqui junto de contrato/cota/grupo porque é dado da OPERAÇÃO
   * fechada — e não sobrescreve a análise, que é o registro de como a
   * proposta foi avaliada. Vazio aqui = usa o da análise.
   */
  credito?: number;
  formaPagamento?: string;
  valorEntrada?: number;
  mesParticipacao?: string;
  // estado
  status: StatusFicha;
  confirmadaPorNome?: string;
  confirmadaEm?: string;
  pdfGeradoEm?: string;
  pdfGeracoes: number;
  criadoPorNome?: string;
  criadoEm: string;
  atualizadoEm?: string;
};

/* ------------------------------ Listas abertas ------------------------------ */
// Todas são texto no banco de propósito: acrescentar opção não pede migration.

export const ESTADOS_CIVIS = ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"];

export const TIPOS_CONTA = ["Conta corrente", "Conta poupança", "Conta salário", "Conta pagamento"];

/**
 * Onde o consorciado RECEBE.
 *
 * Não confundir com `formaPagamento`, que é como ele PAGA as parcelas. As duas
 * podem dizer "PIX" ao mesmo tempo e estarem certas: uma é saída, a outra é
 * entrada. Por isso são campos separados, e a forma de pagamento não foi
 * tocada.
 */
export type MeioBancario = "conta" | "pix";

export const MEIOS_BANCARIOS: { chave: MeioBancario; rotulo: string }[] = [
  { chave: "conta", rotulo: "Conta bancária" },
  { chave: "pix", rotulo: "Pix" },
];

export const TIPOS_CHAVE_PIX = [
  { chave: "cpf", rotulo: "CPF" },
  { chave: "cnpj", rotulo: "CNPJ" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "telefone", rotulo: "Telefone" },
  { chave: "aleatoria", rotulo: "Chave aleatória" },
];

export const rotuloChavePix = (c?: string) =>
  TIPOS_CHAVE_PIX.find((t) => t.chave === c)?.rotulo ?? "";

export const FORMAS_PAGAMENTO = ["Boleto", "Débito em conta", "PIX", "Cartão de crédito", "Outro"];

export const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

/**
 * Frases do resultado aprovado.
 *
 * A escolhida fica gravada NA análise: o documento de amanhã tem que mostrar a
 * mesma frase que apareceu no dia da decisão, mesmo que esta lista mude.
 */
export const MENSAGENS_APROVACAO = [
  "PROPOSTA APROVADA",
  "PROPOSTA APROVADA COM SUCESSO",
  "PROPOSTA CONCLUÍDA COM SUCESSO",
  "LANCE APROVADO",
  "PROPOSTA APROVADA COM LANCE INCLUSO",
];

/* --------------------------------- Regras ---------------------------------- */

/** A ficha só nasce depois da proposta concluída (item 10 do pedido). */
export function podeCriarFicha(a: Analise): boolean {
  return a.status === "aprovado";
}

/** O que ainda falta preencher para a ficha fazer sentido no administrativo. */
export function camposFaltando(a: Analise, f: Ficha | null): string[] {
  const falta: string[] = [];
  if (!a.cpf?.trim()) falta.push("CPF");
  if (!a.nascimento) falta.push("Data de nascimento");
  if (!a.telefone?.trim()) falta.push("Telefone");
  if (!f) return falta;
  if (!f.rg?.trim()) falta.push("RG");
  if (!f.nomeMae?.trim()) falta.push("Nome da mãe");
  if (!f.cep?.trim()) falta.push("CEP");
  if (!f.endereco?.trim()) falta.push("Endereço");
  if (f.bancoMeio === "pix") {
    if (!f.pixTipo) falta.push("Tipo de chave Pix");
    if (!f.pixChave?.trim()) falta.push("Chave Pix");
  } else if (!f.bancoNome?.trim()) {
    falta.push("Banco");
  }
  if (!f.contrato?.trim()) falta.push("Contrato");
  if (!f.grupo?.trim()) falta.push("Grupo");
  if (!f.cota?.trim()) falta.push("Cota");
  return falta;
}

/* ------------------------------ Dados (Supabase) ---------------------------- */

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));
const n = (v: unknown) => (v == null ? undefined : Number(v));

function fromDb(r: Row): Ficha {
  return {
    id: String(r.id),
    analiseId: String(r.analise_id),
    rg: s(r.rg),
    orgaoEmissor: s(r.orgao_emissor),
    naturalidade: s(r.naturalidade),
    nacionalidade: s(r.nacionalidade),
    estadoCivil: s(r.estado_civil),
    nomeMae: s(r.nome_mae),
    nomePai: s(r.nome_pai),
    checagem: s(r.checagem),
    temConjuge: Boolean(r.tem_conjuge),
    conjugeNome: s(r.conjuge_nome),
    conjugeCpf: s(r.conjuge_cpf),
    conjugeNascimento: s(r.conjuge_nascimento),
    cep: s(r.cep),
    endereco: s(r.endereco),
    numero: s(r.numero),
    complemento: s(r.complemento),
    bairro: s(r.bairro),
    cidade: s(r.cidade),
    estado: s(r.estado),
    bancoMeio: (String(r.banco_meio ?? "conta") as MeioBancario),
    bancoTipoConta: s(r.banco_tipo_conta),
    bancoNome: s(r.banco_nome),
    bancoAgencia: s(r.banco_agencia),
    bancoConta: s(r.banco_conta),
    pixTipo: s(r.pix_tipo),
    pixChave: s(r.pix_chave),
    contrato: s(r.contrato),
    cota: s(r.cota),
    grupo: s(r.grupo),
    credito: n(r.credito),
    formaPagamento: s(r.forma_pagamento),
    valorEntrada: n(r.valor_entrada),
    mesParticipacao: s(r.mes_participacao),
    status: (String(r.status ?? "rascunho") as StatusFicha),
    confirmadaPorNome: s(r.confirmada_por_nome),
    confirmadaEm: s(r.confirmada_em),
    pdfGeradoEm: s(r.pdf_gerado_em),
    pdfGeracoes: Number(r.pdf_geracoes ?? 0),
    criadoPorNome: s(r.criado_por_nome),
    criadoEm: String(r.criado_em),
    atualizadoEm: s(r.atualizado_em),
  };
}

function toDb(f: Partial<Ficha>): Row {
  const r: Row = {};
  const põe = (k: string, v: unknown) => {
    if (v !== undefined) r[k] = v === "" ? null : v;
  };
  põe("rg", f.rg); põe("orgao_emissor", f.orgaoEmissor);
  põe("naturalidade", f.naturalidade); põe("nacionalidade", f.nacionalidade);
  põe("estado_civil", f.estadoCivil); põe("nome_mae", f.nomeMae); põe("nome_pai", f.nomePai);
  põe("checagem", f.checagem);
  põe("tem_conjuge", f.temConjuge); põe("conjuge_nome", f.conjugeNome);
  põe("conjuge_cpf", f.conjugeCpf); põe("conjuge_nascimento", f.conjugeNascimento);
  põe("cep", f.cep); põe("endereco", f.endereco); põe("numero", f.numero);
  põe("complemento", f.complemento); põe("bairro", f.bairro);
  põe("cidade", f.cidade); põe("estado", f.estado);
  põe("banco_tipo_conta", f.bancoTipoConta); põe("banco_nome", f.bancoNome);
  põe("banco_agencia", f.bancoAgencia); põe("banco_conta", f.bancoConta);
  põe("banco_meio", f.bancoMeio); põe("pix_tipo", f.pixTipo); põe("pix_chave", f.pixChave);
  põe("contrato", f.contrato); põe("cota", f.cota); põe("grupo", f.grupo);
  põe("credito", f.credito);
  põe("forma_pagamento", f.formaPagamento); põe("valor_entrada", f.valorEntrada);
  põe("mes_participacao", f.mesParticipacao);
  põe("status", f.status);
  return r;
}

async function registrar(
  analiseId: string,
  ev: { tipo: string; campo?: string; valorAnterior?: string; valorNovo?: string; detalhe?: string },
  autorNome?: string,
) {
  if (!supabaseEnabled) return;
  try {
    await supabaseBrowser().from("analise_eventos").insert({
      analise_id: analiseId,
      tipo: ev.tipo,
      campo: ev.campo ?? null,
      valor_anterior: ev.valorAnterior ?? null,
      valor_novo: ev.valorNovo ?? null,
      detalhe: ev.detalhe ?? null,
      autor_nome: autorNome ?? null,
    });
  } catch (e) {
    console.error("[fichas] falha ao gravar histórico:", e);
  }
}

export const fichasApi = {
  async obter(analiseId: string): Promise<Ficha | null> {
    if (!supabaseEnabled) return null;
    const { data } = await supabaseBrowser().from("fichas").select("*").eq("analise_id", analiseId).maybeSingle();
    return data ? fromDb(data as Row) : null;
  },

  /**
   * Cria a ficha já com o que o CRM sabe.
   *
   * O consultor não redigita nada do que existe: a cidade vem da análise, e o
   * que não existe nasce em branco para ele completar.
   */
  async criar(a: Analise, autorNome?: string): Promise<Ficha> {
    const { data, error } = await supabaseBrowser()
      .from("fichas")
      .insert({
        analise_id: a.id,
        cidade: a.cidade ?? null,
        criado_por_nome: autorNome ?? null,
        status: "rascunho",
      })
      .select()
      .single();
    if (error) throw error;
    await registrar(a.id, { tipo: "ficha", detalhe: "Ficha final criada" }, autorNome);
    return fromDb(data as Row);
  },

  async salvar(ficha: Ficha, mudancas: Partial<Ficha>, autorNome?: string): Promise<void> {
    const payload = toDb(mudancas);
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabaseBrowser().from("fichas").update(payload).eq("id", ficha.id);
    if (error) throw error;
    await registrar(ficha.analiseId, { tipo: "ficha", detalhe: "Ficha editada" }, autorNome);
  },

  /** Sem confirmação não sai PDF definitivo (item 8). */
  async confirmar(ficha: Ficha, autorNome?: string): Promise<void> {
    const agora = new Date().toISOString();
    const { error } = await supabaseBrowser()
      .from("fichas")
      .update({ status: "confirmada", confirmada_por_nome: autorNome ?? null, confirmada_em: agora })
      .eq("id", ficha.id);
    if (error) throw error;
    await registrar(
      ficha.analiseId,
      { tipo: "ficha", campo: "Ficha", valorAnterior: "Rascunho", valorNovo: "Confirmada", detalhe: "Dados conferidos pelo consultor" },
      autorNome,
    );
  },

  /** Volta para rascunho para corrigir algo depois de confirmada. */
  async reabrir(ficha: Ficha, autorNome?: string): Promise<void> {
    const { error } = await supabaseBrowser().from("fichas").update({ status: "rascunho" }).eq("id", ficha.id);
    if (error) throw error;
    await registrar(
      ficha.analiseId,
      { tipo: "ficha", campo: "Ficha", valorAnterior: "Confirmada", valorNovo: "Rascunho", detalhe: "Reaberta para edição" },
      autorNome,
    );
  },

  /** Cada geração fica registrada — a segunda em diante é "regerado". */
  async registrarPdf(ficha: Ficha, autorNome?: string): Promise<number> {
    const vezes = ficha.pdfGeracoes + 1;
    await supabaseBrowser()
      .from("fichas")
      .update({ pdf_gerado_em: new Date().toISOString(), pdf_geracoes: vezes })
      .eq("id", ficha.id);
    await registrar(
      ficha.analiseId,
      { tipo: "pdf", detalhe: vezes === 1 ? "PDF da ficha gerado" : `PDF da ficha regerado (${vezes}ª vez)` },
      autorNome,
    );
    return vezes;
  },
};
