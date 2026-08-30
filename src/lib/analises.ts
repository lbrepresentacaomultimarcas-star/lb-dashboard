"use client";

// Módulo "Análise e Fichas" — camada própria, no mesmo padrão de resultados.ts:
// não entra no store global e não depende dele. Assim este módulo pode crescer
// (ou sair) sem mexer em Pipeline, Central de Leads ou Tráfego.
//
// NÃO tem relação com a Central de Tráfego. São coisas diferentes dentro do
// mesmo CRM: lá é anúncio, aqui é cliente, documento e ficha.

import { supabaseBrowser, supabaseEnabled } from "./supabase/client";
import { chaveTelefone } from "./telefone";

/* ----------------------------------- Tipos ---------------------------------- */

export type StatusAnalise = "em_analise" | "aprovado" | "nao_aprovado";

/** Os dois desfechos possíveis — o que o administrador programa e o que sai. */
export type StatusFinal = Exclude<StatusAnalise, "em_analise">;

/** Tempos oferecidos. Lista, não constante fixa: acrescentar não pede deploy
 *  de schema — `analise_minutos` é inteiro no banco. */
// Os quatro tempos já pedidos em conversas diferentes. Manter todos evita
// tirar um que ele usa; acrescentar outro é editar esta linha.
export const TEMPOS_ANALISE = [5, 7, 10, 15] as const;

/**
 * Frases do resultado NÃO aprovado.
 *
 * Sóbrias de propósito: essa tela também é virada para o cliente, e "recusado"
 * na cara de quem acabou de se abrir com você fecha a porta para a próxima
 * tentativa. "Não aprovada nesta análise" diz a verdade sem constranger.
 */
export const MENSAGENS_REPROVACAO = [
  "PROPOSTA NÃO APROVADA",
  "ANÁLISE NÃO APROVADA",
  "PROPOSTA NÃO APROVADA NESTA ANÁLISE",
  "ANÁLISE CONCLUÍDA — NÃO APROVADA",
  "NÃO FOI POSSÍVEL APROVAR A PROPOSTA",
];

export const STATUS_ANALISE_INFO: Record<
  StatusAnalise,
  { label: string; curto: string; tone: "warn" | "success" | "danger"; cor: string }
> = {
  // O rótulo diz "interna" de propósito: o CRM não aprova consórcio, a
  // administradora aprova. Isso vale na tela e vale no PDF.
  em_analise: { label: "Em análise", curto: "EM ANÁLISE", tone: "warn", cor: "#F59E0B" },
  aprovado: { label: "Aprovado — análise interna LB", curto: "APROVADO", tone: "success", cor: "#10B981" },
  nao_aprovado: { label: "Não aprovado — análise interna LB", curto: "NÃO APROVADO", tone: "danger", cor: "#EF4444" },
};

/** Aviso legal obrigatório em qualquer lugar que mostre o resultado. */
export const AVISO_ANALISE_INTERNA =
  "Esta análise é interna da LB Representações e está sujeita à aprovação definitiva " +
  "conforme as regras e procedimentos da administradora do consórcio.";

/**
 * Objetivos. Lista aberta de propósito: `objetivo` é texto no banco, então
 * acrescentar produto no futuro não pede migration nem deploy de schema.
 */
export const OBJETIVOS = [
  "Carro",
  "Moto",
  "Imóvel",
  "Caminhão",
  "Maquinário",
  "Energia solar",
  "Outros",
] as const;

/**
 * Tipos de documento. Também aberto: o `tipo` é texto, e a tela lê desta
 * lista — acrescentar ou tirar um item aqui muda o checklist inteiro.
 */
export type TipoDocumento = { chave: string; rotulo: string; exigido: boolean };

export const TIPOS_DOCUMENTO: TipoDocumento[] = [
  { chave: "identificacao", rotulo: "Documento de identificação", exigido: true },
  { chave: "renda", rotulo: "Comprovante de renda", exigido: false },
  { chave: "residencia", rotulo: "Comprovante de residência", exigido: false },
  { chave: "outros", rotulo: "Outros documentos", exigido: false },
];

