import type { AuditLog, CanalTentativa, CentralLead, CentralLeadEvento, Cliente, DashboardConfig, Equipe, Feriado, Lead, LeadStatus, LeadTipo, MensagemPronta, Meta, NivelRecuperacao, Notificacao, Papel, PerformanceSnapshot, Producao, Profile, ResultadoTentativa, Tentativa, Venda, Vendedor } from "../types";
import type { ConfigProducao, InicioCiclo } from "../ciclo";
import type { ConfigPerformance } from "../performance";
import type { EstiloTema, StatusTema, Tema } from "../temas";

const num = (v: number | string) => (typeof v === "string" ? Number(v) : v);

// ============================================================
// Vendedor
// ============================================================
export type DbVendedor = {
  id: string;
  nome: string;
  email: string | null;
  meta_mensal: number | string;
  comissao_pct: number | string;
  ativo: boolean;
  criado_em: string;
};

export const vendedorFromDb = (r: DbVendedor): Vendedor => ({
  id: r.id,
  nome: r.nome,
  email: r.email ?? "",
  metaMensal: num(r.meta_mensal),
  comissaoPct: num(r.comissao_pct),
  ativo: r.ativo,
  criadoEm: r.criado_em,
});

export const vendedorToDb = (v: Partial<Vendedor>): Partial<DbVendedor> => {
  const out: Partial<DbVendedor> = {};
  if (v.nome !== undefined) out.nome = v.nome;
  if (v.email !== undefined) out.email = v.email || null;
  if (v.metaMensal !== undefined) out.meta_mensal = v.metaMensal;
  if (v.comissaoPct !== undefined) out.comissao_pct = v.comissaoPct;
  if (v.ativo !== undefined) out.ativo = v.ativo;
  return out;
};

// ============================================================
// Venda
// ============================================================
export type DbVenda = {
  id: string;
  vendedor_id: string;
  cliente: string;
  valor: number | string;
  data: string;
  criado_em?: string | null;
  status?: string | null;
  observacao: string | null;
};

export const vendaFromDb = (r: DbVenda): Venda => ({
  id: r.id,
  vendedorId: r.vendedor_id,
  cliente: r.cliente,
  valor: num(r.valor),
  data: r.data,
  criadoEm: r.criado_em ?? undefined,
  status: r.status ?? undefined,
  observacao: r.observacao ?? undefined,
});

export const vendaToDb = (v: Partial<Venda>): Partial<DbVenda> => {
  const out: Partial<DbVenda> = {};
  if (v.vendedorId !== undefined) out.vendedor_id = v.vendedorId;
  if (v.cliente !== undefined) out.cliente = v.cliente;
  if (v.valor !== undefined) out.valor = v.valor;
  if (v.data !== undefined) out.data = v.data;
  if (v.status !== undefined) out.status = v.status || null;
  if (v.observacao !== undefined) out.observacao = v.observacao || null;
  // criado_em NUNCA é escrito pela aplicação (imutável).
  return out;
};

// ============================================================
// Cliente
// ============================================================
export type DbCliente = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  empresa: string | null;
  notas: string | null;
  criado_em: string;
};

export const clienteFromDb = (r: DbCliente): Cliente => ({
  id: r.id,
  nome: r.nome,
  email: r.email ?? "",
  telefone: r.telefone ?? "",
  empresa: r.empresa ?? "",
  notas: r.notas ?? undefined,
  criadoEm: r.criado_em,
});

export const clienteToDb = (c: Partial<Cliente>): Partial<DbCliente> => {
  const out: Partial<DbCliente> = {};
  if (c.nome !== undefined) out.nome = c.nome;
  if (c.email !== undefined) out.email = c.email || null;
  if (c.telefone !== undefined) out.telefone = c.telefone || null;
  if (c.empresa !== undefined) out.empresa = c.empresa || null;
  if (c.notas !== undefined) out.notas = c.notas || null;
  return out;
};

