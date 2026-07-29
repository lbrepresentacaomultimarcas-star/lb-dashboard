import type { Papel, SessionUser } from "./types";

/** Hierarquia: admin > coordenador > supervisor > líder > vendedor */
const NIVEL: Record<Papel, number> = {
  admin: 4,
  coordenador: 3,
  supervisor: 2,
  lider: 1,
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
