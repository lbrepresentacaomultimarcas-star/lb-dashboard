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
  data: string;
  observacao?: string;
};

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

export type Papel = "admin" | "coordenador" | "supervisor" | "vendedor";

export const PAPEL_INFO: Record<
  Papel,
  { label: string; tone: "brand" | "warn" | "success" | "neutral"; ordem: number }
> = {
  admin: { label: "Admin", tone: "brand", ordem: 0 },
  coordenador: { label: "Coordenador", tone: "warn", ordem: 1 },
  supervisor: { label: "Supervisor", tone: "success", ordem: 2 },
  vendedor: { label: "Vendedor", tone: "neutral", ordem: 3 },
};

export type Profile = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  vendedorId?: string;
  equipeId?: string;
  ativo: boolean;
  criadoEm: string;
};

export type SessionUser = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  vendedorId?: string;
};

export type Equipe = {
  id: string;
  nome: string;
  cor: string;
  liderId?: string;
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
