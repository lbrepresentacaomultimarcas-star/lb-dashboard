"use client";

import { useSyncExternalStore } from "react";
import { supabaseBrowser, supabaseEnabled } from "./supabase/client";
import { bumpSync } from "./sync-bus";
import { resultadosApi, type Contemplacao } from "./resultados";
import {
  auditFromDb,
  auditToDb,
  clienteFromDb,
  clienteToDb,
  configProducaoFromDb,
  configProducaoToDb,
  feriadoFromDb,
  feriadoToDb,
  leadFromDb,
  leadToDb,
  metaFromDb,
  metaToDb,
  performanceConfigFromDb,
  performanceConfigToDb,
  performanceSnapFromDb,
  performanceSnapToDb,
  temaFromDb,
  temaToDb,
  vendaFromDb,
  vendaToDb,
  vendedorFromDb,
  vendedorToDb,
  type DbAuditLog,
  type DbCliente,
  type DbConfigProducao,
  type DbFeriado,
  type DbLead,
  type DbMeta,
  type DbPerformanceConfig,
  type DbPerformanceHistorico,
  type DbTema,
  type DbVenda,
  type DbVendedor,
} from "./repo/mappers";
import type {
  AuditLog,
  Cliente,
  Feriado,
  Lead,
  Meta,
  PerformanceSnapshot,
  SessionUser,
  Venda,
  Vendedor,
} from "./types";
import { CONFIG_PRODUCAO_PADRAO, type ConfigProducao } from "./ciclo";
import { CONFIG_PERFORMANCE_PADRAO, type ConfigPerformance } from "./performance";
import {
  TEMA_LB_PREMIUM,
  TEMAS_PADRAO,
  temaAtivoDe,
  slugUnico,
  type StatusTema,
  type Tema,
} from "./temas";
import { uid } from "./utils";

// ============================================================
// Storage keys (modo local)
// ============================================================
const K_VENDEDORES = "lb:vendedores";
const K_VENDAS = "lb:vendas";
const K_CLIENTES = "lb:clientes";
const K_LEADS = "lb:leads";
const K_METAS = "lb:metas";
const K_AUDIT = "lb:audit";
const K_FERIADOS = "lb:feriados";
const K_CONFIG_PROD = "lb:config_producao";
const K_PERF_CONFIG = "lb:performance_config";
const K_PERF_HIST = "lb:performance_historico";
const K_TEMAS = "lb:temas";
const K_SESSION = "lb:session";

// ============================================================
// Estado em memória + observers
// ============================================================
type State = {
  vendedores: Vendedor[];
  vendas: Venda[];
  clientes: Cliente[];
  leads: Lead[];
  metas: Meta[];
  feriados: Feriado[];
  configProducao: ConfigProducao;
  performanceConfig: ConfigPerformance;
  performanceHistorico: PerformanceSnapshot[];
  temas: Tema[];
  temaAtivo: Tema;
  audit: AuditLog[];
  /** Contemplações oficiais (Resultados LB) — mesma mecânica dos demais. */
  resultados: Contemplacao[];
  session: SessionUser | null;
  ready: boolean;
};

const state: State = {
  vendedores: [],
  vendas: [],
  clientes: [],
  leads: [],
  metas: [],
  feriados: [],
  configProducao: CONFIG_PRODUCAO_PADRAO,
  performanceConfig: CONFIG_PERFORMANCE_PADRAO,
  performanceHistorico: [],
  temas: [],
  temaAtivo: TEMA_LB_PREMIUM,
  audit: [],
  resultados: [],
  session: null,
  ready: false,
};
// força recompilação completa quando types/seed mudam

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

// ============================================================
// Seed (modo demo) — usado quando Supabase não está habilitado
// ============================================================
const SEED_VENDEDORES: Vendedor[] = [
  {
    id: "v-ana",
    nome: "Ana Souza",
    email: "ana@empresa.com",
    metaMensal: 50000,
    comissaoPct: 5,
    ativo: true,
    criadoEm: new Date().toISOString(),
  },
  {
    id: "v-bruno",
    nome: "Bruno Lima",
    email: "bruno@empresa.com",
    metaMensal: 40000,
    comissaoPct: 5,
    ativo: true,
    criadoEm: new Date().toISOString(),
  },
  {
    id: "v-carla",
    nome: "Carla Dias",
    email: "carla@empresa.com",
    metaMensal: 60000,
    comissaoPct: 6,
    ativo: true,
    criadoEm: new Date().toISOString(),
  },
];

const SEED_CLIENTES: Cliente[] = [
  {
    id: "c-1",
    nome: "Acme Industrial",
    email: "contato@acme.com",
    telefone: "(11) 99999-0001",
    empresa: "Acme S.A.",
    notas: "Cliente desde 2023",
    criadoEm: new Date().toISOString(),
  },
  {
    id: "c-2",
    nome: "Beta Tech",
    email: "vendas@beta.com",
    telefone: "(11) 99999-0002",
    empresa: "Beta Tech Ltda",
    criadoEm: new Date().toISOString(),
  },
];

