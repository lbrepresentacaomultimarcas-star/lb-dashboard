import { requireSessao } from "@/lib/sessao-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Eu ainda posso usar o sistema?"
 *
 * A aba aberta pergunta isso de tempos em tempos (e sempre que volta ao foco).
 * A resposta sai da MESMA guarda que protege as outras rotas — `requireSessao`
 * —, então não existe uma segunda opinião sobre quem está bloqueado: se aqui
 * passa, passa em tudo; se aqui recusa, recusa em tudo.
 *
 * Devolve 401 (não logado) ou 403 com `bloqueado: true` (conta bloqueada).
 */
export async function GET() {
  const sessao = await requireSessao();
  if (sessao instanceof Response) return sessao;
  return Response.json({ ok: true, papel: sessao.papel });
}
