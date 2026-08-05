export type Vendedor = {
  id: string;
  nome: string;
  email: string;
  metaMensal: number;
  comissaoPct: number;
  ativo: boolean;
  criadoEm: string;
};

export type Venda = {
  id: string;
  vendedorId: string;
  cliente: string;
  valor: number;
  /** DATA EFETIVA DA VENDA (o dia em que a venda aconteceu) — é o que TODOS os
   *  relatórios, ranking, faturamento e IA usam. Editável pelo admin. */
  data: string;
  /** Data de criação do registro no sistema — imutável, só pra rastreio. */
  criadoEm?: string;
  status?: string; // rótulo editável (Confirmada/Pendente/Cancelada)
  observacao?: string;
};

export const VENDA_STATUS = ["Confirmada", "Pendente", "Cancelada"] as const;

export type Cliente = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  notas?: string;
  criadoEm: string;
};

export type LeadStatus =
  | "oportunidade"
  | "primeiro_contato"
  | "reuniao_agendada"
  | "reuniao"
  | "acompanhamento"
  | "fechamento"
  | "perdido";

export type LeadTipo =
  | "imovel"
  | "carro"
  | "moto"
  | "caminhao"
  | "terreno"
  | "maquinario"
  | "servico";

export const LEAD_TIPO_INFO: Record<LeadTipo, { label: string }> = {
  imovel: { label: "Imóvel" },
  carro: { label: "Carro" },
  moto: { label: "Moto" },
  caminhao: { label: "Caminhão" },
  terreno: { label: "Terreno" },
  maquinario: { label: "Maquinário" },
  servico: { label: "Serviço" },
};

/** Nível de recuperação — definido MANUALMENTE pelo gestor/supervisor na
 *  Central de Recuperação. Ajuda o consultor novato a priorizar. */
export type NivelRecuperacao = "facil" | "medio" | "dificil" | "sem_info";

export type Lead = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  valorEstimado: number;
  status: LeadStatus;
  tipo?: LeadTipo;
  vendedorId?: string;
  origem?: string;
  observacao?: string;
  criadoEm: string;
  atualizadoEm?: string;
  // ---- Central de Recuperação (todos opcionais/aditivos) ----
  /** Nível de recuperação definido pelo gestor (🟢🟡🔴⚪). */
  nivelRecuperacao?: NivelRecuperacao;
  /** Motivo pelo qual o lead foi marcado como perdido. */
  motivoPerda?: string;
  /** true quando o lead foi redistribuído pela Central de Recuperação. */
  emRecuperacao?: boolean;
  /** Momento em que virou "perdido" (base do "dias parado"). */
  perdidoEm?: string;
  /** Momento em que foi efetivamente recuperado (fechou após recuperação). */
  recuperadoEm?: string;
  /** Momento em que foi removido da Central de Recuperação (banco). null = ainda no banco. */
  recuperacaoRemovidoEm?: string;
};

export type AuditLog = {
  id: string;
  acao: string;
  entidade: string;
  entidadeId?: string;
  usuarioEmail?: string;
  detalhes?: string;
  criadoEm: string;
};

export type Meta = {
  id: string;
  vendedorId: string;
  anoMes: string; // "YYYY-MM"
  valor: number;
  criadoEm: string;
};

/** Hierarquia de gestão. Ordem de poder: admin > coordenador > supervisor > líder > vendedor.
 *  O Líder é a etapa de preparação de um vendedor para virar Supervisor. */
export type Papel = "admin" | "coordenador" | "supervisor" | "lider" | "vendedor";

export const PAPEL_INFO: Record<
  Papel,
  { label: string; tone: "brand" | "warn" | "success" | "neutral"; ordem: number }
> = {
  admin: { label: "Admin", tone: "brand", ordem: 0 },
  coordenador: { label: "Coordenador", tone: "warn", ordem: 1 },
  supervisor: { label: "Supervisor", tone: "success", ordem: 2 },
  lider: { label: "Líder", tone: "success", ordem: 3 },
  vendedor: { label: "Vendedor", tone: "neutral", ordem: 4 },
};

