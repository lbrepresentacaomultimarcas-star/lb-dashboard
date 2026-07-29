import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Papel } from "@/lib/types";

/**
 * Vínculo AUTOMÁTICO colaborador ↔ vendedor (fim do cadastro duplo).
 *
 * Regras:
 *  - Se já existe um vendedor com o mesmo e-mail NA MESMA empresa → apenas
 *    LINKA (profiles.vendedor_ref). Não mexe em meta/comissão (preserva).
 *  - Se o cargo é 'vendedor' e ainda não existe registro → CRIA o vendedor
 *    (org_id explícito, pois o service role não resolve current_org_id) e linka.
 *  - NUNCA apaga o registro de vendedor → promover Vendedor→Líder/Supervisor
 *    mantém histórico, metas, ranking e comissão intactos, e ele segue
 *    aparecendo como vendedor caso também venda (requisito 2).
 *
 * Idempotente e multi-tenant (sempre escopado por org_id). Retorna o
 * vendedor_ref final (ou null quando o cargo não vende e não havia registro).
 */
export async function syncVendedor(input: {
  profileId: string;
  nome: string;
  email: string;
  papel: Papel;
  orgId: string;
}): Promise<string | null> {
  const admin = supabaseAdmin();
  const email = input.email.trim().toLowerCase();

  // 1) Já existe vendedor com esse e-mail nesta empresa?
  const { data: existente } = await admin
    .from("vendedores")
    .select("id")
    .eq("org_id", input.orgId)
    .ilike("email", email)
    .maybeSingle();

  let vendedorId: string | null = (existente?.id as string | undefined) ?? null;

  // 2) Sem registro e cargo Vendedor → cria (isolado por org).
  if (!vendedorId && input.papel === "vendedor") {
    const { data: novo, error } = await admin
      .from("vendedores")
      .insert({
        org_id: input.orgId,
        nome: input.nome,
        email,
        meta_mensal: 0,
        comissao_pct: 0,
        ativo: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    vendedorId = (novo?.id as string) ?? null;
  }

  // 3) Linka no profile (idempotente). Nunca apaga o registro de vendedor.
  if (vendedorId) {
    await admin.from("profiles").update({ vendedor_ref: vendedorId }).eq("id", input.profileId);
  }
  return vendedorId;
}