const SEED_LEADS: Lead[] = [
  {
    id: "l-1",
    nome: "Delta Logística",
    email: "joao@delta.com",
    telefone: "(11) 90000-1234",
    valorEstimado: 25000,
    status: "acompanhamento",
    vendedorId: "v-ana",
    origem: "Indicação",
    criadoEm: new Date().toISOString(),
  },
  {
    id: "l-2",
    nome: "Epsilon Foods",
    email: "compras@epsilon.com",
    telefone: "(11) 90000-5678",
    valorEstimado: 12000,
    status: "oportunidade",
    origem: "Site",
    criadoEm: new Date().toISOString(),
  },
  {
    id: "l-3",
    nome: "Gama Móveis",
    email: "marcio@gama.com",
    telefone: "(11) 90000-9999",
    valorEstimado: 8500,
    status: "primeiro_contato",
    vendedorId: "v-bruno",
    origem: "Cold call",
    criadoEm: new Date().toISOString(),
  },
];

function seedSampleSales(): Venda[] {
  const out: Venda[] = [];
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - Math.floor(Math.random() * 60));
    const v = SEED_VENDEDORES[i % SEED_VENDEDORES.length];
    out.push({
      id: uid(),
      vendedorId: v.id,
      cliente: `Cliente ${String.fromCharCode(65 + (i % 26))}${i}`,
      valor: Math.round((1500 + Math.random() * 8000) * 100) / 100,
      data: d.toISOString(),
    });
  }
  return out;
}

// ============================================================
// LocalStorage helpers
// ============================================================
function lsRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsWrite<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

// ============================================================
// AUDIT — registra ações
// ============================================================
async function logAudit(input: {
  acao: string;
  entidade: string;
  entidadeId?: string;
  detalhes?: string;
}) {
  const entry: Omit<AuditLog, "id" | "criadoEm"> = {
    acao: input.acao,
    entidade: input.entidade,
    entidadeId: input.entidadeId,
    usuarioEmail: state.session?.email,
    detalhes: input.detalhes,
  };
  if (supabaseEnabled) {
    try {
      const sb = supabaseBrowser();
      const { data } = await sb.from("audit_log").insert(auditToDb(entry)).select().single();
      if (data) {
        state.audit = [auditFromDb(data as DbAuditLog), ...state.audit].slice(0, 500);
        notify();
      }
    } catch {
      /* não bloquear ação por falha de log */
    }
  } else {
    const novo: AuditLog = {
      ...entry,
      id: uid(),
      criadoEm: new Date().toISOString(),
    };
    state.audit = [novo, ...state.audit].slice(0, 500);
    lsWrite(K_AUDIT, state.audit);
    notify();
  }
}

// ============================================================
// Hidratação inicial — chame uma vez no app
// ============================================================
let initPromise: Promise<void> | null = null;
let realtimeAttached = false;

/**
 * Monta a sessão buscando o papel REAL + vínculo de vendedor do profile.
 * (antes o papel vinha hardcoded como "admin" — bug que furava o RBAC no client)
 */
async function buildSession(
  u: { id: string; email?: string; user_metadata?: Record<string, unknown> },
): Promise<SessionUser> {
  const sb = supabaseBrowser();
  const fallbackNome =
    (u.user_metadata?.nome as string | undefined) ??
    u.email?.split("@")[0] ??
    "Usuário";
  try {
    // IMPORTANTE: a coluna `profiles.vendedor_id` NAO aponta pra tabela
    // vendedores — ela guarda o UUID do admin dono da org, usado SOMENTE
    // pela current_org_id() na RLS server-side.
    //
    // Pra UI (form de criar negocio, "(voce)" em selects), precisamos do id
    // REAL na tabela vendedores. Como nao ha FK direta entre auth.users e
    // vendedores, o vinculo e por EMAIL. Lookup extra abaixo resolve.
    const { data: prof } = await sb
      .from("profiles")
      .select("nome, papel")
      .eq("id", u.id)
      .single();

    // Busca o id na tabela vendedores pelo email. Se nao existir (admin
    // puro, sem registro de vendedor), `vendedorId` fica undefined e o
    // form simplesmente nao pre-preenche.
    let vendedorRecordId: string | undefined;
    if (u.email) {
      const { data: vRow } = await sb
        .from("vendedores")
        .select("id")
        .eq("email", u.email)
        .eq("ativo", true)
        .maybeSingle();
      vendedorRecordId = (vRow?.id as string | undefined) ?? undefined;
    }

    return {
      id: u.id,
      nome: prof?.nome ?? fallbackNome,
      email: u.email ?? "",
      papel: (prof?.papel as SessionUser["papel"]) ?? "vendedor",
      vendedorId: vendedorRecordId,
    };
  } catch {
    // Se falhar (ex: coluna ainda não migrada), assume vendedor (mais restrito)
    return {
      id: u.id,
      nome: fallbackNome,
      email: u.email ?? "",
      papel: "vendedor",
    };
  }
}

