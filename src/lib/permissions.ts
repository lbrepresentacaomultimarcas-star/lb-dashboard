import type { Papel, SessionUser } from "./types";

/** Hierarquia: admin > coordenador > supervisor > vendedor */
const NIVEL: Record<Papel, number> = {
  admin: 3,
  coordenador: 2,
  supervisor: 1,
  vendedor: 0,
};

/** Retorna true se o papel do usuário é >= ao mínimo exigido. */
export function temPermissao(
  session: SessionUser | null,
  minimo: Papel,
): boolean {
  if (!session) return false;
  return NIVEL[session.papel] >= NIVEL[minimo];
}

export function ehAdmin(session: SessionUser | null) {
  return temPermissao(session, "admin");
}
