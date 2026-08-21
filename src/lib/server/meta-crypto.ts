import "server-only";

import crypto from "node:crypto";

/**
 * Cofre dos tokens da Meta.
 *
 * Os tokens de acesso (do usuário e das Páginas) NUNCA são gravados em texto
 * puro: entram no banco cifrados com AES-256-GCM, que além de embaralhar também
 * detecta adulteração. A chave mora só em `META_TOKEN_KEY`, no ambiente do
 * servidor — não está no código, não vai para o navegador e não aparece em log.
 *
 * Formato do pacote: "v1.<iv>.<tag>.<conteúdo>", tudo em base64url.
 * O prefixo de versão existe para permitir trocar o algoritmo no futuro sem
 * perder o que já está guardado.
 */

const VERSAO = "v1";
const ALGO = "aes-256-gcm";
const TAM_IV = 12; // 96 bits — recomendado para GCM

/** Lê e valida a chave. 64 caracteres hexadecimais = 32 bytes. */
function chave(): Buffer {
  const bruta = process.env.META_TOKEN_KEY?.trim();
  if (!bruta) {
    throw new Error(
      "META_TOKEN_KEY não configurada — sem ela o sistema não guarda a conexão com a Meta.",
    );
  }
  if (!/^[0-9a-f]{64}$/i.test(bruta)) {
    // diagnóstico útil que NÃO revela a chave
    throw new Error(
      `META_TOKEN_KEY inválida: são esperados 64 caracteres hexadecimais e vieram ${bruta.length}.`,
    );
  }
  return Buffer.from(bruta, "hex");
}

/** true quando a chave está configurada e no formato certo (para a tela de status). */
export function cofrePronto(): boolean {
  try {
    chave();
    return true;
  } catch {
    return false;
  }
}

const b64 = (b: Buffer) => b.toString("base64url");

export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(TAM_IV);
  const cipher = crypto.createCipheriv(ALGO, chave(), iv);
  const dados = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return [VERSAO, b64(iv), b64(cipher.getAuthTag()), b64(dados)].join(".");
}

export function decifrar(pacote: string): string {
  const partes = pacote.split(".");
  if (partes.length !== 4 || partes[0] !== VERSAO) {
    throw new Error("Token guardado em formato desconhecido.");
  }
  const [, iv, tag, dados] = partes;
  const decipher = crypto.createDecipheriv(ALGO, chave(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dados, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Decifra sem explodir — usado onde um token corrompido não pode derrubar a rota. */
export function decifrarOuNulo(pacote: string | null | undefined): string | null {
  if (!pacote) return null;
  try {
    return decifrar(pacote);
  } catch {
    return null;
  }
}

/**
 * Mostra um token de forma segura em tela/log: "EAAG…7bQ2".
 * Nunca devolve o valor inteiro.
 */
export function mascarar(token: string | null | undefined): string {
  if (!token) return "—";
  if (token.length <= 12) return "•".repeat(8);
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