// ============================================================
// Lead
// ============================================================
export type DbLead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  valor_estimado: number | string;
  status: LeadStatus;
  tipo: LeadTipo | null;
  vendedor_id: string | null;
  origem: string | null;
  observacao: string | null;
  criado_em: string;
  atualizado_em?: string | null;
  // Central de Recuperação (colunas aditivas — podem não existir antes da migration)
  nivel_recuperacao?: string | null;
  motivo_perda?: string | null;
  em_recuperacao?: boolean | null;
  perdido_em?: string | null;
  recuperado_em?: string | null;
  recuperacao_removido_em?: string | null;
  // Etapa "Não responde" (colunas aditivas — podem não existir antes da migration)
  nao_responde_desde?: string | null;
  tentativas_count?: number | null;
  ultima_tentativa_em?: string | null;
  ultima_tentativa_acao?: string | null;
  // Marca de compartilhamento (aditivas — quem grava é a função do banco)
  compartilhado_em?: string | null;
  compartilhado_por?: string | null;
  compartilhado_modo?: string | null;
};

export const leadFromDb = (r: DbLead): Lead => ({
  id: r.id,
  nome: r.nome,
  email: r.email ?? "",
  telefone: r.telefone ?? "",
  valorEstimado: num(r.valor_estimado),
  status: r.status,
  tipo: r.tipo ?? undefined,
  vendedorId: r.vendedor_id ?? undefined,
  origem: r.origem ?? undefined,
  observacao: r.observacao ?? undefined,
  criadoEm: r.criado_em,
  atualizadoEm: r.atualizado_em ?? undefined,
  nivelRecuperacao: (r.nivel_recuperacao as NivelRecuperacao | null) ?? undefined,
  motivoPerda: r.motivo_perda ?? undefined,
  emRecuperacao: r.em_recuperacao ?? false,
  perdidoEm: r.perdido_em ?? undefined,
  recuperadoEm: r.recuperado_em ?? undefined,
  recuperacaoRemovidoEm: r.recuperacao_removido_em ?? undefined,
  naoRespondeDesde: r.nao_responde_desde ?? undefined,
  tentativas: r.tentativas_count ?? 0,
  ultimaTentativaEm: r.ultima_tentativa_em ?? undefined,
  ultimaTentativaAcao: r.ultima_tentativa_acao ?? undefined,
  compartilhadoEm: r.compartilhado_em ?? undefined,
  compartilhadoPor: r.compartilhado_por ?? undefined,
  compartilhadoModo: (r.compartilhado_modo as Lead["compartilhadoModo"]) ?? undefined,
});

export const leadToDb = (l: Partial<Lead>): Partial<DbLead> => {
  const out: Partial<DbLead> = {};
  if (l.nome !== undefined) out.nome = l.nome;
  if (l.email !== undefined) out.email = l.email || null;
  if (l.telefone !== undefined) out.telefone = l.telefone || null;
  if (l.valorEstimado !== undefined) out.valor_estimado = l.valorEstimado;
  if (l.status !== undefined) out.status = l.status;
  if (l.tipo !== undefined) out.tipo = l.tipo || null;
  if (l.vendedorId !== undefined) out.vendedor_id = l.vendedorId || null;
  if (l.origem !== undefined) out.origem = l.origem || null;
  if (l.observacao !== undefined) out.observacao = l.observacao || null;
  if (l.nivelRecuperacao !== undefined) out.nivel_recuperacao = l.nivelRecuperacao ?? null;
  if (l.motivoPerda !== undefined) out.motivo_perda = l.motivoPerda || null;
  if (l.emRecuperacao !== undefined) out.em_recuperacao = l.emRecuperacao;
  if (l.perdidoEm !== undefined) out.perdido_em = l.perdidoEm || null;
  if (l.recuperadoEm !== undefined) out.recuperado_em = l.recuperadoEm || null;
  if (l.recuperacaoRemovidoEm !== undefined) out.recuperacao_removido_em = l.recuperacaoRemovidoEm || null;
  if (l.naoRespondeDesde !== undefined) out.nao_responde_desde = l.naoRespondeDesde || null;
  // tentativas_count / ultima_tentativa_* são mantidos pelo GATILHO do banco
  // a cada insert em lead_tentativas — o app nunca escreve neles.
  return out;
};