export type Analise = {
  id: string;
  leadId?: string;
  centralLeadId?: string;
  vendedorId?: string;
  criadoPor?: string;
  criadoPorNome?: string;
  nome: string;
  cpf?: string;
  nascimento?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  objetivo?: string;
  credito?: number;
  parcela?: number;
  comLance: boolean;
  lanceValor?: number;
  lancePct?: number;
  lanceEmbutido?: number;
  observacoes?: string;
  status: StatusAnalise;
  decisaoObservacao?: string;
  decididoPorNome?: string;
  decididoEm?: string;
  /** Frase escolhida na aprovação. Fica gravada: o documento de amanhã mostra
   *  a mesma frase que apareceu no dia da decisão. */
  mensagemAprovacao?: string;
  /** Momento em que a proposta virou concluída — é o que libera a ficha. */
  concluidaEm?: string;
  /** Frase escolhida na reprovação. */
  mensagemReprovacao?: string;
  // ---- análise com tempo (etapa "deixar em análise") ----
  analiseInicio?: string;
  /** Instante do término. `!= null` significa análise pendente. */
  analiseFim?: string;
  analiseMinutos?: number;
  /** Resultado programado pelo administrador. */
  analiseResultado?: StatusFinal;
  analisePorNome?: string;
  criadoEm: string;
  atualizadoEm?: string;
};

export type DocumentoAnalise = {
  id: string;
  analiseId: string;
  tipo: string;
  rotulo?: string;
  nomeArquivo?: string;
  caminho: string;
  mime?: string;
  tamanho?: number;
  enviadoPorNome?: string;
  criadoEm: string;
};

export type EventoAnalise = {
  id: string;
  analiseId: string;
  tipo: string;
  campo?: string;
  valorAnterior?: string;
  valorNovo?: string;
  detalhe?: string;
  autorNome?: string;
  criadoEm: string;
};

/* --------------------------------- Cálculos --------------------------------- */

/**
 * Percentual do lance sobre o crédito.
 *
 * Fica aqui, fora da tela, porque é conta que vai para o PDF e para o
 * histórico — se cada lugar calculasse do seu jeito, um dia divergiriam.
 * Crédito zero devolve indefinido em vez de infinito: "—" é honesto,
 * um número inventado não é.
 */
export function calcularLancePct(credito?: number | null, lance?: number | null): number | undefined {
  if (!credito || credito <= 0 || lance == null || lance < 0) return undefined;
  return (lance / credito) * 100;
}

export const brlOuTraco = (v?: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const pctOuTraco = (v?: number | null) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** Quais documentos exigidos ainda faltam. */
export function documentosPendentes(docs: DocumentoAnalise[]): TipoDocumento[] {
  const tem = new Set(docs.map((d) => d.tipo));
  return TIPOS_DOCUMENTO.filter((t) => t.exigido && !tem.has(t.chave));
}

/* ------------------------------ Dados (Supabase) ----------------------------- */

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));
const n = (v: unknown) => (v == null ? undefined : Number(v));

function fromDb(r: Row): Analise {
  return {
    id: String(r.id),
    leadId: s(r.lead_id),
    centralLeadId: s(r.central_lead_id),
    vendedorId: s(r.vendedor_id),
    criadoPor: s(r.criado_por),
    criadoPorNome: s(r.criado_por_nome),
    nome: String(r.nome ?? ""),
    cpf: s(r.cpf),
    nascimento: s(r.nascimento),
    email: s(r.email),
    telefone: s(r.telefone),
    cidade: s(r.cidade),
    objetivo: s(r.objetivo),
    credito: n(r.credito),
    parcela: n(r.parcela),
    comLance: Boolean(r.com_lance),
    lanceValor: n(r.lance_valor),
    lancePct: n(r.lance_pct),
    lanceEmbutido: n(r.lance_embutido),
    observacoes: s(r.observacoes),
    status: String(r.status ?? "em_analise") as StatusAnalise,
    decisaoObservacao: s(r.decisao_observacao),
    decididoPorNome: s(r.decidido_por_nome),
    decididoEm: s(r.decidido_em),
    mensagemAprovacao: s(r.mensagem_aprovacao),
    mensagemReprovacao: s(r.mensagem_reprovacao),
    concluidaEm: s(r.concluida_em),
    analiseInicio: s(r.analise_inicio),
    analiseFim: s(r.analise_fim),
    analiseMinutos: n(r.analise_minutos),
    analiseResultado: r.analise_resultado ? (String(r.analise_resultado) as StatusFinal) : undefined,
    analisePorNome: s(r.analise_por_nome),
    criadoEm: String(r.criado_em),
    atualizadoEm: s(r.atualizado_em),
  };
}

