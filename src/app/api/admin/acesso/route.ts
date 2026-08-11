import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GERENCIAMENTO DE ACESSO DO CONSULTOR (Administrativo → Vendedores).
 *
 * Reusa a autenticação que já existe (Supabase Auth) — nenhum login paralelo.
 * A senha NUNCA é gravada em texto: quem guarda (com hash) é o próprio Supabase,
 * via `auth.admin.updateUserById`. A senha temporária só existe na resposta
 * desta chamada, para o admin copiar naquele momento.
 *
 * Bloqueio: usa o BAN do Supabase Auth (`ban_duration`), que barra o login de
 * verdade — a coluna `profiles.ativo` sozinha não impede a entrada (o login não
 * a consulta). Marcamos as duas coisas para a UI continuar coerente.
 *
 * Toda ação sensível grava em `audit_log` (tabela que já existia).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BAN_LONGO = "876000h"; // ~100 anos = bloqueado até desbloquear

type Acao =
  | "redefinir-senha"
  | "bloquear"
  | "desbloquear"
  | "impersonar"
  | "encerrar-impersonacao";

/** Senha temporária forte e legível (sem caracteres ambíguos como O/0, l/1). */
function gerarSenha(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const num = "23456789";
  const min = "abcdefghijkmnpqrstuvwxyz";
  const pick = (s: string) => s[crypto.randomInt(s.length)];
  const corpo = Array.from({ length: 6 }, () => pick(min + abc + num)).join("");
  return `LB${pick(abc)}${corpo}${pick(num)}`;
}

async function registrar(
  db: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  adminEmail: string,
  acao: string,
  profileId: string,
  detalhes: string,
) {
  try {
    await db.from("audit_log").insert({
      org_id: orgId,
      acao,
      entidade: "acesso_consultor",
      entidade_id: profileId,
      usuario_email: adminEmail,
      detalhes,
    });
  } catch (err) {
    // auditoria nunca derruba a operação — mas o erro fica no log do servidor
    console.error("[acesso] falha ao registrar auditoria:", err);
  }
}

/** Acha o profile (conta de acesso) ligado a um registro da tabela vendedores. */
async function acharProfile(db: ReturnType<typeof supabaseAdmin>, vendedorId: string) {
  const { data: porRef } = await db
    .from("profiles")
    .select("id, nome, email, papel, ativo, equipe_id, vendedor_ref")
    .eq("vendedor_ref", vendedorId)
    .maybeSingle();
  if (porRef) return porRef;

  // fallback pelo e-mail (compat com quem ainda não tem vendedor_ref preenchido)
  const { data: vend } = await db
    .from("vendedores")
    .select("email")
    .eq("id", vendedorId)
    .maybeSingle();
  if (!vend?.email) return null;

  const { data: porEmail } = await db
    .from("profiles")
    .select("id, nome, email, papel, ativo, equipe_id, vendedor_ref")
    .ilike("email", vend.email)
    .maybeSingle();
  return porEmail ?? null;
}

