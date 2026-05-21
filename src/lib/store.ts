"use client";

import { useSyncExternalStore } from "react";
import { supabaseBrowser, supabaseEnabled } from "./supabase/client";
import {
  auditFromDb,
  auditToDb,
  clienteFromDb,
  clienteToDb,
  leadFromDb,
  leadToDb,
  metaFromDb,
  metaToDb,
  vendaFromDb,
  vendaToDb,
  vendedorFromDb,
  vendedorToDb,
  type DbAuditLog,
  type DbCliente,
  type DbLead,
  type DbMeta,
  type DbVenda,
  type DbVendedor,
} from "./repo/mappers";
import type {
  AuditLog,
  Cliente,
  Lead,
  Meta,
  SessionUser,
  Venda,
  Vendedor,
} from "./types";
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
  audit: AuditLog[];
  session: SessionUser | null;
  ready: boolean;
};

const state: State = {
  vendedores: [],
  vendas: [],
  clientes: [],
  leads: [],
  metas: [],
  audit: [],
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

export function initStore(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data: userData } = await sb.auth.getUser();
      if (userData.user) {
        state.session = {
          id: userData.user.id,
          nome:
            (userData.user.user_metadata?.nome as string | undefined) ??
            userData.user.email?.split("@")[0] ??
            "Usuário",
          email: userData.user.email ?? "",
          papel: "admin",
        };
        await Promise.all([
          reloadVendedores(),
          reloadVendas(),
          reloadClientes(),
          reloadLeads(),
          reloadMetas(),
          reloadAudit(),
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

function attachRealtime() {
  if (realtimeAttached) return;
  realtimeAttached = true;
  const sb = supabaseBrowser();
  const sub = (table: string, reload: () => Promise<void>) =>
    sb.channel(`lb-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => reload())
      .subscribe();
  sub("vendedores", reloadVendedores);
  sub("vendas", reloadVendas);
  sub("clientes", reloadClientes);
  sub("leads", reloadLeads);
  sub("metas", reloadMetas);
  sub("audit_log", reloadAudit);
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
export function useMetas(): Meta[] {
  return useSyncExternalStore(subscribe, () => state.metas, () => state.metas);
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
  async add(input: Omit<Lead, "id" | "criadoEm">) {
    if (supabaseEnabled) {
      const sb = supabaseBrowser();
      const { data, error } = await sb.from("leads").insert(leadToDb(input)).select().single();
      if (error) throw error;
      state.leads = [leadFromDb(data as DbLead), ...state.leads];
    } else {
      const novo: Lead = { ...input, id: uid(), criadoEm: new Date().toISOString() };
      state.leads = [novo, ...state.leads];
      lsWrite(K_LEADS, state.leads);
    }
    notify();
    void logAudit({ acao: "criar", entidade: "lead", detalhes: input.nome });
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
      state.session = {
        id: u.id,
        nome:
          (u.user_metadata?.nome as string | undefined) ??
          u.email?.split("@")[0] ??
          "Usuário",
        email: u.email ?? email,
        papel: "admin",
      };
      await Promise.all([
        reloadVendedores(),
        reloadVendas(),
        reloadClientes(),
        reloadLeads(),
        reloadMetas(),
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
    notify();
    void logAudit({ acao: "logout", entidade: "sessao", detalhes: email });
  },
};
