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
import { gerarSenhaProvisoria } from "@/modules/administracao/usuarios/senha-provisoria";

const RECURSO = "administracao.usuarios" as const;
const ROTA = "/administracao/usuarios";

export type ResultadoAcao = { ok: true } | { erro: string };

export type ResultadoConvite =
  | { ok: true; senhaProvisoria: string; aviso?: string }
  | { erro: string };

export type ResultadoSenha =
  | { ok: true; senha: string | null }
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
 * Cadastra um usuário sem depender de email: cria na auth com uma senha
 * provisória gerada e a flag senha_temporaria (força a troca no 1º acesso),
 * guarda a provisória para o admin repassar/reabrir, e aplica o perfil.
 * O trigger do banco cria a linha em usuarios; o perfil é aplicado via RPC.
 */
export async function convidarUsuario(
  dados: ConvidarUsuarioInput,
): Promise<ResultadoConvite> {
  const editor = await getUsuarioLogado();
  if (!editor || !temPermissao(editor, RECURSO, "criar")) {
    return { erro: "Sem permissão para cadastrar usuários" };
  }

  const validado = convidarUsuarioSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { nome, email, perfilId } = validado.data;
  const admin = createAdminClient();

  const senhaProvisoria = gerarSenhaProvisoria();
  const criado = await admin.auth.admin.createUser({
    email,
    password: senhaProvisoria,
    email_confirm: true,
    user_metadata: { nome, senha_temporaria: true },
  });

  if (criado.error) {
    if (criado.error.code === "email_exists") {
      return { erro: "Já existe um usuário com este email" };
    }
    return erroAcao(
      "administracao.usuarios.cadastrar",
      criado.error,
      "Não foi possível cadastrar o usuário. Tente novamente",
    );
  }

  const usuarioId = criado.data.user?.id;
  if (!usuarioId) {
    return { erro: "Não foi possível cadastrar o usuário. Tente novamente" };
  }

  // Client normal: o RLS valida a permissão de quem chama.
  const supabase = await createClient();

  const { error: erroSenha } = await supabase
    .from("usuario_senha_provisoria")
    .insert({ usuario_id: usuarioId, senha: senhaProvisoria, gerada_por: editor.id });
  if (erroSenha) {
    return erroAcao(
      "administracao.usuarios.cadastrar",
      erroSenha,
      "Usuário criado, mas a senha provisória não foi salva. Redefina a senha do usuário",
    );
  }

  let aviso: string | undefined;
  if (perfilId) {
    const { error } = await supabase.rpc("aplicar_perfil", {
      p_usuario_id: usuarioId,
      p_perfil_id: perfilId,
    });
    if (error) {
      logErroServidor("administracao.usuarios.cadastrar", error);
      aviso =
        "Usuário criado, mas o perfil não foi aplicado. Abra o usuário e aplique de novo";
    }
  }

  revalidatePath(ROTA);

  const resultado: ResultadoConvite = { ok: true, senhaProvisoria };
  if (aviso) resultado.aviso = aviso;
  return resultado;
}

/** Lê a senha provisória de um usuário (só admin). Null se já não há. */
export async function obterSenhaProvisoria(
  usuarioId: string,
): Promise<ResultadoSenha> {
  if (!(await checarPermissao("ver"))) {
    return { erro: "Sem permissão para ver a senha provisória" };
  }
  const idValido = uuidSchema.safeParse(usuarioId);
  if (!idValido.success) return { erro: "Usuário inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuario_senha_provisoria")
    .select("senha")
    .eq("usuario_id", idValido.data)
    .maybeSingle();

  if (error) {
    return erroAcao(
      "administracao.usuarios.obter-senha",
      error,
      "Não foi possível carregar a senha provisória",
    );
  }
  return { ok: true, senha: data?.senha ?? null };
}

/**
 * Redefine a senha do usuário para uma nova provisória (gerada), força a
 * troca no próximo acesso e regrava a provisória para o admin repassar.
 */
export async function redefinirSenhaUsuario(
  usuarioId: string,
): Promise<ResultadoConvite> {
  const editor = await getUsuarioLogado();
  if (!editor || !temPermissao(editor, RECURSO, "editar")) {
    return { erro: "Sem permissão para redefinir senhas" };
  }
  const idValido = uuidSchema.safeParse(usuarioId);
  if (!idValido.success) return { erro: "Usuário inválido" };

  const admin = createAdminClient();

  // Preserva o metadata atual (nome etc.) e religa a flag de troca.
  const { data: atual, error: erroLeitura } =
    await admin.auth.admin.getUserById(idValido.data);
  if (erroLeitura || !atual.user) {
    return erroAcao(
      "administracao.usuarios.redefinir-senha",
      erroLeitura ?? new Error("usuário não encontrado"),
      "Não foi possível redefinir a senha. Tente novamente",
    );
  }

  const senhaProvisoria = gerarSenhaProvisoria();
  const { error: erroUpdate } = await admin.auth.admin.updateUserById(
    idValido.data,
    {
      password: senhaProvisoria,
      user_metadata: { ...atual.user.user_metadata, senha_temporaria: true },
    },
  );
  if (erroUpdate) {
    return erroAcao(
      "administracao.usuarios.redefinir-senha",
      erroUpdate,
      "Não foi possível redefinir a senha. Tente novamente",
    );
  }

  const supabase = await createClient();
  const { error: erroSenha } = await supabase
    .from("usuario_senha_provisoria")
    .upsert(
      {
        usuario_id: idValido.data,
        senha: senhaProvisoria,
        gerada_em: new Date().toISOString(),
        gerada_por: editor.id,
      },
      { onConflict: "usuario_id" },
    );
  if (erroSenha) {
    return erroAcao(
      "administracao.usuarios.redefinir-senha",
      erroSenha,
      "Senha redefinida, mas não foi salva para exibição. Tente redefinir de novo",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, senhaProvisoria };
}

/**
 * Exclui um usuário (soft delete): some da lista e perde acesso, mas o
 * registro fica para o nome persistir nas ações/auditoria. Bane na auth
 * para bloquear login. Não é possível excluir a própria conta.
 */
export async function excluirUsuario(
  usuarioId: string,
): Promise<ResultadoAcao> {
  const editor = await getUsuarioLogado();
  if (!editor || !temPermissao(editor, RECURSO, "excluir")) {
    return { erro: "Sem permissão para excluir usuários" };
  }
  const idValido = uuidSchema.safeParse(usuarioId);
  if (!idValido.success) return { erro: "Usuário inválido" };
  if (idValido.data === editor.id) {
    return { erro: "Você não pode excluir a sua própria conta" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_usuario", {
    p_id: idValido.data,
  });
  if (error) {
    if (error.message.includes("propria conta")) {
      return { erro: "Você não pode excluir a sua própria conta" };
    }
    return erroAcao(
      "administracao.usuarios.excluir",
      error,
      "Não foi possível excluir o usuário. Tente novamente",
    );
  }

  // Bloqueia login do excluído (a auth mantém o registro pro histórico).
  const admin = createAdminClient();
  const { error: erroBan } = await admin.auth.admin.updateUserById(
    idValido.data,
    { ban_duration: "87600h" },
  );
  if (erroBan) {
    return erroAcao(
      "administracao.usuarios.excluir",
      erroBan,
      "Usuário excluído, mas o bloqueio de login falhou. Tente excluir de novo",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
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
