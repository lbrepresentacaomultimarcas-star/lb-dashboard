"use client";

/**
 * Acesso a dados do Plano de Desenvolvimento.
 *
 * Em produção tudo passa pelo Supabase: quem pode ler/escrever é decidido pela
 * RLS e pelos gatilhos (o colaborador não consegue mudar nota nem validar,
 * nem chamando a API direto). As notificações também nascem no banco.
 *
 * No modo demonstração (sem Supabase) os dados ficam no navegador, só para
 * a prévia funcionar.
 */
import { supabaseBrowser, supabaseEnabled } from "./supabase/client";
import {
  CONFIG_DEV_PADRAO,
  avaliacaoFromDb,
  avaliacaoToDb,
  passoFromDb,
  passoToDb,
  promocaoFromDb,
  type AvaliacaoMensal,
  type PromocaoAgendada,
  type ConfigDesenvolvimento,
  type PassoPlano,
} from "./desenvolvimento";
import { uid } from "./utils";

const K_PASSOS = "lb:dev_passos";
const K_AVAL = "lb:dev_avaliacoes";
const K_CFG = "lb:dev_config";
const K_PROMO = "lb:dev_promocoes";

function ler<T>(k: string, padrao: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
}
function gravar<T>(k: string, v: T) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* modo demonstração sem armazenamento: segue em memória */
  }
}

