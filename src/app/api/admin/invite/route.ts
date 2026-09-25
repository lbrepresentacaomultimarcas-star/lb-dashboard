import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { siteBaseUrl } from "@/lib/site-url";
import { syncVendedor } from "@/lib/server/sync-vendedor";
import type { Papel } from "@/lib/types";
import { montarCodigo, normalizarNumeroCodigo } from "@/lib/jornada";

type Body = {
  email?: string;
  nome?: string;
  senha?: string;
  papel?: Papel;
  /** Número do código profissional escolhido pelo admin (opcional). */
  codigoNumero?: string | number;
  equipeId?: string | null;
  /** Se true, envia email com magic link (sem senha). */
  enviarEmail?: boolean;
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json()) as Body;
  if (!body.email) return Response.json({ error: "Email obrigatório" }, { status: 400 });
  const papel: Papel = body.papel ?? "vendedor";
  const nome = body.nome?.trim() || body.email.split("@")[0];
  const admin = supabaseAdmin();

  let userId: string;

  if (body.enviarEmail) {
    // Convite via email (magic link / definir senha)
    const { data, error } = await admin.auth.admin.inviteUserByEmail(body.email, {
      data: { nome },
      // Produção usa NEXT_PUBLIC_SITE_URL (domínio oficial); local usa o origin.
      redirectTo: `${siteBaseUrl(req.nextUrl.origin)}/auth/callback`,
    });
    if (error || !data.user) {
      return Response.json({ error: error?.message ?? "Falha ao convidar" }, { status: 400 });
    }
    userId = data.user.id;
  } else {
    if (!body.senha || body.senha.length < 6) {
      return Response.json({ error: "Senha (mín 6 caracteres) obrigatória" }, { status: 400 });
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.senha,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (error || !data.user) {
      return Response.json({ error: error?.message ?? "Falha ao criar" }, { status: 400 });
    }
    userId = data.user.id;
  }

  /* Código profissional do dia a dia: prefixo do cargo + número. */
  let codigo: string | null = null;
  /*
   * Por que o código pode não sair, em uma frase que o admin entenda.
   *
   * Sem isso, um colaborador nascia sem código e ninguém ficava sabendo: a
   * tela dizia "adicionado" e a pessoa só descobria que não conseguia entrar
   * quando tentava. Sem código não há login.
   */
  let motivoSemCodigo: string | null = null;

  /*
   * Quando o admin ESCOLHE o número, é ele que manda — o prefixo do cargo é
   * posto aqui no servidor. Código já ocupado é recusado antes de criar
   * qualquer coisa, para o admin corrigir o número em vez de descobrir o
   * problema com o colaborador já cadastrado.
   */
  if (body.codigoNumero !== undefined && String(body.codigoNumero).trim() !== "") {
    const numero = normalizarNumeroCodigo(body.codigoNumero);
    if (!numero) {
      return Response.json(
        { error: "Informe o número do código profissional (somente dígitos)." },
        { status: 400 },
      );
    }
    const escolhido = montarCodigo(papel, numero);
    const { data: ocupado } = await admin
      .from("profiles")
      .select("id, nome")
      .ilike("codigo_acesso", escolhido!)
      .maybeSingle();
    if (ocupado) {
      return Response.json(
        {
          error: `O código ${escolhido} já é de ${(ocupado as { nome?: string }).nome ?? "outro colaborador"}. Escolha outro número.`,
        },
        { status: 409 },
      );
    }
    codigo = escolhido;
  } else {
    /*
     * Sem número informado, quem gera é o banco (`proximo_codigo_acesso`): a
     * conta do próximo número tem que olhar todos os colaboradores de uma vez,
     * e dois cadastros simultâneos não podem receber o mesmo. Se falhar, o
     * colaborador é criado assim mesmo — ele ainda entra por e-mail, e o admin
     * define o código depois. Perder o cadastro por causa do código seria pior
     * que não ter código.
     */
    try {
      const { data: cod, error: cerr } = await admin.rpc("proximo_codigo_acesso", {
        p_papel: papel,
      });
      codigo = (cod as string | null) ?? null;
      // `rpc` NÃO lança em erro: devolve `error`. Ler só o `data` escondia a falha.
      if (cerr || !codigo) {
        motivoSemCodigo = cerr?.message ?? "a numeração automática não devolveu código";
      }
    } catch (e) {
      motivoSemCodigo = e instanceof Error ? e.message : "falha ao gerar o código";
    }
  }

  // Atualiza profile: papel, equipe, org owner
  const patch: Record<string, unknown> = {
    papel,
    nome,
    vendedor_id: papel === "admin" ? null : auth.orgId,
    // Cadastrar e LIBERAR são coisas diferentes: nasce aguardando o admin.
    codigo_liberado: false,
    ...(codigo ? { codigo_acesso: codigo } : {}),
  };
  if (body.equipeId !== undefined) patch.equipe_id = body.equipeId;

  /*
   * GRAVAR O PERFIL — E CONFERIR QUE GRAVOU.
   *
   * O perfil nasce de um gatilho quando o login é criado, e esta rota vinha
   * por cima para pôr cargo, código e equipe. Só que um UPDATE que não
   * encontra a linha devolve **0 linhas, não erro** — a rota seguia como se
   * tivesse gravado e respondia "ok". O colaborador ficava com o que a tabela
   * põe por padrão: sem código, sem vínculo e — pior — com papel de ADMIN.
   *
   * Foi o que aconteceu no cadastro de 25/09/2026. Agora o `.select()` mostra
   * quantas linhas mudaram e, se nenhuma mudou, o perfil é gravado aqui mesmo.
   */
  const { data: gravados, error: uerr } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("id");
  if (uerr) {
    return Response.json({ error: uerr.message, userId }, { status: 400 });
  }
  if (!gravados || gravados.length === 0) {
    const { error: ierr } = await admin
      .from("profiles")
      .upsert({ id: userId, email: body.email, ...patch }, { onConflict: "id" });
    if (ierr) {
      return Response.json(
        {
          error:
            `O login de ${body.email} foi criado, mas o perfil não gravou (${ierr.message}). ` +
            "Abra Administrativo → Colaboradores e ajuste o cargo e o código ANTES de liberar o acesso.",
          userId,
        },
        { status: 500 },
      );
    }
  }

  // Vínculo automático colaborador↔vendedor (fim do cadastro duplo). Não bloqueia
  // a criação do colaborador se falhar.
  try {
    await syncVendedor({ profileId: userId, nome, email: body.email, papel, orgId: auth.orgId });
  } catch {
    /* segue — o admin pode religar o vínculo depois */
  }

  return Response.json({
    ok: true,
    user: { id: userId, email: body.email, nome, papel, codigo },
    // pendência não pode virar silêncio: a tela mostra isto para o admin
    aviso: motivoSemCodigo
      ? `${nome} foi criado(a) SEM código de acesso (${motivoSemCodigo}). ` +
        "Sem código não há login: defina o código na lista antes de liberar o acesso."
      : null,
    metodo: body.enviarEmail ? "email_invite" : "criado_com_senha",
  });
}