// ============================================================
// AuditLog
// ============================================================
export type DbAuditLog = {
  id: string;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  usuario_email: string | null;
  detalhes: string | null;
  criado_em: string;
};

export const auditFromDb = (r: DbAuditLog): AuditLog => ({
  id: r.id,
  acao: r.acao,
  entidade: r.entidade,
  entidadeId: r.entidade_id ?? undefined,
  usuarioEmail: r.usuario_email ?? undefined,
  detalhes: r.detalhes ?? undefined,
  criadoEm: r.criado_em,
});

export const auditToDb = (a: Partial<AuditLog>): Partial<DbAuditLog> => {
  const out: Partial<DbAuditLog> = {};
  if (a.acao !== undefined) out.acao = a.acao;
  if (a.entidade !== undefined) out.entidade = a.entidade;
  if (a.entidadeId !== undefined) out.entidade_id = a.entidadeId || null;
  if (a.usuarioEmail !== undefined) out.usuario_email = a.usuarioEmail || null;
  if (a.detalhes !== undefined) out.detalhes = a.detalhes || null;
  return out;
};

// ============================================================
// Meta (meta mensal por vendedor)
// ============================================================
export type DbMeta = {
  id: string;
  vendedor_id: string;
  ano_mes: string;
  valor: number | string;
  criado_em: string;
};

export const metaFromDb = (r: DbMeta): Meta => ({
  id: r.id,
  vendedorId: r.vendedor_id,
  anoMes: r.ano_mes,
  valor: num(r.valor),
  criadoEm: r.criado_em,
});

export const metaToDb = (m: Partial<Meta>): Partial<DbMeta> => {
  const out: Partial<DbMeta> = {};
  if (m.vendedorId !== undefined) out.vendedor_id = m.vendedorId;
  if (m.anoMes !== undefined) out.ano_mes = m.anoMes;
  if (m.valor !== undefined) out.valor = m.valor;
  return out;
};

// ============================================================
// Profile
// ============================================================
export type DbProfile = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  vendedor_id: string | null;
  equipe_id: string | null;
  vendedor_ref?: string | null;
  ativo: boolean;
  // Código de acesso (aditivas — quem gera é o banco)
  codigo_acesso?: string | null;
  codigo_liberado?: boolean | null;
  criado_em: string;
};

export const profileFromDb = (r: DbProfile): Profile => ({
  id: r.id,
  nome: r.nome,
  email: r.email,
  papel: r.papel,
  vendedorId: r.vendedor_id ?? undefined,
  equipeId: r.equipe_id ?? undefined,
  vendedorRef: r.vendedor_ref ?? undefined,
  ativo: r.ativo ?? true,
  codigoAcesso: r.codigo_acesso ?? undefined,
  codigoLiberado: r.codigo_liberado ?? undefined,
  criadoEm: r.criado_em,
});

// ============================================================
// Equipe
// ============================================================
export type DbEquipe = {
  id: string;
  nome: string;
  cor: string | null;
  lider_id: string | null;
  supervisor_id?: string | null;
  criado_em: string;
};

export const equipeFromDb = (r: DbEquipe): Equipe => ({
  id: r.id,
  nome: r.nome,
  cor: r.cor ?? "#6366f1",
  liderId: r.lider_id ?? undefined,
  supervisorId: r.supervisor_id ?? undefined,
  criadoEm: r.criado_em,
});

export const equipeToDb = (e: Partial<Equipe>): Partial<DbEquipe> => {
  const out: Partial<DbEquipe> = {};
  if (e.nome !== undefined) out.nome = e.nome;
  if (e.cor !== undefined) out.cor = e.cor || null;
  if (e.liderId !== undefined) out.lider_id = e.liderId || null;
  if (e.supervisorId !== undefined) out.supervisor_id = e.supervisorId || null;
  return out;
};