/* ------------------------------------------------------------------ GET
   Status do acesso de um consultor (para a seção "Acesso ao sistema"). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const vendedorId = req.nextUrl.searchParams.get("vendedorId");
  if (!vendedorId) return Response.json({ error: "vendedorId obrigatório" }, { status: 400 });

  const db = supabaseAdmin();
  const prof = await acharProfile(db, vendedorId);
  if (!prof) return Response.json({ temConta: false });

  const { data: userRes } = await db.auth.admin.getUserById(prof.id);
  const banidoAte = (userRes?.user as { banned_until?: string } | undefined)?.banned_until;
  const bloqueado = !!banidoAte && new Date(banidoAte) > new Date();

  return Response.json({
    temConta: true,
    profileId: prof.id,
    email: prof.email,
    nome: prof.nome,
    papel: prof.papel,
    equipeId: prof.equipe_id,
    vendedorRef: prof.vendedor_ref,
    bloqueado,
    ativo: prof.ativo !== false,
    ultimoAcesso: userRes?.user?.last_sign_in_at ?? null,
  });
}

/* ----------------------------------------------------------------- POST */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const body = (await req.json()) as { acao?: Acao; profileId?: string; senha?: string };
  const { acao, profileId } = body;
  if (!acao || !profileId) {
    return Response.json({ error: "acao e profileId são obrigatórios" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // o alvo precisa ser da MESMA empresa (mesma checagem das outras rotas admin)
  const { data: alvo } = await db
    .from("profiles")
    .select("id, nome, email, papel, ativo, equipe_id, vendedor_ref, vendedor_id")
    .eq("id", profileId)
    .single();
  if (!alvo) return Response.json({ error: "Consultor não encontrado" }, { status: 404 });
  if ((alvo.vendedor_id ?? alvo.id) !== auth.orgId) {
    return Response.json({ error: "Consultor não pertence à sua empresa" }, { status: 403 });
  }

  switch (acao) {
    /* -------------------------------------------------- redefinir senha */
    case "redefinir-senha": {
      const informada = body.senha?.trim();
      if (informada && informada.length < 6) {
        return Response.json({ error: "A senha precisa ter ao menos 6 caracteres" }, { status: 400 });
      }
      const senha = informada || gerarSenha();
      const { error } = await db.auth.admin.updateUserById(profileId, { password: senha });
      if (error) return Response.json({ error: error.message }, { status: 400 });

      await registrar(
        db,
        auth.orgId,
        auth.email,
        "senha_redefinida",
        profileId,
        `${auth.email} redefiniu a senha de ${alvo.nome} (${alvo.email}) — ${informada ? "senha definida manualmente" : "senha temporária gerada"}. A senha anterior deixou de valer.`,
      );

      // devolve a senha só quando FOI GERADA — é o único momento em que ela existe
      return Response.json({ ok: true, senha: informada ? undefined : senha });
    }

    /* ------------------------------------------------ bloquear / liberar */
    case "bloquear":
    case "desbloquear": {
      if (profileId === auth.userId) {
        return Response.json({ error: "Você não pode bloquear a própria conta" }, { status: 400 });
      }
      const bloquear = acao === "bloquear";
      const { error } = await db.auth.admin.updateUserById(profileId, {
        ban_duration: bloquear ? BAN_LONGO : "none",
      });
      if (error) return Response.json({ error: error.message }, { status: 400 });

      await db.from("profiles").update({ ativo: !bloquear }).eq("id", profileId);

      await registrar(
        db,
        auth.orgId,
        auth.email,
        bloquear ? "acesso_bloqueado" : "acesso_desbloqueado",
        profileId,
        `${auth.email} ${bloquear ? "BLOQUEOU" : "DESBLOQUEOU"} o acesso de ${alvo.nome} (${alvo.email}).`,
      );

      return Response.json({ ok: true, bloqueado: bloquear });
    }

    /* -------------------------------------------------- ver como consultor */
    case "impersonar": {
      if (alvo.papel === "admin") {
        return Response.json(
          { error: "Não é possível entrar como outro administrador" },
          { status: 400 },
        );
      }
      await registrar(
        db,
        auth.orgId,
        auth.email,
        "impersonacao_iniciada",
        profileId,
        `${auth.email} entrou como ${alvo.nome} (${alvo.email}) — visualização com as permissões do consultor.`,
      );
      return Response.json({
        ok: true,
        sessao: {
          id: alvo.id,
          nome: alvo.nome,
          email: alvo.email,
          papel: alvo.papel,
          vendedorId: alvo.vendedor_ref ?? undefined,
          equipeId: alvo.equipe_id ?? undefined,
        },
      });
    }

    case "encerrar-impersonacao": {
      await registrar(
        db,
        auth.orgId,
        auth.email,
        "impersonacao_encerrada",
        profileId,
        `${auth.email} saiu da visualização como ${alvo.nome} (${alvo.email}) e voltou para a conta de administrador.`,
      );
      return Response.json({ ok: true });
    }

    default:
      return Response.json({ error: "Ação desconhecida" }, { status: 400 });
  }
}
