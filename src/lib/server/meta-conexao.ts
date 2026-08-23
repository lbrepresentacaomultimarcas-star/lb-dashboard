import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { cifrar, decifrarOuNulo } from "./meta-crypto";

/**
 * Acesso ao "cofre" da conexão com a Meta.
 *
 * Regra de ouro: token só sai daqui para dentro do servidor. Nada nestas
 * funções devolve token para a tela — o que a tela recebe é montado nas rotas,
 * com nome da Página, status e mais nada.
 */

export type Conexao = {
  id: string;
  metaUserId: string | null;
  metaUserNome: string | null;
  businessId: string | null;
  businessNome: string | null;
  escopos: string[];
  expiraEm: string | null;
  status: "ativa" | "expirada" | "revogada";
  ultimoErro: string | null;
  conectadoPor: string | null;
  conectadoEm: string;
};

type LinhaConexao = {
  id: string;
  meta_user_id: string | null;
  meta_user_nome: string | null;
  business_id: string | null;
  business_nome: string | null;
  token_cifrado: string;
  escopos: string[] | null;
  expira_em: string | null;
  status: Conexao["status"];
  ultimo_erro: string | null;
  conectado_por: string | null;
  conectado_em: string;
};

const paraConexao = (r: LinhaConexao): Conexao => ({
  id: r.id,
  metaUserId: r.meta_user_id,
  metaUserNome: r.meta_user_nome,
  businessId: r.business_id,
  businessNome: r.business_nome,
  escopos: r.escopos ?? [],
  expiraEm: r.expira_em,
  status: r.status,
  ultimoErro: r.ultimo_erro,
  conectadoPor: r.conectado_por,
  conectadoEm: r.conectado_em,
});

/** Dados da conexão SEM o token — seguro para responder à tela. */
export async function conexaoDaOrg(orgId: string): Promise<Conexao | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("meta_conexoes")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  return data ? paraConexao(data as LinhaConexao) : null;
}

/** Token do usuário, decifrado. Uso exclusivo do servidor. */
export async function tokenDoUsuario(orgId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("meta_conexoes")
    .select("token_cifrado, status")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data || (data as { status: string }).status !== "ativa") return null;
  return decifrarOuNulo((data as { token_cifrado: string }).token_cifrado);
}

