import { NextRequest } from "next/server";
import crypto from "node:crypto";

import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guardarFormularios, tokenDaPagina } from "@/lib/server/meta-conexao";
import {
  ErroMeta,
  criarFormulario,
  lerFormulario,
  type PerguntaFormulario,
} from "@/lib/server/meta-api";

/**
 * VERSÃO COM CIDADE DOS FORMULÁRIOS.
 *
 * Formulário publicado na Meta não pode ser editado, só duplicado. Então este
 * caminho lê a definição de cada formulário atual, acrescenta a pergunta de
 * cidade e cria um NOVO. Os atuais não são tocados — a campanha em andamento
 * segue funcionando, e os novos entram quando as próximas campanhas subirem.
 *
 * A cidade tem que vir do formulário porque a Meta não entrega cidade no
 * detalhamento do Brasil: o recorte geográfico dela para no estado.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PERGUNTA_CIDADE: PerguntaFormulario = {
  type: "CUSTOM",
  key: "cidade",
  label: "De qual cidade você é?",
};

/** Só os formulários da sondagem — o antigo e o padrão ficam de fora. */
/**
 * A leitura devolve chaves que a criação recusa ("id" na pergunta, por exemplo).
 * Aqui fica só o que descreve a pergunta — o resto é identificador do formulário
 * antigo e não faz sentido no novo.
 */
function limparPergunta(q: PerguntaFormulario): PerguntaFormulario {
  const limpa: PerguntaFormulario = { type: q.type };
  if (q.key) limpa.key = q.key;
  if (q.label) limpa.label = q.label;
  if (q.options?.length) {
    limpa.options = q.options.map((o) => (o.key ? { key: o.key, value: o.value } : { value: o.value }));
  }
  return limpa;
}

/**
 * Mesmo problema do lado dos objetos compostos: a leitura devolve `id` e a foto
 * de capa como objeto (`cover_photo`), mas a criação quer só o identificador
 * dela (`cover_photo_id`). Sem essa tradução, o formulário novo nasceria sem a
 * capa — e a capa foi trabalho aprovado.
 */
function limparCartao(c?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!c) return undefined;
  const fora = new Set(["id", "cover_photo"]);
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) if (!fora.has(k) && v != null) limpo[k] = v;
  const foto = c.cover_photo as { id?: string } | undefined;
  if (foto?.id) limpo.cover_photo_id = foto.id;
  return limpo;
}

/** Objetos que só precisam perder o identificador do formulário antigo. */
function semId(o?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!o) return undefined;
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (k !== "id" && v != null) limpo[k] = v;
  return limpo;
}

const PREFIXO = "LB | ";
const SUFIXO = " · com cidade";

async function autorizar(req: NextRequest): Promise<{ orgId: string } | Response> {
  const segredo = process.env.TRAFEGO_SECRET?.trim();
  const enviado = req.headers.get("x-trafego-secret")?.trim();
  if (segredo && enviado) {
    const a = Buffer.from(segredo);
    const b = Buffer.from(enviado);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      const db = supabaseAdmin();
      const { data } = await db.from("meta_conexoes").select("org_id").eq("status", "ativa");
      const orgs = (data ?? []) as { org_id: string }[];
      if (orgs.length !== 1) {
        return Response.json({ error: `Esperava 1 conexão ativa, encontrei ${orgs.length}.` }, { status: 400 });
      }
      return { orgId: orgs[0].org_id };
    }
  }
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  return { orgId: guard.orgId };
}