function toDb(a: Partial<Analise>): Row {
  const r: Row = {};
  const põe = (k: string, v: unknown) => {
    if (v !== undefined) r[k] = v === "" ? null : v;
  };
  põe("lead_id", a.leadId);
  põe("central_lead_id", a.centralLeadId);
  põe("vendedor_id", a.vendedorId);
  põe("criado_por", a.criadoPor);
  põe("criado_por_nome", a.criadoPorNome);
  põe("nome", a.nome);
  põe("cpf", a.cpf);
  põe("nascimento", a.nascimento);
  põe("email", a.email);
  põe("telefone", a.telefone);
  põe("cidade", a.cidade);
  põe("objetivo", a.objetivo);
  põe("credito", a.credito);
  põe("parcela", a.parcela);
  põe("com_lance", a.comLance);
  põe("lance_valor", a.lanceValor);
  põe("lance_pct", a.lancePct);
  põe("lance_embutido", a.lanceEmbutido);
  põe("observacoes", a.observacoes);
  põe("status", a.status);
  põe("decisao_observacao", a.decisaoObservacao);
  põe("decidido_por_nome", a.decididoPorNome);
  põe("decidido_em", a.decididoEm);
  põe("mensagem_aprovacao", a.mensagemAprovacao);
  põe("mensagem_reprovacao", a.mensagemReprovacao);
  põe("concluida_em", a.concluidaEm);
  return r;
}

function eventoFromDb(r: Row): EventoAnalise {
  return {
    id: String(r.id),
    analiseId: String(r.analise_id),
    tipo: String(r.tipo),
    campo: s(r.campo),
    valorAnterior: s(r.valor_anterior),
    valorNovo: s(r.valor_novo),
    detalhe: s(r.detalhe),
    autorNome: s(r.autor_nome),
    criadoEm: String(r.criado_em),
  };
}

function docFromDb(r: Row): DocumentoAnalise {
  return {
    id: String(r.id),
    analiseId: String(r.analise_id),
    tipo: String(r.tipo),
    rotulo: s(r.rotulo),
    nomeArquivo: s(r.nome_arquivo),
    caminho: String(r.caminho),
    mime: s(r.mime),
    tamanho: n(r.tamanho),
    enviadoPorNome: s(r.enviado_por_nome),
    criadoEm: String(r.criado_em),
  };
}

/** Grava um evento. Nunca falha alto: histórico não pode derrubar a ação. */
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
    console.error("[analises] falha ao gravar histórico:", e);
  }
}