export async function salvarConexao(
  orgId: string,
  dados: {
    token: string;
    metaUserId?: string;
    metaUserNome?: string;
    businessId?: string | null;
    businessNome?: string | null;
    escopos: string[];
    expiraEm: string | null;
    conectadoPor: string;
  },
): Promise<string> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("meta_conexoes")
    .upsert(
      {
        org_id: orgId,
        meta_user_id: dados.metaUserId ?? null,
        meta_user_nome: dados.metaUserNome ?? null,
        business_id: dados.businessId ?? null,
        business_nome: dados.businessNome ?? null,
        token_cifrado: cifrar(dados.token),
        escopos: dados.escopos,
        expira_em: dados.expiraEm,
        status: "ativa",
        ultimo_erro: null,
        conectado_por: dados.conectadoPor,
        conectado_em: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function marcarErroNaConexao(orgId: string, erro: string): Promise<void> {
  const db = supabaseAdmin();
  await db.from("meta_conexoes").update({ ultimo_erro: erro }).eq("org_id", orgId);
}

export async function removerConexao(orgId: string): Promise<void> {
  const db = supabaseAdmin();
  // as Páginas caem junto (on delete cascade); os formulários saem explicitamente
  await db.from("meta_formularios").delete().eq("org_id", orgId);
  await db.from("meta_conexoes").delete().eq("org_id", orgId);
}

/* --------------------------------- Páginas -------------------------------- */

export type PaginaSalva = {
  pageId: string;
  nome: string;
  categoria: string | null;
  fotoUrl: string | null;
  selecionada: boolean;
  webhookAtivo: boolean;
  ultimoErro: string | null;
};

type LinhaPagina = {
  page_id: string;
  nome: string;
  categoria: string | null;
  foto_url: string | null;
  selecionada: boolean;
  webhook_ativo: boolean;
  ultimo_erro: string | null;
};

const paraPagina = (r: LinhaPagina): PaginaSalva => ({
  pageId: r.page_id,
  nome: r.nome,
  categoria: r.categoria,
  fotoUrl: r.foto_url,
  selecionada: r.selecionada,
  webhookAtivo: r.webhook_ativo,
  ultimoErro: r.ultimo_erro,
});

/** Páginas guardadas, SEM token — seguro para a tela. */
export async function paginasDaOrg(orgId: string): Promise<PaginaSalva[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("meta_paginas")
    .select("page_id, nome, categoria, foto_url, selecionada, webhook_ativo, ultimo_erro")
    .eq("org_id", orgId)
    .order("nome");
  return ((data as LinhaPagina[]) ?? []).map(paraPagina);
}

export async function guardarPaginas(
  orgId: string,
  conexaoId: string,
  paginas: {
    pageId: string;
    nome: string;
    categoria?: string;
    fotoUrl?: string;
    token?: string;
  }[],
): Promise<void> {
  if (paginas.length === 0) return;
  const db = supabaseAdmin();
  const { error } = await db.from("meta_paginas").upsert(
    paginas.map((p) => ({
      org_id: orgId,
      conexao_id: conexaoId,
      page_id: p.pageId,
      nome: p.nome,
      categoria: p.categoria ?? null,
      foto_url: p.fotoUrl ?? null,
      // Página sem token no retorno da Meta mantém o que já estava guardado
      ...(p.token ? { token_cifrado: cifrar(p.token) } : {}),
    })),
    { onConflict: "org_id,page_id" },
  );
  if (error) throw error;
}

/**
 * Token da Página, decifrado. É o que o webhook usa para ler o formulário.
 * Busca por page_id em QUALQUER org — o webhook não sabe de qual empresa é o
 * lead até resolver a Página. Devolve também o org_id encontrado.
 */
export async function tokenDaPaginaPorId(
  pageId: string,
): Promise<{ token: string; orgId: string } | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("meta_paginas")
    .select("token_cifrado, org_id")
    .eq("page_id", pageId)
    .eq("selecionada", true)
    .maybeSingle();
  if (!data) return null;
  const linha = data as { token_cifrado: string | null; org_id: string };
  const token = decifrarOuNulo(linha.token_cifrado);
  return token ? { token, orgId: linha.org_id } : null;
}

/** Token da Página escolhida por esta empresa (usado pelas telas do admin). */
export async function tokenDaPagina(orgId: string, pageId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("meta_paginas")
    .select("token_cifrado")
    .eq("org_id", orgId)
    .eq("page_id", pageId)
    .maybeSingle();
  return data ? decifrarOuNulo((data as { token_cifrado: string | null }).token_cifrado) : null;
}

export async function selecionarPagina(orgId: string, pageId: string): Promise<void> {
  const db = supabaseAdmin();
  // uma Página ativa por vez: desmarca todas e marca a escolhida
  await db.from("meta_paginas").update({ selecionada: false }).eq("org_id", orgId);
  await db
    .from("meta_paginas")
    .update({ selecionada: true })
    .eq("org_id", orgId)
    .eq("page_id", pageId);
}

export async function marcarWebhook(
  orgId: string,
  pageId: string,
  ativo: boolean,
  erro?: string | null,
): Promise<void> {
  const db = supabaseAdmin();
  await db
    .from("meta_paginas")
    .update({
      webhook_ativo: ativo,
      webhook_em: ativo ? new Date().toISOString() : null,
      ultimo_erro: erro ?? null,
    })
    .eq("org_id", orgId)
    .eq("page_id", pageId);
}

/* ------------------------------- formulários ------------------------------ */

export type FormularioSalvo = {
  formId: string;
  pageId: string;
  nome: string;
  status: string | null;
  ativo: boolean;
  leadsRecebidos: number;
  ultimoLeadEm: string | null;
};

type LinhaForm = {
  form_id: string;
  page_id: string;
  nome: string;
  status: string | null;
  ativo: boolean;
  leads_recebidos: number;
  ultimo_lead_em: string | null;
};

export async function formulariosDaOrg(
  orgId: string,
  pageId?: string,
): Promise<FormularioSalvo[]> {
  const db = supabaseAdmin();
  let q = db
    .from("meta_formularios")
    .select("form_id, page_id, nome, status, ativo, leads_recebidos, ultimo_lead_em")
    .eq("org_id", orgId);
  if (pageId) q = q.eq("page_id", pageId);
  const { data } = await q.order("nome");
  return ((data as LinhaForm[]) ?? []).map((r) => ({
    formId: r.form_id,
    pageId: r.page_id,
    nome: r.nome,
    status: r.status,
    ativo: r.ativo,
    leadsRecebidos: r.leads_recebidos,
    ultimoLeadEm: r.ultimo_lead_em,
  }));
}

export async function guardarFormularios(
  orgId: string,
  pageId: string,
  forms: { formId: string; nome: string; status?: string }[],
): Promise<void> {
  if (forms.length === 0) return;
  const db = supabaseAdmin();
  // `ativo` fica de fora do upsert de propósito: o que o admin marcou é preservado
  const { error } = await db.from("meta_formularios").upsert(
    forms.map((f) => ({
      org_id: orgId,
      page_id: pageId,
      form_id: f.formId,
      nome: f.nome,
      status: f.status ?? null,
    })),
    { onConflict: "org_id,form_id", ignoreDuplicates: false },
  );
  if (error) throw error;
}

export async function definirFormulariosAtivos(
  orgId: string,
  pageId: string,
  ativos: string[],
): Promise<void> {
  const db = supabaseAdmin();
  await db.from("meta_formularios").update({ ativo: false }).eq("org_id", orgId).eq("page_id", pageId);
  if (ativos.length > 0) {
    await db
      .from("meta_formularios")
      .update({ ativo: true })
      .eq("org_id", orgId)
      .eq("page_id", pageId)
      .in("form_id", ativos);
  }
}

/**
 * O formulário está liberado para entregar leads?
 * Se a empresa ainda não cadastrou nenhum formulário, NÃO bloqueia — melhor
 * receber um lead a mais do que perder um lead real por configuração faltando.
 */
export async function formularioLiberado(orgId: string, formId?: string): Promise<boolean> {
  if (!formId) return true;
  const db = supabaseAdmin();
  const { data } = await db
    .from("meta_formularios")
    .select("ativo")
    .eq("org_id", orgId)
    .eq("form_id", formId)
    .maybeSingle();
  if (!data) return true; // formulário novo/desconhecido: deixa passar
  return (data as { ativo: boolean }).ativo;
}

/**
 * "LB | Crédito para Carros" -> "Carro".
 *
 * Com um formulário por produto, o produto deixou de ser pergunta: ele É o
 * formulário. O nome cadastrado em `meta_formularios` é a fonte certa — as
 * respostas não servem, porque "R$ 60 a 80 mil" não diz que é carro e, no
 * solar, "Minha casa" diria imóvel.
 *
 * Ordem: do mais específico para o mais genérico.
 */
export function produtoPeloNome(nome: string): string | undefined {
  const t = nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const regras: [RegExp, string][] = [
    [/solar|fotovoltaic/, "Energia Solar"],
    [/maquina|maquinario|trator|implemento/, "Maquinário"],
    [/caminhao|caminhoes|carreta|truck/, "Caminhão"],
    [/moto/, "Moto"],
    [/carro|automovel|veiculo/, "Carro"],
    [/imobiliar|imovel|imoveis|casa|apartamento|terreno/, "Imóvel"],
    [/investiment/, "Investimento"],
  ];
  for (const [re, p] of regras) if (re.test(t)) return p;
  return undefined;
}

/** Produto do lead a partir do formulário que ele preencheu. */
export async function produtoDoFormulario(
  orgId: string | undefined,
  formId?: string,
): Promise<string | undefined> {
  if (!orgId || !formId) return undefined;
  const db = supabaseAdmin();
  const { data } = await db
    .from("meta_formularios")
    .select("nome")
    .eq("org_id", orgId)
    .eq("form_id", formId)
    .maybeSingle();
  const nome = (data as { nome?: string } | null)?.nome;
  return nome ? produtoPeloNome(nome) : undefined;
}

export async function registrarLeadRecebido(orgId: string, formId?: string): Promise<void> {
  if (!formId) return;
  const db = supabaseAdmin();
  const { data } = await db
    .from("meta_formularios")
    .select("leads_recebidos")
    .eq("org_id", orgId)
    .eq("form_id", formId)
    .maybeSingle();
  if (!data) return;
  await db
    .from("meta_formularios")
    .update({
      leads_recebidos: ((data as { leads_recebidos: number }).leads_recebidos ?? 0) + 1,
      ultimo_lead_em: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("form_id", formId);
}
