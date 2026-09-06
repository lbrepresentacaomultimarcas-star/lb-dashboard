/**
 * Motor de escopo do RBAC (camada de aplicação).
 *
 * A partir do usuário logado (papel + equipe + vínculo de vendedor) e do
 * "roster" da empresa (profiles + equipes), calcula O QUE ele pode ver:
 * o conjunto de `vendedores.id` visíveis. Toda tela filtra os dados por esse
 * conjunto — Dashboard, Ranking, Pipeline, Oportunidades, Clientes, Produção,
 * Metas, Relatórios e Central de IA.
 *
 * PURO e sem dependências de React/Supabase de propósito: é testável, roda no
 * servidor ou no client, e a MESMA lógica pode virar uma função SQL
 * (security-definer) + policies de RLS numa fase futura, SEM refatorar as telas.
 *
 * Modelo real do banco (confirmado por introspecção):
 *   • profiles.equipe_id   → equipe do colaborador
 *   • profiles.vendedor_ref → vendedores.id (registro de vendas da pessoa)
 *   • leads/vendas.vendedor_id → vendedores.id (dono do dado)
 *   ∴ dados de uma equipe = registros cujo vendedor_id ∈ { vendedor_ref dos
 *     membros da equipe }.
 */
import type { Papel, Profile, SessionUser } from "./types";

export type Escopo = {
  papel: Papel;
  /** Enxerga a empresa inteira (admin; e coordenador até ter recorte por equipe). */
  verTudo: boolean;
  /** Gestor de equipe (supervisor/líder): vê a equipe, não só a si mesmo. */
  ehGestorEquipe: boolean;
  /** Vendedor comum: vê apenas os próprios dados. */
  soProprio: boolean;
  /** Equipes visíveis. null = todas. */
  equipeIdsVisiveis: string[] | null;
  /** vendedores.id visíveis. null = todos (sem filtro). */
  vendedorIdsVisiveis: Set<string> | null;
};

/** vendedores.id de uma equipe = vendedor_ref dos profiles daquela equipe. */
function vendedoresDaEquipe(equipeId: string, profiles: Profile[]): string[] {
  const out: string[] = [];
  for (const p of profiles) {
    if (p.equipeId === equipeId && p.vendedorRef) out.push(p.vendedorRef);
  }
  return out;
}

export function calcularEscopo(
  session: SessionUser | null,
  profiles: Profile[],
): Escopo {
  const papel: Papel = session?.papel ?? "vendedor";

  // Admin e Coordenador → empresa inteira. (Coordenador ganhará recorte por
  // equipes atribuídas numa fase futura; por ora vê tudo da própria empresa.)
  if (papel === "admin" || papel === "coordenador") {
    return {
      papel,
      verTudo: true,
      ehGestorEquipe: false,
      soProprio: false,
      equipeIdsVisiveis: null,
      vendedorIdsVisiveis: null,
    };
  }

  /*
   * SUPERVISOR com equipe → a equipe dele. E só ele.
   *
   * O LÍDER foi retirado daqui de propósito, por decisão da operação: neste
   * momento o cargo é de FORMAÇÃO, não de gestão. Ele desenvolve postura de
   * liderança ajudando os consultores presencialmente — e isso não exige que
   * o login dele passe a enxergar a carteira dos outros o tempo todo.
   *
   * Virar Líder deixou de ser uma porta para os dados alheios; passa a ser
   * um degrau da carreira. O escopo só muda de verdade quando o cargo virar
   * Supervisor E houver equipe vinculada — as duas coisas, não uma.
   *
   * Isto aqui é a camada do app. A mesma regra está em `pode_ver_vendedor()`
   * no banco, que é quem realmente protege: sem ela, bastaria chamar a API
   * direto para contornar a tela.
   */
  if (papel === "supervisor" && session?.equipeId) {
    const ids = new Set(vendedoresDaEquipe(session.equipeId, profiles));
    if (session.vendedorId) ids.add(session.vendedorId); // se o gestor também vende
    return {
      papel,
      verTudo: false,
      ehGestorEquipe: true,
      soProprio: false,
      equipeIdsVisiveis: [session.equipeId],
      vendedorIdsVisiveis: ids,
    };
  }

  // Vendedor (ou gestor ainda sem equipe definida) → só os próprios dados.
  const ids = new Set<string>();
  if (session?.vendedorId) ids.add(session.vendedorId);
  return {
    papel,
    verTudo: false,
    ehGestorEquipe: false,
    soProprio: true,
    equipeIdsVisiveis: session?.equipeId ? [session.equipeId] : [],
    vendedorIdsVisiveis: ids,
  };
}

/** Um vendedorId está no escopo? (vendedorIdsVisiveis null = tudo liberado.) */
export function noEscopo(escopo: Escopo, vendedorId: string | undefined | null): boolean {
  if (escopo.vendedorIdsVisiveis === null) return true;
  if (!vendedorId) return escopo.verTudo; // registro sem dono só aparece p/ quem vê tudo
  return escopo.vendedorIdsVisiveis.has(vendedorId);
}
