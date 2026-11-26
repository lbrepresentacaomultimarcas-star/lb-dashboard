"use client";

import { supabaseBrowser, supabaseEnabled } from "./supabase/client";
import type { MetricaPlano } from "./evolucao";

/**
 * PLANO PESSOAL DE EVOLUÇÃO.
 *
 * É a intenção do colaborador, escrita por ele. Não promove, não muda cargo,
 * não muda permissão — vira assunto para a conversa de desenvolvimento com o
 * administrador, e nada mais.
 *
 * A escrita é do dono e só dele: nem o admin escreve por cima (a regra está na
 * policy do banco, não só aqui). O admin LÊ, para poder conversar.
 */
export type PlanoEvolucao = {
  profileId: string;
  objetivo?: string;
  prazoMeses?: number;
  metaTexto?: string;
  /** Quando preenchida junto com `alvo`, dá para medir progresso de verdade. */
  metrica?: MetricaPlano;
  alvo?: number;
  foco?: string;
  /** quando o colaborador começou a definir o caminho (1º registro) */
  criadoEm?: string;
  atualizadoEm?: string;
};

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));
const n = (v: unknown) => (v == null ? undefined : Number(v));

const fromDb = (r: Row): PlanoEvolucao => ({
  profileId: String(r.profile_id),
  objetivo: s(r.objetivo),
  prazoMeses: n(r.prazo_meses),
  metaTexto: s(r.meta_texto),
  metrica: s(r.metrica) as MetricaPlano | undefined,
  alvo: n(r.alvo),
  foco: s(r.foco),
  criadoEm: s(r.criado_em),
  atualizadoEm: s(r.atualizado_em),
});

/** Modo demonstração: os planos ficam no navegador (só para a prévia). */
const K_DEMO = "lb:planos_evolucao";
function demoLer(): PlanoEvolucao[] {
  try {
    return JSON.parse(localStorage.getItem(K_DEMO) ?? "[]") as PlanoEvolucao[];
  } catch {
    return [];
  }
}

export const planosApi = {
  /** Todos os planos que quem está logado pode ver (o admin vê todos; RLS decide). */
  async listarTodos(): Promise<PlanoEvolucao[]> {
    if (!supabaseEnabled) return demoLer();
    const { data, error } = await supabaseBrowser().from("planos_evolucao").select("*");
    if (error) throw error;
    return (data ?? []).map((r) => fromDb(r as Row));
  },

  /** O plano de uma pessoa. `null` quando ela ainda não escreveu o dela. */
  async ler(profileId: string): Promise<PlanoEvolucao | null> {
    if (!supabaseEnabled) return demoLer().find((p) => p.profileId === profileId) ?? null;
    const { data } = await supabaseBrowser()
      .from("planos_evolucao")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle();
    return data ? fromDb(data as Row) : null;
  },

  /**
   * Grava o plano do PRÓPRIO usuário.
   *
   * `upsert` porque cada pessoa tem UM plano, não um histórico: escrever de
   * novo é revisar o mesmo plano, não criar outro.
   */
  async salvar(p: PlanoEvolucao): Promise<void> {
    if (!supabaseEnabled) {
      const agora = new Date().toISOString();
      const antes = demoLer().find((x) => x.profileId === p.profileId);
      const novo = { ...p, criadoEm: antes?.criadoEm ?? agora, atualizadoEm: agora };
      try {
        localStorage.setItem(K_DEMO, JSON.stringify([...demoLer().filter((x) => x.profileId !== p.profileId), novo]));
      } catch {
        /* sem armazenamento no modo demonstração */
      }
      return;
    }
    const { error } = await supabaseBrowser()
      .from("planos_evolucao")
      .upsert(
        {
          profile_id: p.profileId,
          objetivo: p.objetivo || null,
          prazo_meses: p.prazoMeses ?? null,
          meta_texto: p.metaTexto || null,
          metrica: p.metrica || null,
          alvo: p.alvo ?? null,
          foco: p.foco || null,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      )
      .select("profile_id");
    if (error) throw error;
  },
};