export function initStore(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data: userData } = await sb.auth.getUser();
      if (userData.user) {
        state.session = await buildSession(userData.user);
        await Promise.all([
          reloadVendedores(),
          reloadVendas(),
          reloadClientes(),
          reloadLeads(),
          reloadMetas(),
          reloadFeriados(),
          reloadConfigProducao(),
          reloadPerformanceConfig(),
          reloadPerformanceHistorico(),
          reloadTemas(),
          reloadAudit(),
          reloadResultados(),
        ]);
        attachRealtime();
      }
    } else {
      if (!localStorage.getItem(K_VENDEDORES)) lsWrite(K_VENDEDORES, SEED_VENDEDORES);
      if (!localStorage.getItem(K_VENDAS)) lsWrite(K_VENDAS, seedSampleSales());
      if (!localStorage.getItem(K_CLIENTES)) lsWrite(K_CLIENTES, SEED_CLIENTES);
      if (!localStorage.getItem(K_LEADS)) lsWrite(K_LEADS, SEED_LEADS);
      state.vendedores = lsRead<Vendedor[]>(K_VENDEDORES, []);
      state.vendas = lsRead<Venda[]>(K_VENDAS, []);
      state.clientes = lsRead<Cliente[]>(K_CLIENTES, []);
      state.leads = lsRead<Lead[]>(K_LEADS, []);
      state.metas = lsRead<Meta[]>(K_METAS, []);
      state.feriados = lsRead<Feriado[]>(K_FERIADOS, []);
      state.configProducao = lsRead<ConfigProducao>(K_CONFIG_PROD, CONFIG_PRODUCAO_PADRAO);
      state.performanceConfig = lsRead<ConfigPerformance>(K_PERF_CONFIG, CONFIG_PERFORMANCE_PADRAO);
      state.performanceHistorico = lsRead<PerformanceSnapshot[]>(K_PERF_HIST, []);
      state.temas = lsRead<Tema[]>(K_TEMAS, []);
      state.temaAtivo = temaAtivoDe(state.temas);
      state.audit = lsRead<AuditLog[]>(K_AUDIT, []);
      state.session = lsRead<SessionUser | null>(K_SESSION, null);
    }
    state.ready = true;
    notify();
  })();
  return initPromise;
}

async function reloadVendedores() {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("vendedores").select("*").order("criado_em");
  if (!error && data) {
    state.vendedores = (data as DbVendedor[]).map(vendedorFromDb);
    notify();
  }
}
async function reloadVendas() {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("vendas").select("*").order("data", { ascending: false });
  if (!error && data) {
    state.vendas = (data as DbVenda[]).map(vendaFromDb);
    notify();
  }
}
/** Exportada: a página de Resultados chama após salvar uma importação
 *  (o realtime cobre os OUTROS aparelhos; o próprio fica instantâneo).
 *  Igual aos demais reloads: só substitui em caso de sucesso — um hiccup de
 *  rede/auth NÃO pode zerar o que já estava carregado. */
export async function reloadResultados() {
  const { data, error } = await resultadosApi.listarSafe();
  if (error) return; // preserva o estado anterior (mesmo padrão de reloadVendas)
  state.resultados = data;
  notify();
}
async function reloadClientes() {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("clientes").select("*").order("criado_em", { ascending: false });
  if (!error && data) {
    state.clientes = (data as DbCliente[]).map(clienteFromDb);
    notify();
  }
}
async function reloadLeads() {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("leads").select("*").order("criado_em", { ascending: false });
  if (!error && data) {
    state.leads = (data as DbLead[]).map(leadFromDb);
    notify();
  }
}
async function reloadAudit() {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("audit_log")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(500);
  if (!error && data) {
    state.audit = (data as DbAuditLog[]).map(auditFromDb);
    notify();
  }
}
async function reloadMetas() {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("metas").select("*").order("ano_mes", { ascending: false });
  if (!error && data) {
    state.metas = (data as DbMeta[]).map(metaFromDb);
    notify();
  }
}
async function reloadFeriados() {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("feriados").select("*").order("data", { ascending: true });
  if (!error && data) {
    state.feriados = (data as DbFeriado[]).map(feriadoFromDb);
    notify();
  }
}
async function reloadConfigProducao() {
  const sb = supabaseBrowser();
  // 1 linha por org (ou nenhuma). Sem linha → mantém o padrão SEGURO (desligado).
  const { data, error } = await sb.from("config_producao").select("*").maybeSingle();
  if (!error) {
    state.configProducao = data
      ? configProducaoFromDb(data as DbConfigProducao)
      : CONFIG_PRODUCAO_PADRAO;
    notify();
  }
}
async function reloadPerformanceConfig() {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("performance_config").select("*").maybeSingle();
  if (!error) {
    state.performanceConfig = data
      ? performanceConfigFromDb(data as DbPerformanceConfig)
      : CONFIG_PERFORMANCE_PADRAO;
    notify();
  }
}
async function reloadPerformanceHistorico() {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("performance_historico")
    .select("*")
    .order("ciclo", { ascending: false });
  if (!error && data) {
    state.performanceHistorico = (data as DbPerformanceHistorico[]).map(performanceSnapFromDb);
    notify();
  }
}
async function reloadTemas() {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("temas").select("*").order("criado_em", { ascending: true });
  if (!error && data) {
    state.temas = (data as DbTema[]).map(temaFromDb);
    state.temaAtivo = temaAtivoDe(state.temas); // ativo ou LB Premium (visual atual)
    notify();
  }
}

