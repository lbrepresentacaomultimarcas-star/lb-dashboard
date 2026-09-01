import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSessao } from "@/lib/sessao-guard";

/**
 * Roster (elenco) da EMPRESA do usuário logado — qualquer cargo pode ler.
 * Colunas mínimas para o motor de escopo do RBAC (lib/scope.ts) montar, no
 * client, quem pertence a cada equipe (equipe_id) e o vínculo de vendas de
 * cada um (vendedor_ref).
 *
 * Isolado por empresa: só devolve profiles da mesma org do caller. Não expõe
 * dados de outras empresas (SaaS). RLS-ready: no futuro isso vira uma função
 * SQL security-definer / policies, sem mudar o consumo no store.
 */
export async function GET() {
  // Passa pela guarda comum em vez de conferir o login por conta própria: ela
  // já resolve org e, principalmente, recusa quem está bloqueado. Esta rota
  // devolve o elenco inteiro da empresa (nome, email, cargo) — não é coisa
  // para uma conta bloqueada continuar lendo.
  const sessao = await requireSessao();
  if (sessao instanceof Response) return sessao;
  const orgId = sessao.orgId;

  const admin = supabaseAdmin();
  const [rosterRes, equipesRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, nome, email, papel, vendedor_id, equipe_id, vendedor_ref, ativo, criado_em")
      .or(`id.eq.${orgId},vendedor_id.eq.${orgId}`)
      .order("criado_em", { ascending: true }),
    // Equipes da MESMA empresa — nome/cor/líder/supervisor p/ a tela Minha Equipe.
    admin
      .from("equipes")
      .select("id, nome, cor, lider_id, supervisor_id, criado_em")
      .eq("org_id", orgId)
      .order("criado_em", { ascending: true }),
  ]);
  if (rosterRes.error) return Response.json({ error: rosterRes.error.message }, { status: 400 });
  return Response.json({ roster: rosterRes.data ?? [], equipes: equipesRes.data ?? [] });
}
