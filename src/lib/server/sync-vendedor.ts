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

  /*
   * 0) O vínculo que JÁ existe manda.
   *
   * Sem isto, cada passada por aqui podia religar a pessoa a um registro
   * diferente — e os negócios que ela já tinha recebido ficavam presos no
   * registro antigo, invisíveis para ela. Uma vez ligado, fica ligado.
   */
  const { data: perfil } = await admin
    .from("profiles")
    .select("vendedor_ref")
    .eq("id", input.profileId)
    .maybeSingle();

  const refAtual = (perfil?.vendedor_ref as string | null | undefined) ?? null;
  if (refAtual) {
    const { data: aindaExiste } = await admin
      .from("vendedores")
      .select("id")
      .eq("id", refAtual)
      .eq("org_id", input.orgId)
      .maybeSingle();
    if (aindaExiste) return refAtual;
  }

  /*
   * 1) Já existe vendedor com esse e-mail nesta empresa?
   *
   * NÃO usar `.maybeSingle()` aqui: com dois cadastros para o mesmo e-mail
   * ele devolve ERRO em vez de linha — e o erro sendo ignorado virava
   * "não achei nada", que fazia o código criar MAIS um duplicado. Era assim
   * que a mesma pessoa acabava com dois e três cadastros de mesmo nome na
   * lista de compartilhar.
   *
   * Pegando o MAIS ANTIGO: é o que costuma carregar o histórico de vendas.
   */
  const { data: candidatos } = await admin
    .from("vendedores")
    .select("id")
    .eq("org_id", input.orgId)
    .ilike("email", email)
    .order("criado_em", { ascending: true })
    .limit(1);

  let vendedorId: string | null = (candidatos?.[0]?.id as string | undefined) ?? null;

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