export type Profile = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  /** UUID do dono da org (RLS/current_org_id) — NÃO é o id da tabela vendedores. */
  vendedorId?: string;
  equipeId?: string;
  /** Link REAL com a tabela vendedores (vendedores.id). Preenchido pelo auto-sync. */
  vendedorRef?: string;
  ativo: boolean;
  criadoEm: string;
};

export type SessionUser = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  /** id na tabela vendedores (registro de vendas do próprio usuário), se houver. */
  vendedorId?: string;
  /** equipe a que o usuário pertence (escopo por equipe do RBAC). */
  equipeId?: string;
};

export type Equipe = {
  id: string;
  nome: string;
  cor: string;
  /** Líder da equipe (profile.id). Acompanhamento/gestão, sem poderes administrativos. */
  liderId?: string;
  /** Supervisor da equipe (profile.id). Responsável pela equipe. */
  supervisorId?: string;
  criadoEm: string;
};

export type Producao = {
  id: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  ativa: boolean;
  criadoEm: string;
};

/** Feriado cadastrado pelo admin — usado pela regra de fechamento (ciclo.ts). */
export type Feriado = {
  id: string;
  data: string; // "YYYY-MM-DD"
  descricao?: string;
  criadoEm: string;
};

/** Snapshot mensal do Índice de Performance (1 por vendedor por ciclo). */
export type PerformanceSnapshot = {
  id: string;
  vendedorId: string;
  ciclo: string; // "AAAA-MM"
  nota: number;
  subConversao: number;
  subFechamentos: number;
  subAgendamentos: number;
  subPropostas: number;
  subAtualizacao: number;
  classificacao: string;
  criadoEm: string;
};

export type VendedorComDesempenho = Vendedor & {
  vendido: number;
  vendas: number;
  comissao: number;
  pctMeta: number;
};

export const LEAD_STATUS_INFO: Record<
  LeadStatus,
  { label: string; tone: "neutral" | "brand" | "warn" | "success" | "danger" }
> = {
  oportunidade: { label: "Oportunidade", tone: "brand" },
  primeiro_contato: { label: "Primeiro contato", tone: "neutral" },
  reuniao_agendada: { label: "Reunião agendada", tone: "warn" },
  reuniao: { label: "Fazer e passar proposta", tone: "warn" },
  acompanhamento: { label: "Acompanhamento p/ fechar", tone: "warn" },
  fechamento: { label: "Fechamento", tone: "success" },
  perdido: { label: "Perdido", tone: "danger" },
};

// ============================================================
// Central de Leads (intake/distribuição — módulo pré-Pipeline)
// ============================================================
export type Prioridade = "urgente" | "alta" | "normal" | "baixa";

export const PRIORIDADE_INFO: Record<Prioridade, { label: string; cor: string; ordem: number }> = {
  urgente: { label: "Urgente", cor: "#ef4444", ordem: 0 },
  alta: { label: "Alta", cor: "#f59e0b", ordem: 1 },
  normal: { label: "Normal", cor: "#3b82f6", ordem: 2 },
  baixa: { label: "Baixa", cor: "#64748b", ordem: 3 },
};

export type CentralLeadStatus =
  | "novo"
  | "aguardando"
  | "em_atendimento"
  | "aguardando_resposta"
  | "nao_atendeu"
  | "convertido"
  | "perdido";

export const CENTRAL_STATUS_INFO: Record<
  CentralLeadStatus,
  { label: string; tone: "neutral" | "brand" | "warn" | "success" | "danger" }
> = {
  novo: { label: "Novo", tone: "neutral" },
  aguardando: { label: "Aguardando ligação", tone: "brand" },
  em_atendimento: { label: "Em atendimento", tone: "warn" },
  aguardando_resposta: { label: "Aguardando resposta", tone: "warn" },
  nao_atendeu: { label: "Não atendeu", tone: "warn" },
  convertido: { label: "Convertido", tone: "success" },
  perdido: { label: "Perdido", tone: "danger" },
};

/** Motivos de perda sugeridos na Central de Leads. */
export const MOTIVOS_PERDA_CENTRAL = [
  "Sem interesse",
  "Número errado",
  "Pós-venda",
  "Curioso",
  "Outros",
] as const;

