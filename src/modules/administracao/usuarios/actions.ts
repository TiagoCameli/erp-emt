"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { RECURSOS, type Acao } from "@/config/recursos";
import { exigirPermissao } from "@/lib/permissoes";
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
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const redirectTo = `${siteUrl}/auth/confirm`;

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

    // Fallback sem email: cria com senha temporária pro admin repassar.
    senhaTemporaria = crypto.randomUUID().slice(0, 12);
    const criado = await admin.auth.admin.createUser({
      email,
      user_metadata: { nome },
      email_confirm: true,
      password: senhaTemporaria,
    });

    if (criado.error) {
      if (criado.error.code === "email_exists") {
        return { erro: "Já existe um usuário com este email" };
      }
      return { erro: "Não foi possível convidar o usuário. Tente novamente" };
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

/** Atualiza nome e status (ativo) do usuário. RLS cobre o update. */
export async function editarUsuario(
  id: string,
  dados: EditarUsuarioInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar usuários" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Usuário inválido" };

  const validado = editarUsuarioSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("usuarios")
    .update({ nome: validado.data.nome, ativo: validado.data.ativo })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar o usuário. Tente novamente" };
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
    return { erro: "Não foi possível aplicar o perfil. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Substitui a matriz individual do usuário: apaga tudo e insere as novas.
 * Pares fora do catálogo RECURSOS são descartados em silêncio.
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

  const { error: erroDelete } = await supabase
    .from("usuario_permissoes")
    .delete()
    .eq("usuario_id", usuarioValido.data);

  if (erroDelete) {
    return { erro: "Não foi possível salvar a matriz. Tente novamente" };
  }

  if (unicas.length > 0) {
    const { error: erroInsert } = await supabase.from("usuario_permissoes").insert(
      unicas.map((par) => ({
        usuario_id: usuarioValido.data,
        recurso: par.recurso,
        acao: par.acao,
      })),
    );

    if (erroInsert) {
      return {
        erro: "Não foi possível salvar as permissões. Recarregue e tente de novo",
      };
    }
  }

  revalidatePath(ROTA);
  return { ok: true };
}