// ============================================================
// Produção
// ============================================================
export type DbProducao = {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  ativa: boolean;
  criado_em: string;
};

export const producaoFromDb = (r: DbProducao): Producao => ({
  id: r.id,
  nome: r.nome,
  dataInicio: r.data_inicio,
  dataFim: r.data_fim,
  ativa: r.ativa,
  criadoEm: r.criado_em,
});

export const producaoToDb = (p: Partial<Producao>): Partial<DbProducao> => {
  const out: Partial<DbProducao> = {};
  if (p.nome !== undefined) out.nome = p.nome;
  if (p.dataInicio !== undefined) out.data_inicio = p.dataInicio;
  if (p.dataFim !== undefined) out.data_fim = p.dataFim;
  if (p.ativa !== undefined) out.ativa = p.ativa;
  return out;
};

// ============================================================
// Central de Leads
// ============================================================
export type DbCentralLead = {
  id: string;
  nome: string;
  telefone: string | null;
  produto: string | null;
  origem: string | null;
  observacoes: string | null;
  prioridade: string;
  vendedor_id: string | null;
  distribuido_por: string | null;
  status: string;
  recebido_em: string;
  distribuido_em: string | null;
  ligacao_iniciada_em: string | null;
  atendido_em: string | null;
  mensagem_enviada_em: string | null;
  convertido_em: string | null;
  encerrado_em: string | null;
  motivo_perda: string | null;
  lead_id: string | null;
  external_id: string | null;
  criado_em: string;
  atualizado_em: string | null;
  excluido_em?: string | null;
  excluido_por?: string | null;
  excluido_motivo?: string | null;
  teste?: boolean | null;
  prazo_interesse?: string | null;
  cidade?: string | null;
  subproduto?: string | null;
  faixa_credito?: string | null;
  objetivo?: string | null;
  wa_contato?: unknown;
};

export const centralLeadFromDb = (r: DbCentralLead): CentralLead => ({
  id: r.id,
  nome: r.nome,
  telefone: r.telefone ?? undefined,
  produto: r.produto ?? undefined,
  origem: r.origem ?? undefined,
  observacoes: r.observacoes ?? undefined,
  prioridade: (r.prioridade as CentralLead["prioridade"]) ?? "normal",
  vendedorId: r.vendedor_id ?? undefined,
  distribuidoPor: r.distribuido_por ?? undefined,
  status: (r.status as CentralLead["status"]) ?? "novo",
  recebidoEm: r.recebido_em,
  distribuidoEm: r.distribuido_em ?? undefined,
  ligacaoIniciadaEm: r.ligacao_iniciada_em ?? undefined,
  atendidoEm: r.atendido_em ?? undefined,
  mensagemEnviadaEm: r.mensagem_enviada_em ?? undefined,
  convertidoEm: r.convertido_em ?? undefined,
  encerradoEm: r.encerrado_em ?? undefined,
  motivoPerda: r.motivo_perda ?? undefined,
  leadId: r.lead_id ?? undefined,
  externalId: r.external_id ?? undefined,
  criadoEm: r.criado_em,
  atualizadoEm: r.atualizado_em ?? undefined,
  excluidoEm: r.excluido_em ?? undefined,
  excluidoPor: r.excluido_por ?? undefined,
  excluidoMotivo: r.excluido_motivo ?? undefined,
  teste: r.teste ?? false,
  prazoInteresse: r.prazo_interesse ?? undefined,
  cidade: r.cidade ?? undefined,
  subproduto: r.subproduto ?? undefined,
  faixaCredito: r.faixa_credito ?? undefined,
  objetivo: r.objetivo ?? undefined,
  formulario: respostasDoFormulario(r.wa_contato),
});

/**
 * Extrai as perguntas e respostas do payload cru que a Meta entregou.
 * Nada é interpretado nem traduzido: sai como o cliente respondeu.
 */
