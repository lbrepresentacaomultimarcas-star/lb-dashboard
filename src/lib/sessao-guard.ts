import { supabaseServer } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";
import type { Papel } from "./types";
import { BLOQUEADO } from "./mensagens-acesso";

/**
 * Guarda para rotas que QUALQUER usuário logado pode chamar — diferente de
 * `requireAdmin`, que só deixa admin passar.
 *
 * Devolve o papel e o `vendedor_ref` para quem chamou decidir o escopo. Não
 * decide nada sozinha: quem sabe o que a rota faz é a rota.
 */
export type Sessao = {
  userId: string;
  orgId: string;
  email: string;
  nome: string;
  papel: Papel;
  /** vendedores.id do próprio usuário — é por ele que o escopo é medido. */
  vendedorRef: string | null;
};

export async function requireSessao(): Promise<Sessao | Response> {
  const sb = await supabaseServer();
  const { data: userRes } = await sb.auth.getUser();
  const user = userRes.user;
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, nome, papel, vendedor_id, vendedor_ref, email, ativo, codigo_liberado")
    .eq("id", user.id)
    .single();
  if (error || !profile) return Response.json({ error: "Profile não encontrado" }, { status: 403 });

  const p = profile as {
    id: string;
    nome: string | null;
    papel: Papel;
    vendedor_id: string | null;
    vendedor_ref: string | null;
    email: string;
    ativo: boolean | null;
    codigo_liberado: boolean | null;
  };

  // Bloqueio tem efeito AGORA, não no próximo login.
  //
  // Esta rota usa a chave de serviço, que passa por cima da RLS — então a
  // conferência precisa acontecer aqui, explicitamente. Sem ela, uma aba já
  // aberta (ou uma chamada direta pelo DevTools) continuaria operando com um
  // token que ainda não expirou.
  //
  // NULL conta como ativo: bloquear é sempre um ato explícito do admin.
  if (p.ativo === false) return Response.json({ error: BLOQUEADO, bloqueado: true }, { status: 403 });
  // Cadastrado mas ainda sem a liberação do admin: mesma porta fechada.
  if (p.codigo_liberado === false) {
    return Response.json(
      { error: "Seu acesso ainda não foi liberado pelo administrador.", bloqueado: true },
      { status: 403 },
    );
  }
  return {
    userId: user.id,
    orgId: p.vendedor_id ?? p.id,
    email: p.email,
    nome: p.nome ?? p.email,
    papel: p.papel,
    vendedorRef: p.vendedor_ref,
  };
}

/**
 * Esta pessoa pode mexer nesta análise?
 *
 * Admin e coordenador veem tudo. Os demais só o que é deles. É a mesma ideia
 * de `pode_ver_vendedor` no banco — repetida aqui porque a rota usa a chave de
 * serviço, que passa por cima do RLS: sem esta conferência, o RLS não protege
 * nada neste caminho.
 */
export function podeVerAnalise(s: Sessao, vendedorIdDaAnalise: string | null): boolean {
  if (s.papel === "admin" || s.papel === "coordenador") return true;
  if (!vendedorIdDaAnalise) return false;
  return s.vendedorRef === vendedorIdDaAnalise;
}
