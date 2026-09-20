import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cicloAtual, cicloPorChave, setDeFeriados, type ConfigProducao } from "@/lib/ciclo";
import {
  cobertura,
  montarJornada,
  periodoDe,
  resumirPorConsultor,
  type AuditBruto,
  type CentralBruta,
  type Jornada,
  type LeadBruto,
  type TentativaBruta,
  type VendaBruta,
} from "@/lib/jornada-comercial";

/**
 * ANÁLISE COMERCIAL — histórico real, lido do servidor.
 *
 * POR QUE ESTA ROTA EXISTE, E NÃO LER PELO NAVEGADOR COMO AS OUTRAS TELAS
 *
 * O app carrega a auditoria com `.limit(500)` (store.ts). Hoje existem 5.402
 * registros: uma análise histórica feita pelo navegador enxergaria menos de
 * 10% do que aconteceu — e sem avisar. Aqui a leitura é paginada até o fim,
 * pelo servidor, e o total lido é devolvido junto com os números para poder
 * ser conferido.
 *
 * SÓ LÊ. Nenhum insert, update ou delete: a análise não pode alterar a
 * operação, nem "corrigir" histórico para os números baterem.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FASE 2 (preparada, desligada de propósito).
 *
 * Hoje a análise é só do administrador/representante. Quando o usuário mandar
 * liberar para o supervisor, é só virar esta chave: o escopo por equipe abaixo
 * já está implementado e devolve apenas os consultores da equipe dele. Líder e
 * vendedor seguem a regra do CRM (só os próprios dados) e continuam fora.
 */
const LIBERADO_PARA_SUPERVISOR = false;

/** Consultores que o usuário pode enxergar. `null` = todos (admin). */
async function escopoDeConsultores(
  db: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  papel: string,
  profileId: string,
): Promise<string[] | null> {
  if (papel === "admin" || papel === "coordenador") return null;
  if (papel === "supervisor" && LIBERADO_PARA_SUPERVISOR) {
    // Equipes em que ele é o supervisor → vendedor_ref de cada membro.
    const { data: equipes } = await db.from("equipes").select("id").eq("org_id", orgId).eq("supervisor_id", profileId);
    const ids = (equipes ?? []).map((e) => (e as { id: string }).id);
    if (!ids.length) return [];
    const { data: membros } = await db.from("profiles").select("vendedor_ref").in("equipe_id", ids);
    return (membros ?? []).map((m) => (m as { vendedor_ref: string | null }).vendedor_ref).filter((x): x is string => !!x);
  }
  return [];
}

/** Lê uma tabela inteira em páginas de 1.000 — o limite do PostgREST. */
async function lerTudo<T>(
  db: ReturnType<typeof supabaseAdmin>,
  tabela: string,
  colunas: string,
  orgId: string,
): Promise<T[]> {
  const saida: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db
      .from(tabela)
      .select(colunas)
      .eq("org_id", orgId)
      .order("criado_em", { ascending: true })
      .range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    const lote = (data ?? []) as unknown as T[];
    saida.push(...lote);
    if (lote.length < 1000) break;
  }
  return saida;
}

/**
 * A configuração do ciclo é a MESMA do ranking, das metas e do financeiro
 * (tabela `config_producao`: fecha dia 20, prorroga para o dia útil seguinte).
 * Ler daqui evita a análise ter um "mês" próprio que discorda do resto do CRM.
 */
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
  return { config, feriados: setDeFeriados(((fer ?? []) as { data: string }[]).map((f) => f.data)) };
}