/** Avisa as telas abertas que algo do desenvolvimento mudou (recarregar). */
const ouvintes = new Set<() => void>();
export function aoMudarDesenvolvimento(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
function mudou() {
  ouvintes.forEach((f) => f());
}

function exigir<T>(data: T[] | null, oQue: string): void {
  if (!data || data.length === 0) throw new Error(`Sem permissão para ${oQue}.`);
}

export const passosApi = {
  async listar(profileId?: string): Promise<PassoPlano[]> {
    if (!supabaseEnabled) {
      const todos = ler<PassoPlano[]>(K_PASSOS, []);
      return (profileId ? todos.filter((p) => p.profileId === profileId) : todos).sort(
        (a, b) => a.ordem - b.ordem || (a.criadoEm ?? "").localeCompare(b.criadoEm ?? ""),
      );
    }
    let q = supabaseBrowser().from("plano_passos").select("*").order("ordem").order("criado_em");
    if (profileId) q = q.eq("profile_id", profileId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => passoFromDb(r as Record<string, unknown>));
  },

  async criar(p: Omit<PassoPlano, "id" | "status">): Promise<void> {
    if (!supabaseEnabled) {
      gravar(K_PASSOS, [...ler<PassoPlano[]>(K_PASSOS, []), { ...p, id: uid(), status: "pendente", criadoEm: new Date().toISOString() }]);
      return mudou();
    }
    const { data, error } = await supabaseBrowser().from("plano_passos").insert(passoToDb(p)).select("id");
    if (error) throw error;
    exigir(data, "cadastrar passos");
    mudou();
  },

  async atualizar(id: string, patch: Partial<PassoPlano>): Promise<void> {
    if (!supabaseEnabled) {
      const agora = new Date().toISOString();
      gravar(
        K_PASSOS,
        ler<PassoPlano[]>(K_PASSOS, []).map((p) => {
          if (p.id !== id) return p;
          const novo = { ...p, ...patch };
          if (patch.status === "concluido") novo.concluidoEm = agora;
          if (patch.status === "aprovado" || patch.status === "ajustar") novo.validadoEm = agora;
          return novo;
        }),
      );
      return mudou();
    }
    const { data, error } = await supabaseBrowser().from("plano_passos").update(passoToDb(patch)).eq("id", id).select("id");
    if (error) throw error;
    exigir(data, "alterar este passo");
    mudou();
  },

  async excluir(id: string): Promise<void> {
    if (!supabaseEnabled) {
      gravar(K_PASSOS, ler<PassoPlano[]>(K_PASSOS, []).filter((p) => p.id !== id));
      return mudou();
    }
    const { data, error } = await supabaseBrowser().from("plano_passos").delete().eq("id", id).select("id");
    if (error) throw error;
    exigir(data, "excluir este passo");
    mudou();
  },
};

export const avaliacoesApi = {
  async listar(profileId?: string): Promise<AvaliacaoMensal[]> {
    if (!supabaseEnabled) {
      const todas = ler<AvaliacaoMensal[]>(K_AVAL, []);
      return (profileId ? todas.filter((a) => a.profileId === profileId) : todas).sort((a, b) => b.mes.localeCompare(a.mes));
    }
    let q = supabaseBrowser().from("avaliacoes_mensais").select("*").order("mes", { ascending: false });
    if (profileId) q = q.eq("profile_id", profileId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => avaliacaoFromDb(r as Record<string, unknown>));
  },

  /** Publica (nova) ou edita a avaliação do mês. Só o admin consegue. */
  async salvar(a: Omit<AvaliacaoMensal, "id"> & { id?: string }, avaliador?: string): Promise<void> {
    if (!supabaseEnabled) {
      const lista = ler<AvaliacaoMensal[]>(K_AVAL, []);
      const agora = new Date().toISOString();
      const existente = lista.find((x) => x.id === a.id || (x.profileId === a.profileId && x.mes === a.mes));
      const nova: AvaliacaoMensal = {
        ...(existente ?? {}),
        ...a,
        id: existente?.id ?? uid(),
        avaliadorNome: avaliador,
        cienciaEm: undefined, // mudou a avaliação: o colaborador lê de novo
        atualizadoEm: agora,
      } as AvaliacaoMensal;
      gravar(K_AVAL, [...lista.filter((x) => x.id !== nova.id), nova]);
      return mudou();
    }
    const sb = supabaseBrowser();
    const linha = avaliacaoToDb(a);
    const { data, error } = a.id
      ? await sb.from("avaliacoes_mensais").update(linha).eq("id", a.id).select("id")
      : await sb.from("avaliacoes_mensais").insert(linha).select("id");
    if (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("Já existe avaliação deste mês para esta pessoa. Edite a existente.");
      throw error;
    }
    exigir(data, "publicar a avaliação");
    mudou();
  },

  /** "Li e estou ciente", com resposta opcional. Só o próprio colaborador. */
  async darCiencia(id: string, resposta?: string): Promise<void> {
    if (!supabaseEnabled) {
      const agora = new Date().toISOString();
      gravar(
        K_AVAL,
        ler<AvaliacaoMensal[]>(K_AVAL, []).map((x) =>
          x.id === id ? { ...x, cienciaEm: x.cienciaEm ?? agora, resposta: resposta?.trim() || x.resposta, respostaEm: resposta?.trim() ? agora : x.respostaEm } : x,
        ),
      );
      return mudou();
    }
    const patch: Record<string, unknown> = { ciencia_em: new Date().toISOString() };
    if (resposta !== undefined) patch.resposta = resposta.trim() || null;
    const { data, error } = await supabaseBrowser().from("avaliacoes_mensais").update(patch).eq("id", id).select("id");
    if (error) throw error;
    exigir(data, "confirmar a leitura");
    mudou();
  },

  async excluir(id: string): Promise<void> {
    if (!supabaseEnabled) {
      gravar(K_AVAL, ler<AvaliacaoMensal[]>(K_AVAL, []).filter((x) => x.id !== id));
      return mudou();
    }
    const { data, error } = await supabaseBrowser().from("avaliacoes_mensais").delete().eq("id", id).select("id");
    if (error) throw error;
    exigir(data, "excluir a avaliação");
    mudou();
  },
};

export const configDevApi = {
  async ler(): Promise<ConfigDesenvolvimento> {
    if (!supabaseEnabled) return ler<ConfigDesenvolvimento>(K_CFG, CONFIG_DEV_PADRAO);
    const { data } = await supabaseBrowser().from("config_desenvolvimento").select("*").maybeSingle();
    if (!data) return CONFIG_DEV_PADRAO;
    const r = data as Record<string, unknown>;
    return { diaAvaliacao: Number(r.dia_avaliacao ?? 5), primeiroMes: String(r.primeiro_mes ?? CONFIG_DEV_PADRAO.primeiroMes) };
  },
  async salvar(cfg: ConfigDesenvolvimento): Promise<void> {
    if (!supabaseEnabled) {
      gravar(K_CFG, cfg);
      return mudou();
    }
    const { data, error } = await supabaseBrowser()
      .from("config_desenvolvimento")
      .upsert({ dia_avaliacao: cfg.diaAvaliacao, primeiro_mes: cfg.primeiroMes, atualizado_em: new Date().toISOString() }, { onConflict: "org_id" })
      .select("org_id");
    if (error) throw error;
    exigir(data, "mudar a configuração");
    mudou();
  },
};

/** Cria os lembretes do dia para quem está logado (o banco evita repetir). */
export async function gerarLembretesDesenvolvimento(): Promise<void> {
  if (!supabaseEnabled) return;
  await supabaseBrowser().rpc("lb_dev_lembretes");
}

export const promocoesApi = {
  async listar(profileId: string): Promise<PromocaoAgendada[]> {
    if (!supabaseEnabled)
      return ler<PromocaoAgendada[]>(K_PROMO, []).filter((p) => p.profileId === profileId).sort((a, b) => b.dataHora.localeCompare(a.dataHora));
    const { data, error } = await supabaseBrowser()
      .from("promocoes_agendadas")
      .select("*")
      .eq("profile_id", profileId)
      .order("data_hora", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => promocaoFromDb(r as Record<string, unknown>));
  },

  async agendar(p: { profileId: string; cargoAtual?: string; cargoNovo: string; dataHora: string; mensagem?: string }): Promise<void> {
    if (!supabaseEnabled) {
      const lista = ler<PromocaoAgendada[]>(K_PROMO, []);
      if (lista.some((x) => x.profileId === p.profileId && x.status === "agendada"))
        throw new Error("Já existe uma promoção agendada para esta pessoa. Remarque a existente.");
      gravar(K_PROMO, [...lista, { ...p, id: uid(), status: "agendada", criadoEm: new Date().toISOString() }]);
      return mudou();
    }
    const { data, error } = await supabaseBrowser()
      .from("promocoes_agendadas")
      .insert({ profile_id: p.profileId, cargo_novo: p.cargoNovo, data_hora: p.dataHora, mensagem: p.mensagem?.trim() || null })
      .select("id");
    if (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("Já existe uma promoção agendada para esta pessoa. Remarque a existente.");
      throw error;
    }
    exigir(data, "agendar a promoção");
    mudou();
  },

  async atualizar(
    id: string,
    patch: Partial<Pick<PromocaoAgendada, "cargoNovo" | "dataHora" | "mensagem" | "status" | "comemoracaoVistaEm">>,
  ): Promise<void> {
    if (!supabaseEnabled) {
      const agora = new Date().toISOString();
      gravar(
        K_PROMO,
        ler<PromocaoAgendada[]>(K_PROMO, []).map((x) =>
          x.id === id ? { ...x, ...patch, ...(patch.status === "realizada" ? { realizadaEm: agora } : {}) } : x,
        ),
      );
      return mudou();
    }
    const linha: Record<string, unknown> = {};
    if (patch.cargoNovo !== undefined) linha.cargo_novo = patch.cargoNovo;
    if (patch.dataHora !== undefined) linha.data_hora = patch.dataHora;
    if (patch.mensagem !== undefined) linha.mensagem = patch.mensagem?.trim() || null;
    if (patch.status !== undefined) linha.status = patch.status;
    if (patch.comemoracaoVistaEm !== undefined) linha.comemoracao_vista_em = patch.comemoracaoVistaEm;
    const { data, error } = await supabaseBrowser().from("promocoes_agendadas").update(linha).eq("id", id).select("id");
    if (error) throw error;
    exigir(data, "alterar a promoção");
    mudou();
  },

  /** A promoção feita que o próprio colaborador ainda não comemorou na tela. */
  async comemoracaoPendente(profileId: string): Promise<PromocaoAgendada | null> {
    const lista = await promocoesApi.listar(profileId);
    return lista.find((p) => p.status === "realizada" && !p.comemoracaoVistaEm) ?? null;
  },
};
