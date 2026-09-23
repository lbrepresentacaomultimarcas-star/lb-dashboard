import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cicloDeData, cicloPorChave, setDeFeriados, type ConfigProducao } from "@/lib/ciclo";
import { caixaDe, planoDoMes, projetar, diagnosticar, resumoDoMes } from "@/lib/financeiro";
import {
  chaveDoCiclo,
  ciclosEmVolta,
  CONFIG_RECEBIMENTO_PADRAO,
  type ConfigRecebimento,
} from "@/lib/producao-ciclos";

/**
 * FINANCEIRO ESTRATÉGICO — a única porta de entrada.
 *
 * `requireAdmin` em TODAS as ações, e as três tabelas têm RLS ligada sem
 * policy: nem o navegador de um admin lê o financeiro direto. É dinheiro da
 * empresa — vendedor não vê nem pelo DevTools.
 *
 * Esta rota NÃO recalcula faturamento de venda. O faturamento REAL vem de
 * `vendas` pelo mesmo `cicloDeData` que o ranking usa, e é devolvido junto
 * como referência. O que o admin informa é o faturamento que ELE considera
 * realizado — os dois aparecem lado a lado na tela, e a diferença é
 * informação, não erro.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Lancamento = {
  id: string;
  chave: string;
  direcao: "entrada" | "saida";
  tipo: "fixo" | "variavel" | "recebimento";
  descricao: string;
  categoria: string;
  valor: number;
  vencimento: string;
  operacao: boolean;
  gasto_fixo_id: string | null;
  venda_id: string | null;
  status: "pendente" | "liquidado";
  liquidado_em: string | null;
  valor_pago: number | null;
  forma_pagamento: string | null;
  observacao: string | null;
};

type Fixo = {
  id: string;
  nome: string;
  valor: number;
  dia_vencimento: number;
  categoria: string;
  observacao: string | null;
  ativo: boolean;
};

/** Recebimento REAL de um ciclo de produção (tabela `fin_ciclos`). */
type CicloRow = {
  ciclo: string;
  previsto: number | null;
  recebido: number;
  recebido_em: string | null;
  observacao: string | null;
};

const n = (v: unknown) => Number(v ?? 0) || 0;
const cent = (v: number) => Math.round(v * 100) / 100;
const CHAVE_CICLO = /^\d{4}-(0[1-9]|1[0-2])-[AB]$/;
const hoje = () => new Date().toISOString().slice(0, 10);

/** Atrasado é DERIVADO: pendente e o vencimento já passou. */
export type Situacao = "pendente" | "liquidado" | "atrasado";
const situacaoDe = (l: Lancamento): Situacao =>
  l.status === "liquidado" ? "liquidado" : l.vencimento < hoje() ? "atrasado" : "pendente";