export async function POST(req: NextRequest) {
  const quem = await autorizar(req);
  if (quem instanceof Response) return quem;
  const { orgId } = quem;

  const db = supabaseAdmin();
  const { data: pagina } = await db
    .from("meta_paginas")
    .select("page_id, nome")
    .eq("org_id", orgId)
    .eq("selecionada", true)
    .maybeSingle();
  if (!pagina) return Response.json({ error: "Nenhuma Página selecionada." }, { status: 400 });

  const pageId = (pagina as { page_id: string }).page_id;
  const token = await tokenDaPagina(orgId, pageId);
  if (!token) return Response.json({ error: "Token da Página indisponível." }, { status: 400 });

  const { data: formsRaw } = await db
    .from("meta_formularios")
    .select("form_id, nome")
    .eq("org_id", orgId)
    .eq("page_id", pageId);
  const forms = (formsRaw ?? []) as { form_id: string; nome: string }[];

  const molde = forms.filter((f) => f.nome.startsWith(PREFIXO) && !f.nome.endsWith(SUFIXO));
  if (!molde.length) return Response.json({ error: "Nenhum formulário da sondagem encontrado." }, { status: 400 });

  const criados: Record<string, string>[] = [];
  const falhas: Record<string, string>[] = [];

  for (const f of molde) {
    const nomeNovo = f.nome + SUFIXO;
    // idempotente: se já existe a versão com cidade, não cria de novo
    if (forms.some((x) => x.nome === nomeNovo)) {
      criados.push({ origem: f.nome, novo: nomeNovo, situacao: "ja_existia" });
      continue;
    }
    try {
      const def = await lerFormulario(f.form_id, token);
      const perguntas = def.questions ?? [];
      const jaTem = perguntas.some((q) => /cidade|city/i.test(q.key ?? "") || /cidade/i.test(q.label ?? ""));
      // a cidade entra ANTES dos campos de contato, junto das outras perguntas
      const ordenadas = jaTem
        ? perguntas
        : [
            ...perguntas.filter((q) => q.type === "CUSTOM"),
            PERGUNTA_CIDADE,
            ...perguntas.filter((q) => q.type !== "CUSTOM"),
          ];
      const novas = ordenadas.map(limparPergunta);

      /*
       * A Meta recusa campos do payload um a um e nem sempre diz qual. Em vez de
       * adivinhar mais uma rodada, tentamos do mais completo ao mais simples e
       * ficamos com o primeiro que passa: um formulário com a cidade e sem capa
       * vale mais que nenhum formulário. O relatório diz o que foi perdido.
       */
      const base = { name: nomeNovo, locale: def.locale, questions: novas };
      const tentativas: { rotulo: string; corpo: Parameters<typeof criarFormulario>[2] }[] = [
        {
          rotulo: "completo",
          corpo: {
            ...base,
            context_card: limparCartao(def.context_card),
            thank_you_page: semId(def.thank_you_page),
            follow_up_action_url: def.follow_up_action_url,
            block_display_for_non_targeted_viewer: def.block_display_for_non_targeted_viewer,
          },
        },
        {
          rotulo: "sem_capa",
          corpo: { ...base, thank_you_page: semId(def.thank_you_page), follow_up_action_url: def.follow_up_action_url },
        },
        { rotulo: "sem_tela_final", corpo: { ...base, follow_up_action_url: def.follow_up_action_url } },
        { rotulo: "minimo", corpo: base },
      ];

      let id: string | null = null;
      let comoFoi = "";
      let ultimoErro = "";
      for (const t of tentativas) {
        try {
          id = await criarFormulario(pageId, token, t.corpo);
          comoFoi = t.rotulo;
          break;
        } catch (e) {
          ultimoErro = e instanceof ErroMeta ? e.message : e instanceof Error ? e.message : String(e);
        }
      }
      if (!id) throw new ErroMeta(ultimoErro || "A Meta recusou todas as tentativas.");
      criados.push({ origem: f.nome, novo: nomeNovo, form_id: id, situacao: comoFoi });
      await guardarFormularios(orgId, pageId, [{ formId: id, nome: nomeNovo, status: "ACTIVE" }]);
    } catch (e) {
      falhas.push({
        origem: f.nome,
        erro: e instanceof ErroMeta ? e.message : e instanceof Error ? e.message : String(e),
      });
    }
  }

  return Response.json({ ok: falhas.length === 0, pagina: pageId, criados, falhas });
}