function respostasDoFormulario(
  bruto: unknown,
): { pergunta: string; resposta: string }[] | undefined {
  const campos = (bruto as { lead?: { field_data?: { name?: string; values?: string[] }[] } })
    ?.lead?.field_data;
  if (!Array.isArray(campos) || campos.length === 0) return undefined;
  return campos
    .map((c) => ({
      pergunta: (c.name ?? "").trim(),
      resposta: (c.values ?? []).join(", ").trim(),
    }))
    .filter((c) => c.pergunta && c.resposta);
}

export const centralLeadToDb = (c: Partial<CentralLead>): Partial<DbCentralLead> => {
  const out: Partial<DbCentralLead> = {};
  if (c.nome !== undefined) out.nome = c.nome;
  if (c.telefone !== undefined) out.telefone = c.telefone || null;
  if (c.produto !== undefined) out.produto = c.produto || null;
  if (c.origem !== undefined) out.origem = c.origem || null;
  if (c.observacoes !== undefined) out.observacoes = c.observacoes || null;
  if (c.prioridade !== undefined) out.prioridade = c.prioridade;
  if (c.prazoInteresse !== undefined) out.prazo_interesse = c.prazoInteresse || null;
  if (c.cidade !== undefined) out.cidade = c.cidade || null;
  if (c.subproduto !== undefined) out.subproduto = c.subproduto || null;
  if (c.faixaCredito !== undefined) out.faixa_credito = c.faixaCredito || null;
  if (c.objetivo !== undefined) out.objetivo = c.objetivo || null;
  if (c.vendedorId !== undefined) out.vendedor_id = c.vendedorId || null;
  if (c.distribuidoPor !== undefined) out.distribuido_por = c.distribuidoPor || null;
  if (c.status !== undefined) out.status = c.status;
  if (c.distribuidoEm !== undefined) out.distribuido_em = c.distribuidoEm || null;
  if (c.ligacaoIniciadaEm !== undefined) out.ligacao_iniciada_em = c.ligacaoIniciadaEm || null;
  if (c.atendidoEm !== undefined) out.atendido_em = c.atendidoEm || null;
  if (c.mensagemEnviadaEm !== undefined) out.mensagem_enviada_em = c.mensagemEnviadaEm || null;
  if (c.convertidoEm !== undefined) out.convertido_em = c.convertidoEm || null;
  if (c.encerradoEm !== undefined) out.encerrado_em = c.encerradoEm || null;
  if (c.motivoPerda !== undefined) out.motivo_perda = c.motivoPerda || null;
  if (c.leadId !== undefined) out.lead_id = c.leadId || null;
  if (c.externalId !== undefined) out.external_id = c.externalId || null;
  // recebido_em / criado_em / atualizado_em: gerenciados pelo banco
  return out;
};

export type DbCentralLeadEvento = {
  id: string;
  central_lead_id: string;
  tipo: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  detalhe: string | null;
  autor_id: string | null;
  autor_nome: string | null;
  criado_em: string;
};

export const centralEventoFromDb = (r: DbCentralLeadEvento): CentralLeadEvento => ({
  id: r.id,
  centralLeadId: r.central_lead_id,
  tipo: r.tipo,
  campo: r.campo ?? undefined,
  valorAnterior: r.valor_anterior ?? undefined,
  valorNovo: r.valor_novo ?? undefined,
  detalhe: r.detalhe ?? undefined,
  autorId: r.autor_id ?? undefined,
  autorNome: r.autor_nome ?? undefined,
  criadoEm: r.criado_em,
});

export type DbNotificacao = {
  id: string;
  user_id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  entidade: string | null;
  entidade_id: string | null;
  lida: boolean;
  lida_em: string | null;
  criado_em: string;
};