/** A config do ciclo de produção — a MESMA do ranking e das metas. */
async function cicloConfig(db: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const [{ data: cfg }, { data: fer }] = await Promise.all([
    db.from("config_producao").select("*").eq("org_id", orgId).maybeSingle(),
    db.from("feriados").select("data").eq("org_id", orgId),
  ]);
  const c = cfg as Record<string, unknown> | null;
  const config: ConfigProducao = {
    diaBase: Number(c?.dia_base ?? 20),
    prorrogarDiaUtil: c?.prorrogar_dia_util !== false,
    considerarSabDom: c?.considerar_sab_dom !== false,
    considerarFeriados: c?.considerar_feriados === true,
    inicioProximoCiclo: (c?.inicio_proximo_ciclo as ConfigProducao["inicioProximoCiclo"]) ?? "dia_seguinte",
    dataInicioRegra: String(c?.data_inicio_regra ?? "9999-12-31"),
  };
  const feriados = setDeFeriados(((fer ?? []) as { data: string }[]).map((f) => f.data));
  return { config, feriados };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * O dia do vencimento DENTRO da janela do ciclo.
 *
 * O ciclo fecha dia 20, então "2026-09" vai de 21/08 a 21/09 e cruza dois meses
 * do calendário. Montar a data como `2026-09-<dia>` jogava o aluguel do dia 25
 * para 25/09 — fora do ciclo de setembro, que termina no dia 21. Resultado: a
 * tela listava a despesa em setembro e a previsão a cobrava em outubro.
 */
function vencimentoNoCiclo(dia: number, inicio: Date, fim: Date): string {
  const candidatos = [inicio, fim].map((ref) => {
    const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    return new Date(ref.getFullYear(), ref.getMonth(), Math.min(Math.max(1, dia), ultimo));
  });
  return iso(candidatos.find((d) => d >= inicio && d <= fim) ?? fim);
}

/** "2026-09" + 1 = "2026-10". */
function proximaChave(chave: string, passos: number): string {
  const [y, m] = chave.split("-").map(Number);
  const d = new Date(y, m - 1 + passos, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------- GET */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const db = supabaseAdmin();
  const orgId = auth.orgId;

  const { config, feriados } = await cicloConfig(db, orgId);
  const chave = req.nextUrl.searchParams.get("chave") || cicloDeData(new Date(), config, feriados);

  /*
   * As duas tabelas novas (`fin_ciclos` e `fin_config`) podem ainda não existir
   * se a migration não foi rodada. Nesse caso `data` vem null e o financeiro
   * segue funcionando sem a parte de ciclos, em vez de quebrar a tela inteira.
   */
  const [{ data: mesRow }, { data: lanc }, { data: fixos }, { data: vendas }, { data: ciclosRows }, { data: cfgCiclosRow }] =
    await Promise.all([
      db.from("fin_mes").select("*").eq("org_id", orgId).eq("chave", chave).maybeSingle(),
      db.from("fin_lancamentos").select("*").eq("org_id", orgId).order("vencimento"),
      db.from("fin_gastos_fixos").select("*").eq("org_id", orgId).order("nome"),
      db.from("vendas").select("valor, data, status").eq("org_id", orgId),
      db.from("fin_ciclos").select("*").eq("org_id", orgId),
      db.from("fin_config").select("*").eq("org_id", orgId).maybeSingle(),
    ]);

  const todos = (lanc ?? []) as Lancamento[];
  const doMes = todos.filter((l) => l.chave === chave);
  const mes = (mesRow ?? {}) as Record<string, unknown>;

  const vendasValidas = ((vendas ?? []) as { valor: unknown; data: string; status: string | null }[]).filter(
    (v) => (v.status ?? "Confirmada") !== "Cancelada",
  );

  // Faturamento REAL das vendas, pelo mesmo ciclo do ranking. Referência.
  const faturamentoVendas = vendasValidas
    .filter((v) => cicloDeData(v.data, config, feriados) === chave)
    .reduce((a, v) => a + n(v.valor), 0);

  /*
   * PRODUÇÃO E RECEBIMENTO — a regra real da empresa: dois ciclos por mês.
   *
   *   ciclo A (20→5)   recebe no dia 21/22, ou no próximo dia útil
   *   ciclo B (5→20)   recebe até o 5º dia útil do mês seguinte
   *
   * Cada venda entra em UM ciclo só (`chaveDoCiclo` olha o dia do mês e as
   * faixas não se sobrepõem). O VENDIDO é calculado de `vendas`, a PREVISÃO é
   * calculada pela regra, e o RECEBIDO vem de `fin_ciclos` — porque quanto
   * entrou, e em que dia, é fato, não dedução. Data de venda nunca vira data
   * de recebimento.
   */
  const cfgRec: ConfigRecebimento = {
    diaRecebimentoA: Number(
      (cfgCiclosRow as Record<string, unknown> | null)?.dia_recebimento_a ??
        CONFIG_RECEBIMENTO_PADRAO.diaRecebimentoA,
    ),
    diasUteisB: Number(
      (cfgCiclosRow as Record<string, unknown> | null)?.dias_uteis_recebimento_b ??
        CONFIG_RECEBIMENTO_PADRAO.diasUteisB,
    ),
  };

  const vendidoPorCiclo = new Map<string, { total: number; qtd: number }>();
  for (const v of vendasValidas) {
    const ch = chaveDoCiclo(v.data);
    const atual = vendidoPorCiclo.get(ch) ?? { total: 0, qtd: 0 };
    atual.total = cent(atual.total + n(v.valor));
    atual.qtd += 1;
    vendidoPorCiclo.set(ch, atual);
  }
  const porCiclo = new Map(((ciclosRows ?? []) as CicloRow[]).map((c) => [c.ciclo, c]));

  /*
   * Junta o calculado (vendido, data da previsão) com o confirmado (previsto
   * pela administradora e recebido de fato).
   *
   * `previsto` NÃO tem chute: fica null até alguém informar. O campo `valor` de
   * uma venda de consórcio é o CRÉDITO vendido (R$ 1,2 milhão num ciclo), e a
   * empresa recebe comissão sobre isso — usar o crédito como previsão de
   * recebimento colocaria milhões em "ainda vou receber". Melhor mostrar "não
   * informado" do que um número errado com cara de certo.
   */
  const montarCiclo = (c: ReturnType<typeof ciclosEmVolta>[number]) => {
    const v = vendidoPorCiclo.get(c.chave) ?? { total: 0, qtd: 0 };
    const row = porCiclo.get(c.chave);
    const previsto = row?.previsto != null ? n(row.previsto) : null;
    const recebido = n(row?.recebido);
    return {
      chave: c.chave,
      letra: c.letra,
      rotulo: c.rotulo,
      regra: c.regra,
      inicio: iso(c.inicio),
      fim: iso(c.fim),
      previsao: iso(c.previsao),
      vendido: v.total,
      qtdVendas: v.qtd,
      previsto,
      previstoInformado: previsto != null,
      recebido,
      recebidoEm: row?.recebido_em ?? null,
      aReceber: previsto == null ? 0 : cent(Math.max(0, previsto - recebido)),
      quitado: previsto != null && recebido > 0 && recebido + 0.005 >= previsto,
      observacao: row?.observacao ?? null,
    };
  };

  const agoraData = new Date();
  const ciclos = ciclosEmVolta(agoraData, feriados, cfgRec, 2, 2).map(montarCiclo);
  const cicloAtualChave = chaveDoCiclo(agoraData);

  /*
   * "Ainda a receber" soma TODOS os ciclos em aberto, não só os que a tela
   * mostra — e só entra na conta o ciclo que tem previsão INFORMADA. Ciclo sem
   * previsão informada não vira zero nem vira chute: fica de fora, e a tela diz
   * quantos são.
   */
  const chavesConhecidas = new Set<string>([...vendidoPorCiclo.keys(), ...porCiclo.keys()]);
  let aReceberTotal = 0;
  let recebidoTotal = 0;
  let ciclosSemPrevisao = 0;
  for (const ch of chavesConhecidas) {
    const row = porCiclo.get(ch);
    const recebido = n(row?.recebido);
    recebidoTotal = cent(recebidoTotal + recebido);
    if (row?.previsto == null) {
      if (recebido === 0) ciclosSemPrevisao += 1;
      continue;
    }
    aReceberTotal = cent(aReceberTotal + Math.max(0, n(row.previsto) - recebido));
  }

  // Recebido DENTRO do mês selecionado: pela data real da entrada, não pela previsão.
  const recebidoNoMes = ((ciclosRows ?? []) as CicloRow[])
    .filter((c) => c.recebido_em && cicloDeData(c.recebido_em, config, feriados) === chave)
    .reduce((a, c) => a + n(c.recebido), 0);

  const faturamento = n(mes.faturamento);

  /*
   * ORÇAMENTO DA OPERAÇÃO — registrar já consome, pagar é outra coisa.
   *
   * `operacaoGasta` soma tudo que foi registrado contra o orçamento (pago ou
   * a pagar): assim que o anúncio é contratado o dinheiro está comprometido, e
   * mostrar o orçamento cheio até a fatura vencer seria mentir sobre a folga.
   * `operacaoPaga` é só o que já saiu — e é esse que o caixa usa.
   */
  const dosGastosOperacao = doMes.filter((l) => l.direcao === "saida" && l.operacao);
  const operacaoGasta = dosGastosOperacao.reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0);
  const operacaoPaga = dosGastosOperacao
    .filter((l) => l.status === "liquidado")
    .reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0);

  const plano = planoDoMes(faturamento, {
    guardado: n(mes.guardado),
    prolaboreUsado: n(mes.prolabore_usado),
    impostoSeparado: n(mes.imposto_separado),
    operacaoGasta,
    operacaoPaga,
  });

  /*
   * CAIXA DO MÊS — e só do mês.
   *
   * Antes esta conta somava os lançamentos de TODOS os meses, então trocar o
   * mês no seletor não mudava nada no caixa: setembro e abril mostravam o
   * mesmo número, e dava a impressão de que um mês tinha recebido os valores
   * do outro. Agora cada mês soma exclusivamente o que é dele.
   *
   * O caixa acumulado da empresa continua existindo, mas com nome próprio
   * (`caixaEmpresa`) e fora do bloco do mês — é ele que serve de ponto de
   * partida para a previsão dos próximos meses.
   */
  const liquidadosMes = doMes.filter((l) => l.status === "liquidado");
  const pendentesMes = doMes.filter((l) => l.status === "pendente");
  const entrou = liquidadosMes
    .filter((l) => l.direcao === "entrada")
    .reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0);
  const saiu = liquidadosMes
    .filter((l) => l.direcao === "saida")
    .reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0);
  const caixa = caixaDe({
    recebido: entrou,
    pago: saiu,
    previstoEntrar: pendentesMes.filter((l) => l.direcao === "entrada").reduce((a, l) => a + n(l.valor), 0),
    previstoSair: pendentesMes.filter((l) => l.direcao === "saida").reduce((a, l) => a + n(l.valor), 0),
  });

  const pendentes = todos.filter((l) => l.status === "pendente");
  const liquidados = todos.filter((l) => l.status === "liquidado");
  const caixaEmpresa =
    liquidados.filter((l) => l.direcao === "entrada").reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0) -
    liquidados.filter((l) => l.direcao === "saida").reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0);

  /*
   * PROJEÇÃO — 6 meses à frente, partindo do caixa disponível de HOJE.
   *
   * Usa o que está cadastrado: pendências com vencimento no mês, mais os
   * gastos fixos ativos que ainda NÃO têm ocorrência gerada naquele mês. Sem o
   * segundo pedaço, um mês futuro pareceria barato só porque ninguém abriu a
   * tela dele ainda.
   */
  const ativos = ((fixos ?? []) as Fixo[]).filter((f) => f.ativo);
  const meses = Array.from({ length: 6 }, (_, i) => {
    const ch = proximaChave(chave, i + 1);
    /*
     * Pelo `chave` do lançamento, não pelo ciclo do vencimento.
     *
     * Eram dois critérios para a mesma linha: a tela do mês listava por
     * `chave` e a previsão reclassificava pelo vencimento. Como o ciclo fecha
     * dia 20, um gasto do ciclo de setembro com vencimento 25/09 aparecia em
     * setembro na tela e em outubro na previsão — a mesma despesa contada
     * duas vezes em meses diferentes.
     */
    const doMesFuturo = pendentes.filter((l) => l.chave === ch);
    const jaGerados = new Set(
      todos.filter((l) => l.chave === ch && l.gasto_fixo_id).map((l) => l.gasto_fixo_id),
    );
    const fixosAindaNao = ativos
      .filter((f) => !jaGerados.has(f.id))
      .reduce((a, f) => a + n(f.valor), 0);
    return {
      chave: ch,
      entradas: doMesFuturo.filter((l) => l.direcao === "entrada").reduce((a, l) => a + n(l.valor), 0),
      saidas:
        doMesFuturo.filter((l) => l.direcao === "saida").reduce((a, l) => a + n(l.valor), 0) +
        fixosAindaNao,
    };
  });
  // Parte do caixa da EMPRESA (todos os meses), não do resultado de um mês só.
  const projecao = projetar(caixaEmpresa, meses);

  // Acumulado histórico — o que já ficou dentro da empresa, mês a mês.
  const { data: todosMeses } = await db
    .from("fin_mes")
    .select("chave, faturamento, guardado, prolabore_usado, imposto_separado")
    .eq("org_id", orgId)
    .order("chave", { ascending: false });
  /*
   * QUAIS MESES TÊM DADOS DE VERDADE.
   *
   * O seletor mostra meses para trás e para frente, e isso fazia parecer que
   * abril e janeiro tinham movimentação. A tela agora marca os vazios — mas
   * quem sabe quais são é aqui, não a tela.
   */
  const mesesComDados = new Set<string>();
  for (const l of todos) mesesComDados.add(l.chave);
  for (const m of (todosMeses ?? []) as Record<string, unknown>[]) {
    if (n(m.faturamento) || n(m.guardado) || n(m.prolabore_usado) || n(m.imposto_separado)) {
      mesesComDados.add(String(m.chave));
    }
  }
  const historico = ((todosMeses ?? []) as Record<string, unknown>[]).map((m) => {
    const p = planoDoMes(n(m.faturamento), {
      guardado: n(m.guardado),
      prolaboreUsado: n(m.prolabore_usado),
      impostoSeparado: n(m.imposto_separado),
      operacaoGasta: todos
        .filter((l) => l.chave === m.chave && l.direcao === "saida" && l.operacao)
        .reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0),
    });
    return {
      chave: String(m.chave),
      faturamento: p.faturamento,
      guardado: n(m.guardado),
      prolaboreUsado: n(m.prolabore_usado),
      impostoSeparado: n(m.imposto_separado),
      mantidoNaEmpresa: p.mantidoNaEmpresa,
      operacaoGasta: p.linhas.find((l) => l.destino === "operacao")?.realizado ?? 0,
    };
  });

  /*
   * GASTOS FIXOS NO MÊS — previsto, pendente e pago são três coisas.
   *
   * PREVISTO é o molde cadastrado (o aluguel de todo mês). Ele só vira
   * compromisso quando a ocorrência do mês é gerada, e só vira dinheiro que
   * saiu quando é marcado como pago. Antes a tela mostrava apenas o cadastro,
   * então não havia como saber o que ainda estava em aberto.
   */
  const fixosDoMes = ((fixos ?? []) as Fixo[]).map((f) => {
    const oc = doMes.find((l) => l.gasto_fixo_id === f.id);
    const sit = oc ? situacaoDe(oc) : null;
    return {
      ...f,
      lancamentoId: oc?.id ?? null,
      valorNoMes: oc ? n(oc.valor) : n(f.valor),
      vencimento: oc?.vencimento ?? null,
      status: (sit === null ? "previsto" : sit === "liquidado" ? "pago" : sit) as
        | "previsto"
        | "pendente"
        | "atrasado"
        | "pago",
    };
  });
  const somaFixos = (st: string[]) =>
    fixosDoMes.filter((f) => f.ativo && st.includes(f.status)).reduce((a, f) => a + f.valorNoMes, 0);

  // O fechamento do mês nas sete linhas que vão para o histórico.
  const resumo = resumoDoMes(plano, saiu);

  return Response.json({
    chave,
    faturamento,
    faturamentoVendas,
    observacao: (mes.observacao as string | null) ?? null,
    fechadoEm: (mes.fechado_em as string | null) ?? null,
    plano,
    diagnostico: diagnosticar(plano),
    // produção e recebimento (regra real: 20→5 e 5→20)
    ciclos,
    cicloAtual: cicloAtualChave,
    regraRecebimento: cfgRec,
    vendidoNoMes: faturamentoVendas,
    recebidoNoMes,
    aReceberTotal,
    recebidoTotal,
    ciclosSemPrevisao,
    mesesComDados: [...mesesComDados],
    caixa,
    caixaMov: { entrou, saiu },
    caixaEmpresa,
    resumo,
    projecao,
    historico,
    acumuladoMantido: historico.reduce((a, h) => a + h.mantidoNaEmpresa, 0),
    acumuladoGuardado: historico.reduce((a, h) => a + h.guardado, 0),
    fixos: fixosDoMes,
    lancamentos: doMes.map((l) => ({ ...l, valor: n(l.valor), situacao: situacaoDe(l) })),
    totais: {
      fixosPrevisto: fixosDoMes.filter((f) => f.ativo).reduce((a, f) => a + f.valorNoMes, 0),
      fixosPago: somaFixos(["pago"]),
      fixosPendente: somaFixos(["pendente", "atrasado"]),
      fixosNaoGerado: somaFixos(["previsto"]),
      fixos: doMes.filter((l) => l.tipo === "fixo").reduce((a, l) => a + n(l.valor), 0),
      variaveis: doMes.filter((l) => l.tipo === "variavel").reduce((a, l) => a + n(l.valor), 0),
      pagos: doMes.filter((l) => l.direcao === "saida" && l.status === "liquidado").reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0),
      pendentes: doMes.filter((l) => l.direcao === "saida" && situacaoDe(l) === "pendente").reduce((a, l) => a + n(l.valor), 0),
      atrasados: doMes.filter((l) => l.direcao === "saida" && situacaoDe(l) === "atrasado").reduce((a, l) => a + n(l.valor), 0),
    },
  });
}

