/**
 * URL pública do avatar baseada no ID do vendedor/usuário.
 * Como o bucket "avatars" é público, podemos construir a URL diretamente.
 * Se o arquivo não existir, o <Avatar /> mostra o fallback de iniciais.
 */
export function avatarPublicUrl(id: string | undefined | null): string | null {
  if (!id) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!base) return null;
  // ?v= timestamp pra forçar refresh quando trocar a foto
  // (sem cache busting o browser pode segurar versão antiga por horas)
  return `${base}/storage/v1/object/public/avatars/${id}`;
}