export const notificacaoFromDb = (r: DbNotificacao): Notificacao => ({
  id: r.id,
  userId: r.user_id,
  tipo: r.tipo,
  titulo: r.titulo,
  mensagem: r.mensagem ?? undefined,
  link: r.link ?? undefined,
  entidade: r.entidade ?? undefined,
  entidadeId: r.entidade_id ?? undefined,
  lida: r.lida,
  lidaEm: r.lida_em ?? undefined,
  criadoEm: r.criado_em,
});

// ============================================================
// Feriado (regra de fechamento)
// ============================================================
export type DbFeriado = {
  id: string;
  data: string;
  descricao: string | null;
  criado_em: string;
};

export const feriadoFromDb = (r: DbFeriado): Feriado => ({
  id: r.id,
  data: r.data,
  descricao: r.descricao ?? undefined,
  criadoEm: r.criado_em,
});

export const feriadoToDb = (f: Partial<Feriado>): Partial<DbFeriado> => {
  const out: Partial<DbFeriado> = {};
  if (f.data !== undefined) out.data = f.data;
  if (f.descricao !== undefined) out.descricao = f.descricao || null;
  return out;
};

// ============================================================
// Config de produção (1 linha por org) — mapeia p/ ConfigProducao do ciclo.ts
// ============================================================
export type DbConfigProducao = {
  org_id: string;
  dia_base: number | string;
  prorrogar_dia_util: boolean;
  considerar_sab_dom: boolean;
  considerar_feriados: boolean;
  inicio_proximo_ciclo: InicioCiclo;
  data_inicio_regra: string;
  atualizado_em: string;
};

export const configProducaoFromDb = (r: DbConfigProducao): ConfigProducao => ({
  diaBase: num(r.dia_base),
  prorrogarDiaUtil: r.prorrogar_dia_util,
  considerarSabDom: r.considerar_sab_dom,
  considerarFeriados: r.considerar_feriados,
  inicioProximoCiclo: r.inicio_proximo_ciclo,
  dataInicioRegra: r.data_inicio_regra,
});

export const configProducaoToDb = (c: ConfigProducao): Partial<DbConfigProducao> => ({
  dia_base: c.diaBase,
  prorrogar_dia_util: c.prorrogarDiaUtil,
  considerar_sab_dom: c.considerarSabDom,
  considerar_feriados: c.considerarFeriados,
  inicio_proximo_ciclo: c.inicioProximoCiclo,
  data_inicio_regra: c.dataInicioRegra,
});

// ============================================================
// Dashboard config (1 linha por org) — Painel Inteligente
// ============================================================
export type DbDashboardConfig = {
  org_id: string;
  lembrete: string | null;
  meta_ligacoes: number | string;
  meta_reunioes: number | string;
  meta_vendas: number | string;
  atualizado_em: string;
};

export const dashboardConfigFromDb = (r: DbDashboardConfig): DashboardConfig => ({
  lembrete: r.lembrete ?? "",
  metaLigacoes: num(r.meta_ligacoes),
  metaReunioes: num(r.meta_reunioes),
  metaVendas: num(r.meta_vendas),
});

export const dashboardConfigToDb = (c: Partial<DashboardConfig>): Partial<DbDashboardConfig> => {
  const out: Partial<DbDashboardConfig> = {};
  if (c.lembrete !== undefined) out.lembrete = c.lembrete || null;
  if (c.metaLigacoes !== undefined) out.meta_ligacoes = c.metaLigacoes;
  if (c.metaReunioes !== undefined) out.meta_reunioes = c.metaReunioes;
  if (c.metaVendas !== undefined) out.meta_vendas = c.metaVendas;
  return out;
};

// ============================================================
// Performance config (1 linha por org) — pesos + metas
// ============================================================
export type DbPerformanceConfig = {
  org_id: string;
  peso_conversao: number | string;
  peso_fechamentos: number | string;
  peso_agendamentos: number | string;
  peso_propostas: number | string;
  peso_atualizacao: number | string;
  meta_conversao: number | string;
  meta_fechamentos: number | string;
  meta_agendamentos: number | string;
  meta_propostas: number | string;
  dias_frescor: number | string;
  limiar_evolucao: number | string;
  meta_empresa: number | string;
  atualizado_em: string;
};