export const analisesApi = {
  async listar(): Promise<{ data: Analise[]; error: string | null }> {
    if (!supabaseEnabled) return { data: [], error: null };
    const { data, error } = await supabaseBrowser()
      .from("analises")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(2000);
    if (error) {
      console.error("[analises] falha ao ler:", error);
      return { data: [], error: error.message };
    }
    return { data: ((data ?? []) as Row[]).map(fromDb), error: null };
  },

  async criar(a: Partial<Analise> & { nome: string }, autorNome?: string): Promise<Analise> {
    const payload = toDb({
      ...a,
      // A conta é feita aqui e guardada: o PDF de amanhã tem que mostrar o
      // mesmo percentual que a tela mostrou hoje, mesmo que a regra mude.
      lancePct: a.comLance ? calcularLancePct(a.credito, a.lanceValor) : undefined,
      status: a.status ?? "em_analise",
    });
    const { data, error } = await supabaseBrowser().from("analises").insert(payload).select().single();
    if (error) throw error;
    const nova = fromDb(data as Row);
    await registrar(nova.id, { tipo: "criada", detalhe: `Análise criada para ${nova.nome}` }, autorNome);
    return nova;
  },

  async atualizar(id: string, mudancas: Partial<Analise>, autorNome?: string): Promise<void> {
    const payload = toDb({
      ...mudancas,
      lancePct:
        mudancas.comLance === false
          ? undefined
          : calcularLancePct(mudancas.credito, mudancas.lanceValor),
    });
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabaseBrowser().from("analises").update(payload).eq("id", id);
    if (error) throw error;
    await registrar(id, { tipo: "editada", detalhe: "Dados da análise atualizados" }, autorNome);
  },

  /**
   * Decisão do administrador. Guarda quem decidiu e quando — e registra a
   * mudança no histórico ANTES de qualquer coisa poder sobrescrever.
   */
  async decidir(
    id: string,
    status: StatusAnalise,
    observacao: string,
    quem: { nome?: string; mensagem?: string } = {},
  ): Promise<void> {
    const agora = new Date().toISOString();
    const { data: antes } = await supabaseBrowser()
      .from("analises")
      .select("status, concluida_em")
      .eq("id", id)
      .single();
    const jaConcluiu = (antes as Row | null)?.concluida_em;
    const { error } = await supabaseBrowser()
      .from("analises")
      .update({
        status,
        decisao_observacao: observacao.trim() || null,
        decidido_por_nome: quem.nome ?? null,
        decidido_em: agora,
        mensagem_aprovacao: status === "aprovado" ? (quem.mensagem ?? "PROPOSTA APROVADA") : null,
        mensagem_reprovacao: status === "nao_aprovado" ? (quem.mensagem ?? "PROPOSTA NÃO APROVADA") : null,
        // marca a conclusão só na PRIMEIRA aprovação: reaprovar não reescreve
        // a data em que a proposta foi concluída.
        concluida_em: status === "aprovado" ? (jaConcluiu ?? agora) : null,
        // Decisão registrada encerra qualquer análise pendente. É o que mantém
        // o invariante "analise_fim != null <=> análise em andamento".
        analise_inicio: null,
        analise_fim: null,
        analise_minutos: null,
        analise_resultado: null,
        analise_por_nome: null,
      })
      .eq("id", id);
    if (error) throw error;
    await registrar(
      id,
      {
        tipo: "status",
        campo: "Status",
        valorAnterior: (antes as Row | null)?.status
          ? STATUS_ANALISE_INFO[String((antes as Row).status) as StatusAnalise].curto
          : undefined,
        valorNovo: STATUS_ANALISE_INFO[status].curto,
        detalhe: observacao.trim() || undefined,
      },
      quem.nome,
    );
  },

  /**
   * Inicia a análise com tempo.
   *
   * A condição `analise_fim is null` viaja JUNTO do update: se outro
   * administrador já iniciou, a linha não casa e nada é gravado — em vez de
   * dois relógios correndo sobre a mesma proposta. Devolve false nesse caso.
   */
  async iniciarAnalise(
    id: string,
    minutos: number,
    resultado: StatusFinal,
    quem: { nome?: string } = {},
  ): Promise<boolean> {
    const inicio = new Date();
    const fim = new Date(inicio.getTime() + minutos * 60_000);
    const { data, error } = await supabaseBrowser()
      .from("analises")
      .update({
        status: "em_analise",
        analise_inicio: inicio.toISOString(),
        analise_fim: fim.toISOString(),
        analise_minutos: minutos,
        analise_resultado: resultado,
        analise_por_nome: quem.nome ?? null,
      })
      .eq("id", id)
      .is("analise_fim", null)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return false;

    await registrar(
      id,
      {
        tipo: "analise",
        campo: "Análise",
        valorNovo: `${minutos} min`,
        detalhe: `Análise iniciada — ${minutos} minutos — resultado programado: ${STATUS_ANALISE_INFO[resultado].curto}`,
      },
      quem.nome,
    );
    return true;
  },

  /**
   * Revela o resultado programado e o registra como decisão final.
   *
   * `analise_fim is not null` é conferido no próprio update: se outra pessoa
   * já revelou, esta chamada não grava nada e devolve null. Uma análise, uma
   * decisão final.
   */
  async revelar(id: string, quem: { nome?: string } = {}): Promise<StatusFinal | null> {
    const { data } = await supabaseBrowser()
      .from("analises")
      .select("analise_resultado, analise_fim, analise_minutos")
      .eq("id", id)
      .single();
    const linha = data as Row | null;
    const resultado = linha?.analise_resultado ? (String(linha.analise_resultado) as StatusFinal) : null;
    if (!resultado || !linha?.analise_fim) return null;

    // trava de corrida: só quem encontrar a análise ainda pendente prossegue
    const { data: pego } = await supabaseBrowser()
      .from("analises")
      .update({ analise_por_nome: quem.nome ?? null })
      .eq("id", id)
      .not("analise_fim", "is", null)
      .select("id");
    if (!pego || pego.length === 0) return null;

    const minutos = linha.analise_minutos ? `${linha.analise_minutos} min` : "";
    await registrar(
      id,
      {
        tipo: "analise",
        campo: "Análise",
        valorAnterior: minutos || undefined,
        valorNovo: STATUS_ANALISE_INFO[resultado].curto,
        detalhe: `Análise finalizada — ${STATUS_ANALISE_INFO[resultado].curto}`,
      },
      quem.nome,
    );
    // `decidir` limpa os campos do relógio e grava a decisão definitiva.
    await this.decidir(id, resultado, "", {
      nome: quem.nome,
      mensagem: resultado === "aprovado" ? "PROPOSTA APROVADA" : "PROPOSTA NÃO APROVADA",
    });
    return resultado;
  },

  /** Cancela a análise em andamento — sem isso, um tempo escolhido por engano
   *  deixaria a proposta presa até o relógio zerar. */
  async cancelarAnalise(id: string, quem: { nome?: string } = {}): Promise<void> {
    const { error } = await supabaseBrowser()
      .from("analises")
      .update({
        analise_inicio: null,
        analise_fim: null,
        analise_minutos: null,
        analise_resultado: null,
        analise_por_nome: null,
      })
      .eq("id", id)
      .not("analise_fim", "is", null);
    if (error) throw error;
    await registrar(id, { tipo: "analise", detalhe: "Análise cancelada pelo administrador" }, quem.nome);
  },

  async historico(analiseId: string): Promise<EventoAnalise[]> {
    if (!supabaseEnabled) return [];
    const { data } = await supabaseBrowser()
      .from("analise_eventos")
      .select("*")
      .eq("analise_id", analiseId)
      .order("criado_em", { ascending: false })
      .limit(500);
    return ((data ?? []) as Row[]).map(eventoFromDb);
  },

  async documentos(analiseId: string): Promise<DocumentoAnalise[]> {
    if (!supabaseEnabled) return [];
    const { data } = await supabaseBrowser()
      .from("analise_documentos")
      .select("*")
      .eq("analise_id", analiseId)
      .order("criado_em", { ascending: false });
    return ((data ?? []) as Row[]).map(docFromDb);
  },

  /** Registra no histórico que a ficha foi gerada — item 7 pede rastro. */
  async registrarFicha(analiseId: string, autorNome?: string) {
    await registrar(analiseId, { tipo: "ficha", detalhe: "Ficha gerada em PDF" }, autorNome);
  },
};

/** Reexporta para quem monta a ficha a partir de um lead. */
export { chaveTelefone };
