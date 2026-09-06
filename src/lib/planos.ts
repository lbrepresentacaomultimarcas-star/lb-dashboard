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
  atualizadoEm: s(r.atualizado_em),
});

export const planosApi = {
  /** O plano de uma pessoa. `null` quando ela ainda não escreveu o dela. */
  async ler(profileId: string): Promise<PlanoEvolucao | null> {
    if (!supabaseEnabled) return null;
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
    if (!supabaseEnabled) return;
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