/**
 * Re-busca todos os datasets do store em paralelo. Usado pelo botão
 * "Atualizar Dados" e pelo auto-refresh. Sem efeito em modo demo
 * (localStorage não muda sozinho — não há fonte externa pra refazer).
 */
export async function reloadAllData(): Promise<void> {
  if (!supabaseEnabled) return;
  await Promise.all([
    reloadVendedores(),
    reloadVendas(),
    reloadClientes(),
    reloadLeads(),
    reloadMetas(),
    reloadFeriados(),
    reloadConfigProducao(),
    reloadPerformanceConfig(),
    reloadPerformanceHistorico(),
    reloadTemas(),
    reloadAudit(),
    reloadResultados(),
  ]);
}

function attachRealtime() {
  if (realtimeAttached) return;
  realtimeAttached = true;
  const sb = supabaseBrowser();
  // Além de recarregar o dataset no store, bumpa o sync-bus: hooks com fetch
  // próprio (ranking via RPC) refazem a busca na hora — venda registrada em
  // outro aparelho aparece sem recarregar a página.
  const sub = (table: string, reload: () => Promise<void>) =>
    sb.channel(`lb-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        void reload().then(() => bumpSync());
      })
      .subscribe();
  sub("vendedores", reloadVendedores);
  sub("vendas", reloadVendas);
  sub("clientes", reloadClientes);
  sub("leads", reloadLeads);
  sub("metas", reloadMetas);
  sub("feriados", reloadFeriados);
  sub("config_producao", reloadConfigProducao);
  sub("performance_config", reloadPerformanceConfig);
  sub("performance_historico", reloadPerformanceHistorico);
  sub("temas", reloadTemas);
  sub("audit_log", reloadAudit);
  sub("resultados_contemplacoes", reloadResultados);
}

// ============================================================
// Hooks
// ============================================================
export function useVendedores(): Vendedor[] {
  return useSyncExternalStore(subscribe, () => state.vendedores, () => state.vendedores);
}
export function useVendas(): Venda[] {
  return useSyncExternalStore(subscribe, () => state.vendas, () => state.vendas);
}
export function useClientes(): Cliente[] {
  return useSyncExternalStore(subscribe, () => state.clientes, () => state.clientes);
}
export function useLeads(): Lead[] {
  return useSyncExternalStore(subscribe, () => state.leads, () => state.leads);
}
export function useAudit(): AuditLog[] {
  return useSyncExternalStore(subscribe, () => state.audit, () => state.audit);
}
export function useResultados(): Contemplacao[] {
  return useSyncExternalStore(subscribe, () => state.resultados, () => state.resultados);
}
export function useMetas(): Meta[] {
  return useSyncExternalStore(subscribe, () => state.metas, () => state.metas);
}
export function useFeriados(): Feriado[] {
  return useSyncExternalStore(subscribe, () => state.feriados, () => state.feriados);
}
export function useConfigProducao(): ConfigProducao {
  return useSyncExternalStore(subscribe, () => state.configProducao, () => state.configProducao);
}
export function usePerformanceConfig(): ConfigPerformance {
  return useSyncExternalStore(subscribe, () => state.performanceConfig, () => state.performanceConfig);
}
export function usePerformanceHistorico(): PerformanceSnapshot[] {
  return useSyncExternalStore(subscribe, () => state.performanceHistorico, () => state.performanceHistorico);
}
export function useTemas(): Tema[] {
  return useSyncExternalStore(subscribe, () => state.temas, () => state.temas);
}
export function useTemaAtivo(): Tema {
  return useSyncExternalStore(subscribe, () => state.temaAtivo, () => state.temaAtivo);
}
export function useSession(): SessionUser | null {
  return useSyncExternalStore(subscribe, () => state.session, () => state.session);
}
export function useReady(): boolean {
  return useSyncExternalStore(subscribe, () => state.ready, () => false);
}

// ============================================================
// API — vendedores
// ============================================================
export const vendedoresApi = {
  async add(input: Omit<Vendedor, "id" | "criadoEm">) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data, error } = await sb.from("vendedores").insert(vendedorToDb(input)).select().single();
      if (error) throw error;
      state.vendedores = [...state.vendedores, vendedorFromDb(data as DbVendedor)];
    } else {
      const novo: Vendedor = { ...input, id: uid(), criadoEm: new Date().toISOString() };
      state.vendedores = [...state.vendedores, novo];
      lsWrite(K_VENDEDORES, state.vendedores);
    }
    notify();
    void logAudit({ acao: "criar", entidade: "vendedor", detalhes: input.nome });
  },
  async update(id: string, patch: Partial<Vendedor>) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb.from("vendedores").update(vendedorToDb(patch)).eq("id", id);
      if (error) throw error;
    }
    state.vendedores = state.vendedores.map((v) => (v.id === id ? { ...v, ...patch } : v));
    if (!supabaseEnabled) lsWrite(K_VENDEDORES, state.vendedores);
    notify();
    void logAudit({ acao: "editar", entidade: "vendedor", entidadeId: id, detalhes: patch.nome });
  },
  async remove(id: string) {
    const nome = state.vendedores.find((v) => v.id === id)?.nome;
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb.from("vendedores").delete().eq("id", id);
      if (error) throw error;
    }
    state.vendedores = state.vendedores.filter((v) => v.id !== id);
    state.vendas = state.vendas.filter((s) => s.vendedorId !== id);
    if (!supabaseEnabled) {
      lsWrite(K_VENDEDORES, state.vendedores);
      lsWrite(K_VENDAS, state.vendas);
    }
    notify();
    void logAudit({ acao: "remover", entidade: "vendedor", entidadeId: id, detalhes: nome });
  },
};

// ============================================================
// API — vendas
// ============================================================
export const vendasApi = {
  async add(input: Omit<Venda, "id">) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data, error } = await sb.from("vendas").insert(vendaToDb(input)).select().single();
      if (error) throw error;
      state.vendas = [vendaFromDb(data as DbVenda), ...state.vendas];
    } else {
      const nova: Venda = { ...input, id: uid() };
      state.vendas = [nova, ...state.vendas];
      lsWrite(K_VENDAS, state.vendas);
    }
    notify();
    void logAudit({
      acao: "criar",
      entidade: "venda",
      detalhes: `${input.cliente} — ${input.valor}`,
    });
  },
  async remove(id: string) {
    const v = state.vendas.find((s) => s.id === id);
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb.from("vendas").delete().eq("id", id);
      if (error) throw error;
    }
    state.vendas = state.vendas.filter((s) => s.id !== id);
    if (!supabaseEnabled) lsWrite(K_VENDAS, state.vendas);
    notify();
    void logAudit({ acao: "remover", entidade: "venda", entidadeId: id, detalhes: v?.cliente });
  },
};

// ============================================================
// API — clientes
// ============================================================
export const clientesApi = {
  async add(input: Omit<Cliente, "id" | "criadoEm">) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data, error } = await sb.from("clientes").insert(clienteToDb(input)).select().single();
      if (error) throw error;
      state.clientes = [clienteFromDb(data as DbCliente), ...state.clientes];
    } else {
      const novo: Cliente = { ...input, id: uid(), criadoEm: new Date().toISOString() };
      state.clientes = [novo, ...state.clientes];
      lsWrite(K_CLIENTES, state.clientes);
    }
    notify();
    void logAudit({ acao: "criar", entidade: "cliente", detalhes: input.nome });
  },
  async update(id: string, patch: Partial<Cliente>) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb.from("clientes").update(clienteToDb(patch)).eq("id", id);
      if (error) throw error;
    }
    state.clientes = state.clientes.map((c) => (c.id === id ? { ...c, ...patch } : c));
    if (!supabaseEnabled) lsWrite(K_CLIENTES, state.clientes);
    notify();
    void logAudit({ acao: "editar", entidade: "cliente", entidadeId: id, detalhes: patch.nome });
  },
  async remove(id: string) {
    const nome = state.clientes.find((c) => c.id === id)?.nome;
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb.from("clientes").delete().eq("id", id);
      if (error) throw error;
    }
    state.clientes = state.clientes.filter((c) => c.id !== id);
    if (!supabaseEnabled) lsWrite(K_CLIENTES, state.clientes);
    notify();
    void logAudit({ acao: "remover", entidade: "cliente", entidadeId: id, detalhes: nome });
  },
};

// ============================================================
// API — leads
// ============================================================
export const leadsApi = {
  /** Devolve o lead criado (o fechamento direto no cadastro precisa do id). */
  async add(input: Omit<Lead, "id" | "criadoEm">): Promise<Lead> {
    let criado: Lead;
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data, error } = await sb.from("leads").insert(leadToDb(input)).select().single();
      if (error) throw error;
      criado = leadFromDb(data as DbLead);
      state.leads = [criado, ...state.leads];
    } else {
      criado = { ...input, id: uid(), criadoEm: new Date().toISOString() };
      state.leads = [criado, ...state.leads];
      lsWrite(K_LEADS, state.leads);
    }
    notify();
    void logAudit({ acao: "criar", entidade: "lead", detalhes: input.nome });
    return criado;
  },
  async update(id: string, patch: Partial<Lead>) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb.from("leads").update(leadToDb(patch)).eq("id", id);
      if (error) throw error;
    }
    state.leads = state.leads.map((l) => (l.id === id ? { ...l, ...patch } : l));
    if (!supabaseEnabled) lsWrite(K_LEADS, state.leads);
    notify();
    const detalhes = patch.status ? `status → ${patch.status}` : patch.nome;
    void logAudit({ acao: "editar", entidade: "lead", entidadeId: id, detalhes });
  },
  async remove(id: string) {
    const nome = state.leads.find((l) => l.id === id)?.nome;
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb.from("leads").delete().eq("id", id);
      if (error) throw error;
    }
    state.leads = state.leads.filter((l) => l.id !== id);
    if (!supabaseEnabled) lsWrite(K_LEADS, state.leads);
    notify();
    void logAudit({ acao: "remover", entidade: "lead", entidadeId: id, detalhes: nome });
  },
};

// ============================================================
// API — metas
// ============================================================
export const metasApi = {
  async upsert(vendedorId: string, anoMes: string, valor: number) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data, error } = await sb
        .from("metas")
        .upsert(metaToDb({ vendedorId, anoMes, valor }), {
          onConflict: "vendedor_id,ano_mes",
        })
        .select()
        .single();
      if (error) throw error;
      const nova = metaFromDb(data as DbMeta);
      const idx = state.metas.findIndex(
        (m) => m.vendedorId === vendedorId && m.anoMes === anoMes,
      );
      if (idx >= 0) state.metas = state.metas.map((m, i) => (i === idx ? nova : m));
      else state.metas = [nova, ...state.metas];
    } else {
      const idx = state.metas.findIndex(
        (m) => m.vendedorId === vendedorId && m.anoMes === anoMes,
      );
      if (idx >= 0) {
        state.metas = state.metas.map((m, i) =>
          i === idx ? { ...m, valor } : m,
        );
      } else {
        state.metas = [
          {
            id: uid(),
            vendedorId,
            anoMes,
            valor,
            criadoEm: new Date().toISOString(),
          },
          ...state.metas,
        ];
      }
      lsWrite(K_METAS, state.metas);
    }
    notify();
    void logAudit({
      acao: "editar",
      entidade: "meta",
      entidadeId: vendedorId,
      detalhes: `${anoMes} → ${valor}`,
    });
  },
  async remove(vendedorId: string, anoMes: string) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb
        .from("metas")
        .delete()
        .eq("vendedor_id", vendedorId)
        .eq("ano_mes", anoMes);
      if (error) throw error;
    }
    state.metas = state.metas.filter(
      (m) => !(m.vendedorId === vendedorId && m.anoMes === anoMes),
    );
    if (!supabaseEnabled) lsWrite(K_METAS, state.metas);
    notify();
  },
};

// ============================================================
// API — feriados (regra de fechamento)
// ============================================================
export const feriadosApi = {
  async add(input: { data: string; descricao?: string }) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data, error } = await sb.from("feriados").insert(feriadoToDb(input)).select().single();
      if (error) throw error;
      state.feriados = [...state.feriados, feriadoFromDb(data as DbFeriado)].sort((a, b) =>
        a.data.localeCompare(b.data),
      );
    } else {
      const novo: Feriado = {
        id: uid(),
        data: input.data,
        descricao: input.descricao,
        criadoEm: new Date().toISOString(),
      };
      state.feriados = [...state.feriados, novo].sort((a, b) => a.data.localeCompare(b.data));
      lsWrite(K_FERIADOS, state.feriados);
    }
    notify();
    void logAudit({
      acao: "criar",
      entidade: "feriado",
      detalhes: `${input.data}${input.descricao ? ` — ${input.descricao}` : ""}`,
    });
  },
  async remove(id: string) {
    const f = state.feriados.find((x) => x.id === id);
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb.from("feriados").delete().eq("id", id);
      if (error) throw error;
    }
    state.feriados = state.feriados.filter((x) => x.id !== id);
    if (!supabaseEnabled) lsWrite(K_FERIADOS, state.feriados);
    notify();
    void logAudit({ acao: "remover", entidade: "feriado", entidadeId: id, detalhes: f?.data });
  },
};

// ============================================================
// API — config de produção (1 linha por org)
// ============================================================
export const configProducaoApi = {
  async save(cfg: ConfigProducao) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      // Existe linha? Atualiza. Senão, insere (org_id preenchido pelo default da tabela).
      const { data: existing } = await sb.from("config_producao").select("org_id").maybeSingle();
      if (existing) {
        const { error } = await sb
          .from("config_producao")
          .update({ ...configProducaoToDb(cfg), atualizado_em: new Date().toISOString() })
          .eq("org_id", (existing as { org_id: string }).org_id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("config_producao").insert(configProducaoToDb(cfg));
        if (error) throw error;
      }
      state.configProducao = cfg;
    } else {
      state.configProducao = cfg;
      lsWrite(K_CONFIG_PROD, cfg);
    }
    notify();
    void logAudit({
      acao: "editar",
      entidade: "config_producao",
      detalhes: `dia ${cfg.diaBase} · início ${cfg.dataInicioRegra}`,
    });
  },
};

// ============================================================
// API — config de performance (1 linha por org)
// ============================================================
export const performanceConfigApi = {
  async save(cfg: ConfigPerformance) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data: existing } = await sb.from("performance_config").select("org_id").maybeSingle();
      if (existing) {
        const { error } = await sb
          .from("performance_config")
          .update({ ...performanceConfigToDb(cfg), atualizado_em: new Date().toISOString() })
          .eq("org_id", (existing as { org_id: string }).org_id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("performance_config").insert(performanceConfigToDb(cfg));
        if (error) throw error;
      }
      state.performanceConfig = cfg;
    } else {
      state.performanceConfig = cfg;
      lsWrite(K_PERF_CONFIG, cfg);
    }
    notify();
    void logAudit({ acao: "editar", entidade: "performance_config", detalhes: "pesos/metas" });
  },
};

// ============================================================
// API — histórico de performance (snapshot por vendedor/ciclo)
// ============================================================
export const performanceHistoricoApi = {
  async upsert(snap: Omit<PerformanceSnapshot, "id" | "criadoEm">) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data, error } = await sb
        .from("performance_historico")
        .upsert(performanceSnapToDb(snap), { onConflict: "org_id,vendedor_id,ciclo" })
        .select()
        .single();
      if (error) throw error;
      const novo = performanceSnapFromDb(data as DbPerformanceHistorico);
      const idx = state.performanceHistorico.findIndex(
        (h) => h.vendedorId === snap.vendedorId && h.ciclo === snap.ciclo,
      );
      if (idx >= 0) state.performanceHistorico = state.performanceHistorico.map((h, i) => (i === idx ? novo : h));
      else state.performanceHistorico = [novo, ...state.performanceHistorico];
    } else {
      const idx = state.performanceHistorico.findIndex(
        (h) => h.vendedorId === snap.vendedorId && h.ciclo === snap.ciclo,
      );
      const existenteId = idx >= 0 ? state.performanceHistorico[idx].id : uid();
      const novo: PerformanceSnapshot = { ...snap, id: existenteId, criadoEm: new Date().toISOString() };
      if (idx >= 0) state.performanceHistorico = state.performanceHistorico.map((h, i) => (i === idx ? novo : h));
      else state.performanceHistorico = [novo, ...state.performanceHistorico];
      lsWrite(K_PERF_HIST, state.performanceHistorico);
    }
    notify();
  },
};

// ============================================================
// API — temas (Temporadas / camada VISUAL). Não toca em nenhum cálculo.
// ============================================================
function recomputeTemaAtivo() {
  state.temaAtivo = temaAtivoDe(state.temas);
}

export const temasApi = {
  async add(input: Omit<Tema, "id" | "criadoEm">) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data, error } = await sb.from("temas").insert(temaToDb(input)).select().single();
      if (error) throw error;
      state.temas = [...state.temas, temaFromDb(data as DbTema)];
    } else {
      const novo: Tema = { ...input, id: uid(), criadoEm: new Date().toISOString() };
      state.temas = [...state.temas, novo];
      lsWrite(K_TEMAS, state.temas);
    }
    recomputeTemaAtivo();
    notify();
    void logAudit({ acao: "criar", entidade: "tema", detalhes: input.nome });
  },
  async update(id: string, patch: Partial<Tema>) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb
        .from("temas")
        .update({ ...temaToDb(patch), atualizado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    }
    state.temas = state.temas.map((t) => (t.id === id ? { ...t, ...patch } : t));
    if (!supabaseEnabled) lsWrite(K_TEMAS, state.temas);
    recomputeTemaAtivo();
    notify();
    void logAudit({ acao: "editar", entidade: "tema", entidadeId: id, detalhes: patch.nome });
  },
  async remove(id: string) {
    const nome = state.temas.find((t) => t.id === id)?.nome;
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { error } = await sb.from("temas").delete().eq("id", id);
      if (error) throw error;
    }
    state.temas = state.temas.filter((t) => t.id !== id);
    if (!supabaseEnabled) lsWrite(K_TEMAS, state.temas);
    recomputeTemaAtivo();
    notify();
    void logAudit({ acao: "remover", entidade: "tema", entidadeId: id, detalhes: nome });
  },
  async duplicar(id: string) {
    const orig = state.temas.find((t) => t.id === id);
    if (!orig) return;
    const slug = slugUnico(`${orig.slug}-copia`, state.temas.map((t) => t.slug));
    await temasApi.add({
      nome: `${orig.nome} (cópia)`,
      slug,
      status: "rascunho",
      estilo: orig.estilo,
      dataInicio: orig.dataInicio,
      dataFim: orig.dataFim,
    });
  },
  async ativar(id: string) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      // desativa o ativo atual (índice único garante 1) e ativa o novo
      await sb.from("temas").update({ status: "inativo" }).eq("status", "ativo");
      const { error } = await sb.from("temas").update({ status: "ativo" }).eq("id", id);
      if (error) throw error;
    }
    state.temas = state.temas.map((t) => ({
      ...t,
      status: t.id === id ? "ativo" : t.status === "ativo" ? "inativo" : t.status,
    }));
    if (!supabaseEnabled) lsWrite(K_TEMAS, state.temas);
    recomputeTemaAtivo();
    notify();
    void logAudit({ acao: "ativar", entidade: "tema", entidadeId: id });
  },
  async setStatus(id: string, status: StatusTema) {
    await temasApi.update(id, { status });
  },
  /** Semeia os 5 temas padrão (só se ainda não houver tema). */
  async seedPadrao() {
    if (state.temas.length > 0) return;
    for (const seed of TEMAS_PADRAO) {
      await temasApi.add({ nome: seed.nome, slug: seed.slug, status: seed.status, estilo: seed.estilo });
    }
  },
};

// ============================================================
// API — sessão
// ============================================================
export const sessionApi = {
  async signIn(email: string, senha: string) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      const u = data.user;
      if (!u) throw new Error("Sessão inválida");
      state.session = await buildSession(u);
      await Promise.all([
        reloadVendedores(),
        reloadVendas(),
        reloadClientes(),
        reloadLeads(),
        reloadMetas(),
        reloadFeriados(),
        reloadConfigProducao(),
        reloadPerformanceConfig(),
        reloadPerformanceHistorico(),
        reloadTemas(),
        reloadAudit(),
      ]);
      attachRealtime();
    } else {
      state.session = {
        id: "u-admin",
        nome: email.split("@")[0],
        email,
        papel: "admin",
      };
      lsWrite(K_SESSION, state.session);
      // Recarrega dados do localStorage (signOut anterior pode ter limpado o state)
      state.vendedores = lsRead<Vendedor[]>(K_VENDEDORES, []);
      state.vendas = lsRead<Venda[]>(K_VENDAS, []);
      state.clientes = lsRead<Cliente[]>(K_CLIENTES, []);
      state.leads = lsRead<Lead[]>(K_LEADS, []);
      state.metas = lsRead<Meta[]>(K_METAS, []);
      state.feriados = lsRead<Feriado[]>(K_FERIADOS, []);
      state.configProducao = lsRead<ConfigProducao>(K_CONFIG_PROD, CONFIG_PRODUCAO_PADRAO);
      state.performanceConfig = lsRead<ConfigPerformance>(K_PERF_CONFIG, CONFIG_PERFORMANCE_PADRAO);
      state.performanceHistorico = lsRead<PerformanceSnapshot[]>(K_PERF_HIST, []);
      state.temas = lsRead<Tema[]>(K_TEMAS, []);
      state.temaAtivo = temaAtivoDe(state.temas);
      state.audit = lsRead<AuditLog[]>(K_AUDIT, []);
    }
    notify();
    void logAudit({ acao: "login", entidade: "sessao", detalhes: email });
  },
  async signUp(email: string, senha: string, nome: string) {
    if (!supabaseEnabled) return sessionApi.signIn(email, senha);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });
    if (error) throw error;
    await sessionApi.signIn(email, senha);
  },
  async signOut() {
    const email = state.session?.email;
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      await sb.auth.signOut();
    } else {
      lsWrite(K_SESSION, null);
    }
    state.session = null;
    state.vendedores = [];
    state.vendas = [];
    state.clientes = [];
    state.leads = [];
    state.metas = [];
    state.feriados = [];
    state.configProducao = CONFIG_PRODUCAO_PADRAO;
    state.performanceConfig = CONFIG_PERFORMANCE_PADRAO;
    state.performanceHistorico = [];
    state.temas = [];
    state.temaAtivo = TEMA_LB_PREMIUM;
    notify();
    void logAudit({ acao: "logout", entidade: "sessao", detalhes: email });
  },
  /** Envia email com link de recuperação de senha. */
  async resetPasswordForEmail(email: string) {
    if (!supabaseEnabled) {
      throw new Error("Recuperação de senha exige Supabase configurado.");
    }
    const sb = supabaseBrowser();
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=/redefinir-senha`
        : undefined;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  },
  /** Define uma nova senha (usuário já autenticado via link de recuperação). */
  async updatePassword(novaSenha: string) {
    if (!supabaseEnabled) {
      throw new Error("Troca de senha exige Supabase configurado.");
    }
    const sb = supabaseBrowser();
    const { error } = await sb.auth.updateUser({ password: novaSenha });
    if (error) throw error;
  },
};
