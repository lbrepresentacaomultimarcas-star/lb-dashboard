import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cicloDeData, setDeFeriados, type ConfigProducao } from "@/lib/ciclo";
import { caixaDe, planoDoMes, projetar, diagnosticar } from "@/lib/financeiro";

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

const n = (v: unknown) => Number(v ?? 0) || 0;
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
  const chave = req.nextUrl.searchParams.get("chave") ?? cicloDeData(new Date(), config, feriados);

  const [{ data: mesRow }, { data: lanc }, { data: fixos }, { data: vendas }] = await Promise.all([
    db.from("fin_mes").select("*").eq("org_id", orgId).eq("chave", chave).maybeSingle(),
    db.from("fin_lancamentos").select("*").eq("org_id", orgId).order("vencimento"),
    db.from("fin_gastos_fixos").select("*").eq("org_id", orgId).order("nome"),
    db.from("vendas").select("valor, data, status").eq("org_id", orgId),
  ]);

  const todos = (lanc ?? []) as Lancamento[];
  const doMes = todos.filter((l) => l.chave === chave);
  const mes = (mesRow ?? {}) as Record<string, unknown>;

  // Faturamento REAL das vendas, pelo mesmo ciclo do ranking. Referência.
  const faturamentoVendas = ((vendas ?? []) as { valor: unknown; data: string; status: string | null }[])
    .filter((v) => (v.status ?? "Confirmada") !== "Cancelada")
    .filter((v) => cicloDeData(v.data, config, feriados) === chave)
    .reduce((a, v) => a + n(v.valor), 0);

  const faturamento = n(mes.faturamento);
  const operacaoGasta = doMes
    .filter((l) => l.direcao === "saida" && l.operacao)
    .reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0);

  const plano = planoDoMes(faturamento, {
    guardado: n(mes.guardado),
    prolaboreUsado: n(mes.prolabore_usado),
    impostoSeparado: n(mes.imposto_separado),
    operacaoGasta,
  });

  // CAIXA — o que aconteceu de um lado, o que é previsão do outro. Nunca soma.
  const liquidados = todos.filter((l) => l.status === "liquidado");
  const pendentes = todos.filter((l) => l.status === "pendente");
  const caixa = caixaDe({
    recebido: liquidados.filter((l) => l.direcao === "entrada").reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0),
    pago: liquidados.filter((l) => l.direcao === "saida").reduce((a, l) => a + n(l.valor_pago ?? l.valor), 0),
    previstoEntrar: pendentes.filter((l) => l.direcao === "entrada").reduce((a, l) => a + n(l.valor), 0),
    previstoSair: pendentes.filter((l) => l.direcao === "saida").reduce((a, l) => a + n(l.valor), 0),
  });

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
    const doMesFuturo = pendentes.filter((l) => cicloDeData(l.vencimento, config, feriados) === ch);
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
  const projecao = projetar(caixa.disponivel, meses);

  // Acumulado histórico — o que já ficou dentro da empresa, mês a mês.
  const { data: todosMeses } = await db
    .from("fin_mes")
    .select("chave, faturamento, guardado, prolabore_usado, imposto_separado")
    .eq("org_id", orgId)
    .order("chave", { ascending: false });
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

  return Response.json({
    chave,
    faturamento,
    faturamentoVendas,
    observacao: (mes.observacao as string | null) ?? null,
    fechadoEm: (mes.fechado_em as string | null) ?? null,
    plano,
    diagnostico: diagnosticar(plano),
    caixa,
    projecao,
    historico,
    acumuladoMantido: historico.reduce((a, h) => a + h.mantidoNaEmpresa, 0),
    acumuladoGuardado: historico.reduce((a, h) => a + h.guardado, 0),
    fixos: (fixos ?? []) as Fixo[],
    lancamentos: doMes.map((l) => ({ ...l, valor: n(l.valor), situacao: situacaoDe(l) })),
    totais: {
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
      if (await mesFechado(chave)) return erro("Este mês está fechado.", 409);
      const { data: fixos } = await db
        .from("fin_gastos_fixos")
        .select("*")
        .eq("org_id", orgId)
        .eq("ativo", true);
      const lista = (fixos ?? []) as Fixo[];
      if (lista.length === 0) return Response.json({ ok: true, criados: 0 });

      const [y, m] = chave.split("-").map(Number);
      const ultimoDia = new Date(y, m, 0).getDate();
      const linhas = lista.map((f) => ({
        org_id: orgId,
        chave,
        direcao: "saida" as const,
        tipo: "fixo" as const,
        descricao: f.nome,
        categoria: f.categoria,
        valor: n(f.valor),
        // dia 31 num mês de 30 cai no último dia, não vira data inválida
        vencimento: `${chave}-${String(Math.min(f.dia_vencimento, ultimoDia)).padStart(2, "0")}`,
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