export const performanceConfigFromDb = (r: DbPerformanceConfig): ConfigPerformance => ({
  pesos: {
    conversao: num(r.peso_conversao),
    fechamentos: num(r.peso_fechamentos),
    agendamentos: num(r.peso_agendamentos),
    propostas: num(r.peso_propostas),
    atualizacao: num(r.peso_atualizacao),
  },
  metas: {
    conversao: num(r.meta_conversao),
    fechamentos: num(r.meta_fechamentos),
    agendamentos: num(r.meta_agendamentos),
    propostas: num(r.meta_propostas),
    diasFrescor: num(r.dias_frescor),
    limiarEvolucao: num(r.limiar_evolucao),
    metaEmpresa: num(r.meta_empresa ?? 80),
  },
});

export const performanceConfigToDb = (c: ConfigPerformance): Partial<DbPerformanceConfig> => ({
  peso_conversao: c.pesos.conversao,
  peso_fechamentos: c.pesos.fechamentos,
  peso_agendamentos: c.pesos.agendamentos,
  peso_propostas: c.pesos.propostas,
  peso_atualizacao: c.pesos.atualizacao,
  meta_conversao: c.metas.conversao,
  meta_fechamentos: c.metas.fechamentos,
  meta_agendamentos: c.metas.agendamentos,
  meta_propostas: c.metas.propostas,
  dias_frescor: c.metas.diasFrescor,
  limiar_evolucao: c.metas.limiarEvolucao,
  meta_empresa: c.metas.metaEmpresa,
});

// ============================================================
// Performance histórico (snapshot por vendedor/ciclo)
// ============================================================
export type DbPerformanceHistorico = {
  id: string;
  vendedor_id: string;
  ciclo: string;
  nota: number | string;
  sub_conversao: number | string;
  sub_fechamentos: number | string;
  sub_agendamentos: number | string;
  sub_propostas: number | string;
  sub_atualizacao: number | string;
  classificacao: string;
  criado_em: string;
};

export const performanceSnapFromDb = (r: DbPerformanceHistorico): PerformanceSnapshot => ({
  id: r.id,
  vendedorId: r.vendedor_id,
  ciclo: r.ciclo,
  nota: num(r.nota),
  subConversao: num(r.sub_conversao),
  subFechamentos: num(r.sub_fechamentos),
  subAgendamentos: num(r.sub_agendamentos),
  subPropostas: num(r.sub_propostas),
  subAtualizacao: num(r.sub_atualizacao),
  classificacao: r.classificacao,
  criadoEm: r.criado_em,
});

export const performanceSnapToDb = (
  s: Partial<PerformanceSnapshot>,
): Partial<DbPerformanceHistorico> => {
  const out: Partial<DbPerformanceHistorico> = {};
  if (s.vendedorId !== undefined) out.vendedor_id = s.vendedorId;
  if (s.ciclo !== undefined) out.ciclo = s.ciclo;
  if (s.nota !== undefined) out.nota = s.nota;
  if (s.subConversao !== undefined) out.sub_conversao = s.subConversao;
  if (s.subFechamentos !== undefined) out.sub_fechamentos = s.subFechamentos;
  if (s.subAgendamentos !== undefined) out.sub_agendamentos = s.subAgendamentos;
  if (s.subPropostas !== undefined) out.sub_propostas = s.subPropostas;
  if (s.subAtualizacao !== undefined) out.sub_atualizacao = s.subAtualizacao;
  if (s.classificacao !== undefined) out.classificacao = s.classificacao;
  return out;
};

// ============================================================
// Tema (Temporadas / Campanhas — camada visual). estilo = jsonb (pacote).
// ============================================================
export type DbTema = {
  id: string;
  nome: string;
  slug: string;
  status: StatusTema;
  estilo: EstiloTema;
  data_inicio: string | null;
  data_fim: string | null;
  criado_em: string;
};

