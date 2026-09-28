import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

/*
 * O QUE NÃO PASSA POR AQUI.
 *
 * Este middleware existe para renovar a sessão de quem está NAVEGANDO. Ele
 * roda antes de cada requisição e conversa com o Supabase para revalidar o
 * login — trabalho necessário para uma pessoa, e completamente inútil para um
 * robô.
 *
 * O webhook da Meta (`/api/central-leads/intake`) não tem login: ele se
 * identifica pela assinatura `x-hub-signature-256`, conferida dentro da
 * própria rota, e usa a chave de serviço para gravar. Mesmo assim, ele estava
 * passando por aqui — medido em produção: 53 execuções do middleware em 77
 * segundos, ~2.475 por hora, porque a Meta avisa cada mensagem, cada entrega e
 * cada leitura de WhatsApp.
 *
 * Isso custava duas contas ao mesmo tempo: tempo de processamento na Vercel
 * (que estourou o limite e ameaçou pausar os projetos) e requisições ao
 * Supabase (que já estava em aviso de tráfego).
 *
 * Só o webhook sai. Toda rota que depende de sessão continua passando: sem o
 * middleware, um login prestes a expirar não seria renovado e a pessoa cairia
 * para fora.
 */
export const config = {
  matcher: [
    // tudo, menos internos do Next, arquivos estáticos e o webhook da Meta
    "/((?!_next/static|_next/image|favicon.ico|api/central-leads/intake|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