/* ------------------------------------------------------------------ POST */

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const db = supabaseAdmin();
  const orgId = auth.orgId;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(body.acao ?? "");
  const chave = String(body.chave ?? "");

  /** Mês fechado não aceita alteração — só depois de reabrir. */
  async function mesFechado(ch: string) {
    const { data } = await db
      .from("fin_mes")
      .select("fechado_em")
      .eq("org_id", orgId)
      .eq("chave", ch)
      .maybeSingle();
    return !!(data as { fechado_em?: string } | null)?.fechado_em;
  }

  const agora = new Date().toISOString();

  switch (acao) {
    /* ---------------------------------------------- faturamento e realizados */
    case "salvar-mes": {
      if (!/^\d{4}-\d{2}$/.test(chave)) return erro("Mês inválido.");
      if (await mesFechado(chave)) return erro("Este mês está fechado. Reabra antes de alterar.", 409);
      const { error } = await db.from("fin_mes").upsert(
        {
          org_id: orgId,
          chave,
          faturamento: n(body.faturamento),
          guardado: n(body.guardado),
          prolabore_usado: n(body.prolaboreUsado),
          imposto_separado: n(body.impostoSeparado),
          observacao: (body.observacao as string | null) ?? null,
          atualizado_em: agora,
        },
        { onConflict: "org_id,chave" },
      );
      if (error) return erro(error.message);
      return Response.json({ ok: true });
    }

    /* --------------------------------- recebimento de um ciclo de produção */

    /*
     * O dinheiro ENTROU. Este é o único lugar que transforma previsão em fato.
     *
     * Não fica preso ao mês selecionado na tela: um ciclo que fecha dia 5 de
     * outubro é recebido dia 21 de outubro, e essas duas datas caem em meses
     * diferentes do seletor. O ciclo é a chave, não o mês.
     */
    case "registrar-recebimento": {
      const ciclo = String(body.ciclo ?? "");
      if (!CHAVE_CICLO.test(ciclo)) return erro("Ciclo inválido.");
      const valor = n(body.valor);
      if (valor <= 0) return erro("Informe quanto entrou.");
      const { error } = await db.from("fin_ciclos").upsert(
        {
          org_id: orgId,
          ciclo,
          recebido: valor,
          recebido_em: String(body.recebidoEm ?? hoje()),
          observacao: (body.observacao as string | null) ?? null,
          atualizado_em: agora,
        },
        { onConflict: "org_id,ciclo" },
      );
      if (error) return erro(error.message);
      await auditar(db, orgId, auth.email, "fin_recebimento", `${ciclo} — ${valor}`);
      return Response.json({ ok: true });
    }

    case "desfazer-recebimento": {
      const ciclo = String(body.ciclo ?? "");
      if (!CHAVE_CICLO.test(ciclo)) return erro("Ciclo inválido.");
      const { error } = await db
        .from("fin_ciclos")
        .update({ recebido: 0, recebido_em: null, atualizado_em: agora })
        .eq("org_id", orgId)
        .eq("ciclo", ciclo);
      if (error) return erro(error.message);
      await auditar(db, orgId, auth.email, "fin_recebimento_desfeito", ciclo);
      return Response.json({ ok: true });
    }

    /**
     * Previsão informada pela administradora, quando difere do vendido.
     * Vazio devolve o controle para o valor calculado das vendas.
     */
    case "salvar-previsto": {
      const ciclo = String(body.ciclo ?? "");
      if (!CHAVE_CICLO.test(ciclo)) return erro("Ciclo inválido.");
      const bruto = body.previsto;
      const previsto = bruto === null || bruto === "" || bruto === undefined ? null : n(bruto);
      const { error } = await db.from("fin_ciclos").upsert(
        { org_id: orgId, ciclo, previsto, atualizado_em: agora },
        { onConflict: "org_id,ciclo" },
      );
      if (error) return erro(error.message);
      return Response.json({ ok: true });
    }

    /** A regra de recebimento: dia do ciclo A (21/22) e dias úteis do ciclo B. */
    case "salvar-regra-recebimento": {
      const dia = Math.min(28, Math.max(1, Number(body.diaRecebimentoA) || 21));
      const uteis = Math.min(15, Math.max(1, Number(body.diasUteisB) || 5));
      const { error } = await db.from("fin_config").upsert(
        {
          org_id: orgId,
          dia_recebimento_a: dia,
          dias_uteis_recebimento_b: uteis,
          atualizado_em: agora,
        },
        { onConflict: "org_id" },
      );
      if (error) return erro(error.message);
      await auditar(db, orgId, auth.email, "fin_regra_recebimento", `dia ${dia} · ${uteis} dias úteis`);
      return Response.json({ ok: true });
    }

    /* ------------------------------------------------ fechar / reabrir o mês */
    case "fechar":
    case "reabrir": {
      const fechando = acao === "fechar";
      const { error } = await db.from("fin_mes").upsert(
        {
          org_id: orgId,
          chave,
          fechado_em: fechando ? agora : null,
          fechado_por: fechando ? auth.userId : null,
          atualizado_em: agora,
        },
        { onConflict: "org_id,chave" },
      );
      if (error) return erro(error.message);
      await auditar(db, orgId, auth.email, fechando ? "fin_mes_fechado" : "fin_mes_reaberto", chave);
      return Response.json({ ok: true });
    }

    /* -------------------------------------------------------- gastos fixos */
    case "salvar-fixo": {
      const dados = {
        org_id: orgId,
        nome: String(body.nome ?? "").trim(),
        valor: n(body.valor),
        dia_vencimento: Math.min(31, Math.max(1, Number(body.diaVencimento) || 1)),
        categoria: String(body.categoria ?? "Outros"),
        observacao: (body.observacao as string | null) ?? null,
        ativo: body.ativo !== false,
        atualizado_em: agora,
      };
      if (!dados.nome) return erro("Informe o nome da despesa.");
      const { error } = body.id
        ? await db.from("fin_gastos_fixos").update(dados).eq("id", String(body.id)).eq("org_id", orgId)
        : await db.from("fin_gastos_fixos").insert(dados);
      if (error) return erro(error.message);
      return Response.json({ ok: true });
    }

    /*
     * GERAR AS OCORRÊNCIAS DO MÊS.
     *
     * `ignoreDuplicates` + o índice único (org, gasto_fixo, chave) tornam isto
     * idempotente: clicar duas vezes, ou abrir a tela em duas abas, não duplica
     * o aluguel. Valor e dia são COPIADOS no momento da geração — se o aluguel
     * subir depois, o mês já gerado não muda sozinho.
     */
    case "gerar-fixos": {
      if (!/^\d{4}-\d{2}$/.test(chave)) return erro("Mês inválido.");
      if (await mesFechado(chave)) return erro("Este mês está fechado.", 409);
      const { config, feriados } = await cicloConfig(db, orgId);
      const { inicio, fim } = cicloPorChave(chave, config, feriados);
      const { data: fixos } = await db
        .from("fin_gastos_fixos")
        .select("*")
        .eq("org_id", orgId)
        .eq("ativo", true);
      const lista = (fixos ?? []) as Fixo[];
      if (lista.length === 0) return Response.json({ ok: true, criados: 0 });

      const linhas = lista.map((f) => ({
        org_id: orgId,
        chave,
        direcao: "saida" as const,
        tipo: "fixo" as const,
        descricao: f.nome,
        categoria: f.categoria,
        valor: n(f.valor),
        // dia 31 num mês de 30 cai no último dia, e sempre dentro do ciclo
        vencimento: vencimentoNoCiclo(f.dia_vencimento, inicio, fim),
        operacao: false,
        gasto_fixo_id: f.id,
      }));
      const { data, error } = await db
        .from("fin_lancamentos")
        .upsert(linhas, { onConflict: "org_id,gasto_fixo_id,chave", ignoreDuplicates: true })
        .select("id");
      if (error) return erro(error.message);
      return Response.json({ ok: true, criados: (data ?? []).length });
    }

    /* --------------------------------------------------------- lançamentos */
    case "salvar-lancamento": {
      if (await mesFechado(chave)) return erro("Este mês está fechado.", 409);
      const dados = {
        org_id: orgId,
        chave,
        direcao: body.direcao === "entrada" ? "entrada" : "saida",
        tipo: (["fixo", "variavel", "recebimento"] as const).includes(body.tipo as never)
          ? (body.tipo as string)
          : "variavel",
        descricao: String(body.descricao ?? "").trim(),
        categoria: String(body.categoria ?? "Outros"),
        valor: n(body.valor),
        vencimento: String(body.vencimento ?? hoje()),
        operacao: body.operacao === true,
        venda_id: (body.vendaId as string | null) || null,
        observacao: (body.observacao as string | null) ?? null,
        atualizado_em: agora,
      };
      if (!dados.descricao) return erro("Informe a descrição.");
      const { error } = body.id
        ? await db.from("fin_lancamentos").update(dados).eq("id", String(body.id)).eq("org_id", orgId)
        : await db.from("fin_lancamentos").insert(dados);
      if (error) return erro(error.message);
      return Response.json({ ok: true });
    }

    /** Marca como pago (saída) ou recebido (entrada). */
    case "liquidar": {
      const { data: alvo } = await db
        .from("fin_lancamentos")
        .select("chave, valor")
        .eq("id", String(body.id ?? ""))
        .eq("org_id", orgId)
        .maybeSingle();
      if (!alvo) return erro("Lançamento não encontrado.", 404);
      if (await mesFechado(String((alvo as { chave: string }).chave))) {
        return erro("Este mês está fechado.", 409);
      }
      const { error } = await db
        .from("fin_lancamentos")
        .update({
          status: "liquidado",
          liquidado_em: String(body.liquidadoEm ?? hoje()),
          valor_pago: body.valorPago !== undefined ? n(body.valorPago) : n((alvo as { valor: unknown }).valor),
          forma_pagamento: (body.formaPagamento as string | null) ?? null,
          observacao: (body.observacao as string | null) ?? null,
          atualizado_em: agora,
        })
        .eq("id", String(body.id))
        .eq("org_id", orgId);
      if (error) return erro(error.message);
      return Response.json({ ok: true });
    }

    case "desfazer-liquidacao": {
      const { error } = await db
        .from("fin_lancamentos")
        .update({ status: "pendente", liquidado_em: null, valor_pago: null, atualizado_em: agora })
        .eq("id", String(body.id ?? ""))
        .eq("org_id", orgId);
      if (error) return erro(error.message);
      return Response.json({ ok: true });
    }

    case "remover-lancamento": {
      const { error } = await db
        .from("fin_lancamentos")
        .delete()
        .eq("id", String(body.id ?? ""))
        .eq("org_id", orgId);
      if (error) return erro(error.message);
      return Response.json({ ok: true });
    }

    default:
      return erro("Ação desconhecida.");
  }
}

const erro = (msg: string, status = 400) => Response.json({ error: msg }, { status });

async function auditar(
  db: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  email: string,
  acao: string,
  detalhe: string,
) {
  try {
    await db.from("audit_log").insert({
      org_id: orgId,
      acao,
      entidade: "financeiro",
      usuario_email: email,
      detalhes: `${email} — ${acao} (${detalhe})`,
    });
  } catch {
    /* auditoria não derruba a operação */
  }
}