export const temaFromDb = (r: DbTema): Tema => ({
  id: r.id,
  nome: r.nome,
  slug: r.slug,
  status: r.status,
  estilo: r.estilo ?? {},
  dataInicio: r.data_inicio ?? undefined,
  dataFim: r.data_fim ?? undefined,
  criadoEm: r.criado_em,
});

export const temaToDb = (t: Partial<Tema>): Partial<DbTema> => {
  const out: Partial<DbTema> = {};
  if (t.nome !== undefined) out.nome = t.nome;
  if (t.slug !== undefined) out.slug = t.slug;
  if (t.status !== undefined) out.status = t.status;
  if (t.estilo !== undefined) out.estilo = t.estilo;
  if (t.dataInicio !== undefined) out.data_inicio = t.dataInicio || null;
  if (t.dataFim !== undefined) out.data_fim = t.dataFim || null;
  return out;
};

// ============================================================
// Tentativas de recuperação + Mensagens Prontas
// ============================================================
export type DbTentativa = {
  id: string;
  lead_id: string;
  vendedor_id: string | null;
  usuario_email: string | null;
  canal: CanalTentativa;
  acao: string;
  mensagem_id: string | null;
  mensagem_titulo: string | null;
  categoria: string | null;
  resultado: ResultadoTentativa;
  observacao: string | null;
  automatica: boolean | null;
  criado_em: string;
};

export const tentativaFromDb = (r: DbTentativa): Tentativa => ({
  id: r.id,
  leadId: r.lead_id,
  vendedorId: r.vendedor_id ?? undefined,
  usuarioEmail: r.usuario_email ?? undefined,
  canal: r.canal,
  acao: r.acao,
  mensagemId: r.mensagem_id ?? undefined,
  mensagemTitulo: r.mensagem_titulo ?? undefined,
  categoria: r.categoria ?? undefined,
  resultado: r.resultado,
  observacao: r.observacao ?? undefined,
  automatica: r.automatica ?? false,
  criadoEm: r.criado_em,
});

export const tentativaToDb = (t: Partial<Tentativa>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (t.leadId !== undefined) out.lead_id = t.leadId;
  if (t.vendedorId !== undefined) out.vendedor_id = t.vendedorId || null;
  if (t.usuarioEmail !== undefined) out.usuario_email = t.usuarioEmail || null;
  if (t.canal !== undefined) out.canal = t.canal;
  if (t.acao !== undefined) out.acao = t.acao;
  if (t.mensagemId !== undefined) out.mensagem_id = t.mensagemId || null;
  if (t.mensagemTitulo !== undefined) out.mensagem_titulo = t.mensagemTitulo || null;
  if (t.categoria !== undefined) out.categoria = t.categoria || null;
  if (t.resultado !== undefined) out.resultado = t.resultado;
  if (t.observacao !== undefined) out.observacao = t.observacao || null;
  if (t.automatica !== undefined) out.automatica = t.automatica;
  return out;
};

export type DbMensagemPronta = {
  id: string;
  titulo: string;
  categoria: string;
  texto: string;
  ordem: number | null;
  ativo: boolean | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
};

export const mensagemFromDb = (r: DbMensagemPronta): MensagemPronta => ({
  id: r.id,
  titulo: r.titulo,
  categoria: r.categoria,
  texto: r.texto,
  ordem: r.ordem ?? 0,
  ativo: r.ativo ?? true,
  criadoEm: r.criado_em ?? undefined,
  atualizadoEm: r.atualizado_em ?? undefined,
});

export const mensagemToDb = (m: Partial<MensagemPronta>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (m.titulo !== undefined) out.titulo = m.titulo;
  if (m.categoria !== undefined) out.categoria = m.categoria;
  if (m.texto !== undefined) out.texto = m.texto;
  if (m.ordem !== undefined) out.ordem = m.ordem;
  if (m.ativo !== undefined) out.ativo = m.ativo;
  return out;
};
