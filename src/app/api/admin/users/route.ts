import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncVendedor } from "@/lib/server/sync-vendedor";
import type { Papel } from "@/lib/types";
import { montarCodigo, normalizarNumeroCodigo, numeroDoCodigo } from "@/lib/jornada";

const PAPEIS: Papel[] = ["admin", "coordenador", "supervisor", "lider", "vendedor"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .or(`id.eq.${auth.orgId},vendedor_id.eq.${auth.orgId}`)
    .order("criado_em", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ users: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json()) as {
    userId?: string;
    papel?: Papel;
    equipeId?: string | null;
    vendedorRef?: string | null;
    ativo?: boolean;
    codigoLiberado?: boolean;
    /**
     * O NÚMERO do código profissional, escolhido pelo admin. O prefixo é do
     * cargo e é posto aqui no servidor — a tela nunca manda o código pronto.
     */
    codigoNumero?: string | number;
    nome?: string;
  };
  if (!body.userId) {
    return Response.json({ error: "userId é obrigatório" }, { status: 400 });
  }
  if (body.papel && !PAPEIS.includes(body.papel)) {
    return Response.json({ error: "papel inválido" }, { status: 400 });
  }
  if (body.userId === auth.userId && body.papel && body.papel !== "admin") {
    return Response.json(
      { error: "Você não pode rebaixar a própria conta de admin" },
      { status: 400 },
    );
  }
  // Bloqueio agora tem efeito de verdade — então bloquear a si mesmo virou uma
  // forma de perder o acesso ao sistema sem ter como voltar pela tela.
  if (body.userId === auth.userId && body.ativo === false) {
    return Response.json(
      { error: "Você não pode bloquear a própria conta" },
      { status: 400 },
    );
  }
  // Revogar o próprio acesso tranca do mesmo jeito que bloquear.
  if (body.userId === auth.userId && body.codigoLiberado === false) {
    return Response.json(
      { error: "Você não pode revogar o próprio acesso" },
      { status: 400 },
    );
  }
  const admin = supabaseAdmin();
  const { data: target, error: terr } = await admin
    .from("profiles")
    .select("id, nome, email, papel, vendedor_id, codigo_acesso")
    .eq("id", body.userId)
    .single();
  if (terr || !target) return Response.json({ error: "Usuário não encontrado" }, { status: 404 });
  const targetOrg = target.vendedor_id ?? target.id;
  if (targetOrg !== auth.orgId) {
    return Response.json({ error: "Usuário não pertence ao seu org" }, { status: 403 });
  }
  const patch: Record<string, unknown> = {};
  if (body.papel !== undefined) patch.papel = body.papel;
  if (body.equipeId !== undefined) patch.equipe_id = body.equipeId;
  // vendedor_ref = link REAL com a tabela vendedores (NÃO o vendedor_id, que
  // guarda o UUID do dono da org p/ a current_org_id() da RLS multi-tenant).
  if (body.vendedorRef !== undefined) patch.vendedor_ref = body.vendedorRef;
  if (body.ativo !== undefined) patch.ativo = body.ativo;
  if (body.codigoLiberado !== undefined) patch.codigo_liberado = body.codigoLiberado;
  if (body.nome !== undefined) patch.nome = body.nome;

  /* ------------------------------------------------- código profissional
   *
   * O admin escolhe o NÚMERO; o prefixo sai do cargo, aqui no servidor. A tela
   * mostra a prévia usando as MESMAS funções (`lib/jornada`), mas quem grava é
   * este trecho: código montado no cliente não é aceito.
   */
  const papelFinal = (body.papel ?? target.papel) as Papel;
  let codigoNovo: string | null = null;

  if (body.codigoNumero !== undefined) {
    const numero = normalizarNumeroCodigo(body.codigoNumero);
    if (!numero) {
      return Response.json(
        { error: "Informe o número do código profissional (somente dígitos)." },
        { status: 400 },
      );
    }
    codigoNovo = montarCodigo(papelFinal, numero);
  } else if (body.papel !== undefined && body.papel !== target.papel) {
    /*
     * Mudou de cargo e o admin não informou número: o PREFIXO acompanha o cargo
     * novo e o número que ele já havia escolhido é preservado. Sem isto, um
     * Líder continuaria carregando um código "V002" — a inconsistência que esta
     * correção existe para acabar.
     */
    const numero = numeroDoCodigo(target.codigo_acesso as string | null);
    if (numero) codigoNovo = montarCodigo(papelFinal, numero);
  }

  if (codigoNovo) {
    const { data: ocupado } = await admin
      .from("profiles")
      .select("id, nome")
      .ilike("codigo_acesso", codigoNovo) // sem curinga = igualdade sem acentuar maiúsculas
      .neq("id", body.userId)
      .maybeSingle();

    if (ocupado) {
      /*
       * Conflito. Quando o admin DIGITOU o número, recusar é o certo — ele
       * escolheu e precisa saber que aquele já é de outra pessoa.
       *
       * Quando o conflito nasceu da troca de cargo (ninguém digitou nada),
       * recusar deixaria a pessoa com o código do cargo antigo — justamente a
       * inconsistência que se quer eliminar. Aí o sistema pega o próximo número
       * livre do cargo novo.
       */
      if (body.codigoNumero !== undefined) {
        return Response.json(
          {
            error: `O código ${codigoNovo} já é de ${(ocupado as { nome?: string }).nome ?? "outro colaborador"}. Escolha outro número.`,
          },
          { status: 409 },
        );
      }
      const { data: proximo } = await admin.rpc("proximo_codigo_acesso", { p_papel: papelFinal });
      codigoNovo = (proximo as string | null) ?? null;
    }
    if (codigoNovo) patch.codigo_acesso = codigoNovo;
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", body.userId);
  if (error) {
    // 23505 = o índice único do banco barrou. Só chega aqui em corrida entre
    // dois admins salvando o mesmo número ao mesmo tempo.
    const duplicado = (error as { code?: string }).code === "23505";
    return Response.json(
      {
        error: duplicado
          ? `O código ${codigoNovo} acabou de ser usado por outra pessoa. Escolha outro número.`
          : error.message,
      },
      { status: duplicado ? 409 : 400 },
    );
  }

  /*
   * Derruba (ou devolve) a sessão no Supabase Auth.
   *
   * O `profiles.ativo` já barra tudo na hora — RLS e rotas conferem a cada
   * requisição. Isto aqui fecha a última porta: banir impede que o token seja
   * RENOVADO e impede login novo, então a sessão morre de vez em pouco tempo
   * em vez de ficar viva até alguém fechar o navegador.
   *
   * Não derruba a atualização se falhar: o bloqueio que importa (o do banco)
   * já foi gravado, e é ele que decide a cada requisição.
   */
  if (body.ativo !== undefined) {
    try {
      await admin.auth.admin.updateUserById(body.userId, {
        ban_duration: body.ativo ? "none" : "876000h", // ~100 anos = até reativar
      });
    } catch {
      /* o bloqueio no banco já vale por si */
    }
  }

  // Mudança de cargo re-sincroniza o vínculo colaborador↔vendedor: mantém
  // histórico/metas/comissão; cria registro se virou "Vendedor" sem ter. Nunca apaga.
  try {
    await syncVendedor({
      profileId: body.userId,
      nome: (body.nome ?? target.nome) as string,
      email: target.email as string,
      papel: (body.papel ?? target.papel) as Papel,
      orgId: auth.orgId,
    });
  } catch {
    /* não falha a atualização por causa do sync */
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId obrigatório" }, { status: 400 });
  if (userId === auth.userId) {
    return Response.json({ error: "Não pode remover a própria conta" }, { status: 400 });
  }
  const admin = supabaseAdmin();
  const { data: target } = await admin
    .from("profiles")
    .select("id, vendedor_id")
    .eq("id", userId)
    .single();
  if (!target || (target.vendedor_id ?? target.id) !== auth.orgId) {
    return Response.json({ error: "Usuário não pertence ao seu org" }, { status: 403 });
  }
  // Remove o auth user (cascata remove o profile)
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
