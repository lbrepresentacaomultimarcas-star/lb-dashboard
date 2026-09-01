/**
 * Mensagens de acesso — uma frase só, usada pelo servidor e pela tela.
 *
 * Fica em módulo próprio (sem nenhum import) de propósito: as guardas do
 * backend são `server-only`, então a tela de login não pode importar delas.
 * Deixar a frase aqui evita o clássico "duas versões do mesmo texto que um
 * dia divergem".
 */
export const BLOQUEADO =
  "Seu acesso foi bloqueado. Entre em contato com o administrador.";
