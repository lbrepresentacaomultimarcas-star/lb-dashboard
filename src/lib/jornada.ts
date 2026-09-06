import type { Papel } from "./types";

/**
 * A TRAJETÓRIA PROFISSIONAL DA OPERAÇÃO.
 *
 * Vendedor → Líder → Supervisor → Representante.
 *
 * Fica num arquivo só, e é dado — não código espalhado. Três motivos:
 *
 *  1. o prefixo do código de acesso e o degrau da carreira precisam contar a
 *     MESMA história; se morassem em lugares diferentes, um dia divergiriam e
 *     alguém seria "Supervisor" com código de vendedor;
 *  2. a tela desenha a partir daqui, então acrescentar um degrau amanhã é
 *     mexer nesta lista, não em componente;
 *  3. quando o CRM for aberto para outros representantes, cada operação vai
 *     querer a própria nomenclatura. Estando tudo aqui, isso vira uma tabela
 *     de configuração por empresa — sem refatorar tela nenhuma.
 *
 * IMPORTANTE: isto é APRESENTAÇÃO e IDENTIDADE. Permissão continua saindo de
 * `papel` (ver `permissions.ts`) — o código e o degrau não decidem nada.
 */
export type Degrau = {
  /** O papel real no sistema, que é quem manda nas permissões. */
  papel: Papel;
  /** Como a operação chama esse nível. */
  rotulo: string;
  /** Prefixo do código de acesso. */
  prefixo: string;
  /** Uma linha sobre o que se faz nesse nível. */
  resumo: string;
};

/**
 * Os degraus, em ordem de crescimento.
 *
 * `admin` fica de fora de propósito: é o dono da operação, não um degrau da
 * carreira de quem vende.
 *
 * "Representante" usa o papel `coordenador`, que já existia na hierarquia e
 * estava sem uso. Reaproveitar em vez de criar um papel novo evita mexer na
 * regra do banco, no motor de escopo e em toda a RBAC já testada — o nome
 * muda, a engrenagem não.
 */
export const JORNADA: Degrau[] = [
  {
    papel: "vendedor",
    rotulo: "Vendedor",
    prefixo: "V",
    resumo: "Atende os clientes e conduz as próprias negociações.",
  },
  {
    papel: "lider",
    rotulo: "Líder",
    prefixo: "LID",
    resumo: "Acompanha um time e responde pelos resultados dele.",
  },
  {
    papel: "supervisor",
    rotulo: "Supervisor",
    prefixo: "SUP",
    resumo: "Coordena equipes e a operação comercial do dia a dia.",
  },
  {
    papel: "coordenador",
    rotulo: "Representante",
    prefixo: "REP",
    resumo: "Responde pela operação inteira junto à administradora.",
  },
];

/** Em que degrau esta pessoa está. `null` para quem está fora da trilha (admin). */
export function degrauDe(papel: Papel | undefined | null): Degrau | null {
  return JORNADA.find((d) => d.papel === papel) ?? null;
}

/** O degrau seguinte — o convite, não a promessa. `null` no topo. */
export function proximoDegrau(papel: Papel | undefined | null): Degrau | null {
  const i = JORNADA.findIndex((d) => d.papel === papel);
  if (i < 0 || i >= JORNADA.length - 1) return null;
  return JORNADA[i + 1];
}

/** Prefixo do código para um papel. Espelha `prefixo_codigo()` no banco. */
export function prefixoDe(papel: Papel | undefined | null): string {
  return degrauDe(papel)?.prefixo ?? "ADM";
}
