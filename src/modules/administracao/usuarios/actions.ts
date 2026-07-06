"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { RECURSOS, type Acao } from "@/config/recursos";
import { erroAcao, logErroServidor } from "@/lib/erros";
import {
  exigirPermissao,
  getUsuarioLogado,
  temPermissao,
} from "@/lib/permissoes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  convidarUsuarioSchema,
  editarUsuarioSchema,
  matrizSchema,
  type ConvidarUsuarioInput,
  type EditarUsuarioInput,
  type MatrizInput,
} from "@/modules/administracao/usuarios/schemas";

const RECURSO = "administracao.usuarios" as const;
const ROTA = "/administracao/usuarios";

export type ResultadoAcao = { ok: true } | { erro: string };

export type ResultadoConvite =
  | { ok: true; senhaTemporaria?: string; aviso?: string }
  | { erro: string };

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

const uuidSchema = z.uuid();

/**
 * URL pública do app pros links de convite. Em produção exige
 * NEXT_PUBLIC_SITE_URL (ou usa a URL da Vercel); nunca cai em
 * localhost fora do dev.
 */
function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL não configurada em produção");
  }
  return "http://localhost:3000";
}

/** Senha temporária forte: 16 caracteres de classes misturadas. */
function gerarSenhaTemporaria(): string {
  const alfabeto =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

/**
 * Convida um usuário por email. Se o envio do convite falhar (SMTP),
 * cria o usuário com senha temporária e a retorna para o admin repassar.
 * O trigger do banco cria a linha em usuarios; o perfil é aplicado via RPC.
 */
export async function convidarUsuario(
  dados: ConvidarUsuarioInput,
): Promise<ResultadoConvite> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para convidar usuários" };
  }

  const validado = convidarUsuarioSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { nome, email, perfilId } = validado.data;
  const admin = createAdminClient();
  const redirectTo = `${siteUrl()}/auth/confirm`;

  let usuarioId: string | undefined;
  let senhaTemporaria: string | undefined;

  const convite = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    redirectTo,
  });

  if (convite.error) {
    if (convite.error.code === "email_exists") {
      return { erro: "Já existe um usuário com este email" };
    }

    logErroServidor("administracao.usuarios.convidar", convite.error);

    // Fallback sem email: cria com senha temporária pro admin repassar.
    // A flag senha_temporaria força a troca no primeiro acesso.
    senhaTemporaria = gerarSenhaTemporaria();
    const criado = await admin.auth.admin.createUser({
      email,
      user_metadata: { nome, senha_temporaria: true },
      email_confirm: true,
      password: senhaTemporaria,
    });

    if (criado.error) {
      if (criado.error.code === "email_exists") {
        return { erro: "Já existe um usuário com este email" };
      }
      return erroAcao(
        "administracao.usuarios.convidar",
        criado.error,
        "Não foi possível convidar o usuário. Tente novamente",
      );
    }
    usuarioId = criado.data.user?.id;
  } else {
    usuarioId = convite.data.user?.id;
  }

  let aviso: string | undefined;
  if (perfilId && usuarioId) {
    // Client normal: o RPC valida a permissão de quem chama.
    const supabase = await createClient();
    const { error } = await supabase.rpc("aplicar_perfil", {
      p_usuario_id: usuarioId,
      p_perfil_id: perfilId,
    });
    if (error) {
      logErroServidor("administracao.usuarios.convidar", error);
      aviso =
        "Usuário criado, mas o perfil não foi aplicado. Abra o usuário e aplique de novo";
    }
  }

  revalidatePath(ROTA);

  const resultado: ResultadoConvite = { ok: true };
  if (senhaTemporaria) resultado.senhaTemporaria = senhaTemporaria;
  if (aviso) resultado.aviso = aviso;
  return resultado;
}

/**
 * Atualiza nome e status (ativo) do usuário. RLS cobre o update.
 * Desativar também bane na auth (bloqueia login e refresh da sessão);
 * reativar remove o ban. O ativo=false já corta o acesso imediato via
 * RLS e getUsuarioLogado em toda request.
 */
export async function editarUsuario(
  id: string,
  dados: EditarUsuarioInput,
): Promise<ResultadoAcao> {
  const editor = await getUsuarioLogado();
  if (!editor || !temPermissao(editor, RECURSO, "editar")) {
    return { erro: "Sem permissão para editar usuários" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Usuário inválido" };

  const validado = editarUsuarioSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  if (idValido.data === editor.id && !validado.data.ativo) {
    return { erro: "Você não pode desativar a sua própria conta" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("usuarios")
    .update({ nome: validado.data.nome, ativo: validado.data.ativo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "administracao.usuarios.editar",
      error,
      "Não foi possível salvar o usuário. Tente novamente",
    );
  }

  // Espelha o status na auth: banido não loga nem renova sessão.
  const admin = createAdminClient();
  const { error: erroBan } = await admin.auth.admin.updateUserById(
    idValido.data,
    { ban_duration: validado.data.ativo ? "none" : "87600h" },
  );
  if (erroBan) {
    return erroAcao(
      "administracao.usuarios.editar",
      erroBan,
      "Status salvo, mas o bloqueio na autenticação falhou. Tente salvar de novo",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Aplica um perfil como template de permissões via RPC aplicar_perfil. */
export async function aplicarPerfilUsuario(
  usuarioId: string,
  perfilId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar usuários" };
  }

  const usuarioValido = uuidSchema.safeParse(usuarioId);
  const perfilValido = uuidSchema.safeParse(perfilId);
  if (!usuarioValido.success || !perfilValido.success) {
    return { erro: "Usuário ou perfil inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("aplicar_perfil", {
    p_usuario_id: usuarioValido.data,
    p_perfil_id: perfilValido.data,
  });

  if (error) {
    return erroAcao(
      "administracao.usuarios.aplicar-perfil",
      error,
      "Não foi possível aplicar o perfil. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Substitui a matriz individual do usuário numa transação só, via RPC
 * salvar_matriz_usuario (delete + insert atômicos, com trava de
 * auto-lockout no banco). Pares fora do catálogo RECURSOS são
 * descartados em silêncio.
 */
export async function salvarMatrizUsuario(
  usuarioId: string,
  permissoes: MatrizInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar usuários" };
  }

  const usuarioValido = uuidSchema.safeParse(usuarioId);
  if (!usuarioValido.success) return { erro: "Usuário inválido" };

  const validado = matrizSchema.safeParse(permissoes);
  if (!validado.success) return { erro: "Permissões inválidas" };

  const validas = validado.data.filter((par) => {
    const recurso = RECURSOS.find((r) => r.id === par.recurso);
    return (
      recurso !== undefined &&
      (recurso.acoes as readonly Acao[]).includes(par.acao)
    );
  });

  const unicas = Array.from(
    new Map(validas.map((par) => [`${par.recurso}|${par.acao}`, par])).values(),
  );

  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_matriz_usuario", {
    p_usuario_id: usuarioValido.data,
    p_permissoes: unicas,
  });

  if (error) {
    if (error.message.includes("propria permissao")) {
      return {
        erro: "Você não pode remover sua própria permissão de editar usuários",
      };
    }
    return erroAcao(
      "administracao.usuarios.salvar-matriz",
      error,
      "Não foi possível salvar a matriz. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