/** "2026-09" − 1 = "2026-08". */
function chaveAnterior(chave: string, passos: number): string {
  const [y, m] = chave.split("-").map(Number);
  const d = new Date(y, m - 1 - passos, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const ddmm = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const db = supabaseAdmin();
  const orgId = auth.orgId;

  const { searchParams } = new URL(req.url);
  const tipo = (searchParams.get("tipo") ?? "semana") as
    | "semana"
    | "quinzena"
    | "mes"
    | "personalizado"
    | "ciclo";
  const chavePedida = searchParams.get("chave") ?? "";
  const deParam = searchParams.get("de");
  const ateParam = searchParams.get("ate");
  const vendedorFiltro = searchParams.get("vendedor") ?? "";
  const leadId = searchParams.get("leadId") ?? "";

  const { data: perfil } = await db
    .from("profiles")
    .select("papel, id")
    .eq("id", auth.userId)
    .maybeSingle();
  const papel = ((perfil as { papel?: string } | null)?.papel ?? "admin") as string;
  const permitidos = await escopoDeConsultores(db, orgId, papel, auth.userId);

  /*
   * O ciclo de produção NÃO é mês de calendário: vai de fechamento a
   * fechamento (dia 20, prorrogado para o dia útil seguinte). Quem sabe essa
   * regra é `lib/ciclo`, então a janela vem de lá — a análise não reimplementa
   * a régua, senão um dia ela discordaria do ranking.
   */
  const { config, feriados } = await cicloConfig(db, orgId);
  const atual = cicloAtual(config, feriados, new Date());
  const ciclosDisponiveis = Array.from({ length: 6 }, (_, i) => {
    const chave = chaveAnterior(atual.chave, i);
    const j = cicloPorChave(chave, config, feriados);
    return { chave, inicio: j.inicio.toISOString(), fim: j.fim.toISOString(), rotulo: `${ddmm(j.inicio)} a ${ddmm(j.fim)}` };
  });

  let periodo;
  if (tipo === "ciclo") {
    const janela = cicloPorChave(chavePedida || atual.chave, config, feriados);
    const fim = new Date(janela.fim);
    fim.setHours(23, 59, 59, 999);
    periodo = {
      de: janela.inicio,
      ate: fim,
      rotulo: `Ciclo de produção ${janela.chave} (${ddmm(janela.inicio)} a ${ddmm(janela.fim)})`,
    };
  } else {
    periodo = periodoDe(
      tipo as "semana" | "quinzena" | "mes" | "personalizado",
      new Date(),
      deParam ? new Date(`${deParam}T00:00:00`) : undefined,
      ateParam ? new Date(`${ateParam}T00:00:00`) : undefined,
    );
  }

  try {
    const [leads, audit, centrais, vendas, vendedores, tentativas] = await Promise.all([
      lerTudo<LeadBruto>(
        db,
        "leads",
        "id,nome,status,vendedor_id,origem,criado_em,perdido_em,motivo_perda,observacao,valor_estimado",
        orgId,
      ),
      lerTudo<AuditBruto>(db, "audit_log", "entidade,entidade_id,acao,detalhes,usuario_email,criado_em", orgId),
      lerTudo<CentralBruta>(
        db,
        "central_leads",
        "id,lead_id,nome,recebido_em,distribuido_em,ligacao_iniciada_em,atendido_em,convertido_em,criado_em",
        orgId,
      ),
      lerTudo<VendaBruta & { criado_em: string }>(db, "vendas", "id,lead_id,cliente,valor,data,vendedor_id,criado_em", orgId),
      lerTudo<{ id: string; nome: string; criado_em: string }>(db, "vendedores", "id,nome,criado_em", orgId),
      lerTudo<TentativaBruta & { criado_em: string }>(db, "lead_tentativas", "lead_id,acao,resultado,criado_em", orgId),
    ]);

    const auditPorLead = new Map<string, AuditBruto[]>();
    for (const a of audit) {
      if (a.entidade !== "lead" || !a.entidade_id) continue;
      const lista = auditPorLead.get(a.entidade_id) ?? [];
      lista.push(a);
      auditPorLead.set(a.entidade_id, lista);
    }
    const centralPorLead = new Map<string, CentralBruta>();
    for (const c of centrais) if (c.lead_id) centralPorLead.set(c.lead_id, c);
    const vendaPorLead = new Map<string, VendaBruta>();
    for (const v of vendas) if (v.lead_id) vendaPorLead.set(v.lead_id, v);
    const tentPorLead = new Map<string, TentativaBruta[]>();
    for (const t of tentativas) {
      const lista = tentPorLead.get(t.lead_id) ?? [];
      lista.push(t);
      tentPorLead.set(t.lead_id, lista);
    }
    const nomePorId: Record<string, string> = {};
    for (const v of vendedores) nomePorId[v.id] = v.nome;

    const visiveis = leads.filter((l) => {
      if (permitidos && !(l.vendedor_id && permitidos.includes(l.vendedor_id))) return false;
      if (vendedorFiltro && l.vendedor_id !== vendedorFiltro) return false;
      return true;
    });

    const jornadas: Jornada[] = visiveis.map((lead) =>
      montarJornada({
        lead,
        audit: auditPorLead.get(lead.id) ?? [],
        central: centralPorLead.get(lead.id) ?? null,
        tentativas: tentPorLead.get(lead.id) ?? [],
        venda: vendaPorLead.get(lead.id) ?? null,
      }),
    );

    // Ficha completa de UM negócio (a linha do tempo inteira, sem recorte).
    if (leadId) {
      const j = jornadas.find((x) => x.leadId === leadId);
      if (!j) return Response.json({ error: "Negócio não encontrado" }, { status: 404 });
      return Response.json({ jornada: j, consultor: (j.vendedorId && nomePorId[j.vendedorId]) || "Sem consultor" });
    }

    const dentro = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= periodo.de.getTime() && t <= periodo.ate.getTime();
    };

    const negocios = jornadas
      .map((j) => {
        const eventos = j.eventos.filter((e) => dentro(e.em));
        return {
          leadId: j.leadId,
          nome: j.nome,
          consultor: (j.vendedorId && nomePorId[j.vendedorId]) || "Sem consultor",
          vendedorId: j.vendedorId,
          etapaAtual: j.etapaAtual,
          criadoEm: j.criadoEm,
          origem: j.origem,
          valorEstimado: j.valorEstimado,
          agendamentos: j.agendamentos,
          reagendamentos: j.reagendamentos,
          desfechoAgendamento: j.desfechoAgendamento,
          primeiroContatoEm: j.primeiroContatoEm,
          vendaEm: j.vendaEm,
          vendaValor: j.vendaValor,
          perdidoEm: j.perdidoEm,
          motivoPerda: j.motivoPerda,
          diasParado: j.diasParado,
          inconsistencias: j.inconsistencias,
          eventos,
          movimentacoesNoPeriodo: eventos.filter((e) => e.tipo === "etapa").length,
        };
      })
      .filter((n) => n.eventos.length > 0)
      .sort((a, b) => b.eventos.length - a.eventos.length);

    const parados = jornadas
      .filter((j) => j.diasParado > 7)
      .map((j) => ({
        leadId: j.leadId,
        nome: j.nome,
        consultor: (j.vendedorId && nomePorId[j.vendedorId]) || "Sem consultor",
        etapaAtual: j.etapaAtual,
        diasParado: j.diasParado,
        ultimoEventoEm: j.ultimoEventoEm,
      }))
      .sort((a, b) => b.diasParado - a.diasParado);

    return Response.json({
      periodo: { de: periodo.de.toISOString(), ate: periodo.ate.toISOString(), rotulo: periodo.rotulo, tipo },
      ciclos: ciclosDisponiveis,
      cicloAtual: atual.chave,
      geradoEm: new Date().toISOString(),
      // Quanto foi lido de verdade — para conferir que nada ficou de fora.
      lido: {
        leads: leads.length,
        auditoria: audit.length,
        centrais: centrais.length,
        vendas: vendas.length,
        tentativas: tentativas.length,
      },
      cobertura: cobertura(jornadas),
      consultores: resumirPorConsultor(jornadas, periodo, nomePorId),
      vendedores: vendedores.map((v) => ({ id: v.id, nome: v.nome })),
      negocios,
      parados,
      inconsistencias: jornadas
        .filter((j) => j.inconsistencias.length > 0)
        .map((j) => ({
          leadId: j.leadId,
          nome: j.nome,
          consultor: (j.vendedorId && nomePorId[j.vendedorId]) || "Sem consultor",
          etapaAtual: j.etapaAtual,
          pontos: j.inconsistencias,
        })),
      // Dito na tela, para ninguém supor que o sistema "sabe" isto:
      naoRegistrado: [
        "Data e hora do agendamento (o CRM não tem esse campo)",
        "Comparecimento do cliente (não existe etapa nem registro)",
        "Não comparecimento (não existe etapa nem registro)",
      ],
      papel,
      supervisorLiberado: LIBERADO_PARA_SUPERVISOR,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao montar a análise" },
      { status: 500 },
    );
  }
}