export type CentralLead = {
  id: string;
  nome: string;
  telefone?: string;
  produto?: string;
  origem?: string;
  observacoes?: string;
  prioridade: Prioridade;
  /** Consultor dono → vendedores.id (nulo = ainda não distribuído). */
  vendedorId?: string;
  /** profiles.id do admin que distribuiu. */
  distribuidoPor?: string;
  status: CentralLeadStatus;
  recebidoEm: string;
  distribuidoEm?: string;
  ligacaoIniciadaEm?: string;
  atendidoEm?: string;
  mensagemEnviadaEm?: string;
  convertidoEm?: string;
  encerradoEm?: string;
  motivoPerda?: string;
  /** leads.id do Pipeline quando convertido. */
  leadId?: string;
  externalId?: string;
  criadoEm: string;
  atualizadoEm?: string;
};

/** Evento da timeline/auditoria de um lead da Central. */
export type CentralLeadEvento = {
  id: string;
  centralLeadId: string;
  tipo: string;
  campo?: string;
  valorAnterior?: string;
  valorNovo?: string;
  detalhe?: string;
  autorId?: string;
  autorNome?: string;
  criadoEm: string;
};

/** Notificação interna (base p/ avisos — sem push ainda). */
export type Notificacao = {
  id: string;
  userId: string;
  tipo: string;
  titulo: string;
  mensagem?: string;
  link?: string;
  entidade?: string;
  entidadeId?: string;
  lida: boolean;
  lidaEm?: string;
  criadoEm: string;
};

/** Retorno da RPC central_dashboard (chaves snake_case do banco). */
export type CentralDashboard = {
  recebidos: number;
  distribuidos: number;
  aguardando_ligacao: number;
  atendidos: number;
  nao_atendidos: number;
  aguardando_resposta: number;
  convertidos: number;
  perdidos: number;
  tempo_medio_distribuicao_seg: number | null;
  tempo_medio_primeira_ligacao_seg: number | null;
  tempo_medio_atendimento_seg: number | null;
  tempo_medio_conversao_seg: number | null;
  por_origem: { origem: string; total: number; convertidos: number }[];
  por_consultor: { vendedor_id: string; total: number; convertidos: number }[];
};

/** Uma linha do ranking de produtividade (RPC central_ranking). */
export type CentralRankingRow = {
  vendedor_id: string;
  trabalhados: number;
  distribuidos: number;
  atendidos: number;
  convertidos: number;
  taxa_atendimento: number;
  taxa_conversao: number;
  taxa_qualificacao: number;
  tempo_resposta_seg: number | null;
};

/** Rótulo/cor/emoji de cada Nível de Recuperação (Central de Recuperação). */
export const NIVEL_RECUPERACAO_INFO: Record<
  NivelRecuperacao,
  { label: string; emoji: string; cor: string; dica: string }
> = {
  facil: { label: "Fácil", emoji: "🟢", cor: "#22c55e", dica: "Demonstrou interesse, faltou acompanhamento." },
  medio: { label: "Médio", emoji: "🟡", cor: "#f59e0b", dica: "Pediu para retornar futuramente." },
  dificil: { label: "Difícil", emoji: "🔴", cor: "#f43f5e", dica: "Informou que fechou com outra empresa." },
  sem_info: { label: "Sem informação", emoji: "⚪", cor: "#9aa6b4", dica: "Sem histórico suficiente para entender a perda." },
};

/** Etapas onde um lead pode ser reiniciado ao ser transferido pela Central de
 *  Recuperação (o gestor escolhe "onde iniciar este lead"). */
export const ETAPAS_RECUPERACAO: { status: LeadStatus; label: string }[] = [
  { status: "primeiro_contato", label: "Primeiro Contato" },
  { status: "reuniao", label: "Fazer e Passar Proposta" },
  { status: "reuniao_agendada", label: "Reunião Agendada" },
  { status: "acompanhamento", label: "Acompanhamento para Fechamento" },
];

/** Config do Painel Inteligente do Dashboard (1 por org, editável pelo admin). */
export type DashboardConfig = {
  /** Texto do "Lembrete do Dia". Vazio = usa o lembrete padrão rotativo. */
  lembrete: string;
  metaLigacoes: number;
  metaReunioes: number;
  metaVendas: number;
};

export const DASHBOARD_CONFIG_PADRAO: DashboardConfig = {
  lembrete: "",
  metaLigacoes: 30,
  metaReunioes: 5,
  metaVendas: 1,
};
