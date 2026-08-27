"use server";

import { revalidatePath } from "next/cache";

import { RECURSOS, type Acao } from "@/config/recursos";
import { erroAcao, logErroServidor } from "@/lib/erros";
import { idSchema } from "@/lib/id";
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
  const idValido = idSchema.safeParse(usuarioId);
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
  const idValido = idSchema.safeParse(usuarioId);
  if (!idValido.success) return { erro: "Usuário inválido" };
  if (idValido.data === editor.id) {
    return {
      erro: "Para trocar a sua própria senha, use Minha conta > Alterar senha.",
    };
  }

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
 * Exclui um usuário. Se ele nunca fez nada no app, apaga de vez (registro +
 * login). Se já fez ações, guarda só id + nome (tombstone) para o histórico
 * de auditoria não quebrar, e bane o login. Não dá para excluir a si mesmo.
 */
export async function excluirUsuario(
  usuarioId: string,
): Promise<ResultadoAcao> {
  const editor = await getUsuarioLogado();
  if (!editor || !temPermissao(editor, RECURSO, "excluir")) {
    return { erro: "Sem permissão para excluir usuários" };
  }
  const idValido = idSchema.safeParse(usuarioId);
  if (!idValido.success) return { erro: "Usuário inválido" };
  if (idValido.data === editor.id) {
    return { erro: "Você não pode excluir a sua própria conta" };
  }

  const supabase = await createClient();
  const { data: apagarDeVez, error } = await supabase.rpc(
    "fn_excluir_usuario",
    { p_id: idValido.data },
  );
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

  const admin = createAdminClient();
  if (apagarDeVez) {
    // Nunca fez nada no app: apaga de vez. Remover o auth.user cascateia
    // public.usuarios, permissões e a senha provisória.
    const { error: erroDel } = await admin.auth.admin.deleteUser(idValido.data);
    if (erroDel) {
      return erroAcao(
        "administracao.usuarios.excluir",
        erroDel,
        "Usuário limpo, mas a conta de login não foi removida. Tente excluir de novo",
      );
    }
  } else {
    // Fez ações: virou tombstone (só id + nome). Bane o login pra não entrar.
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

  const idValido = idSchema.safeParse(id);
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

  const usuarioValido = idSchema.safeParse(usuarioId);
  const perfilValido = idSchema.safeParse(perfilId);
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

  const usuarioValido = idSchema.safeParse(usuarioId);
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

/**
 * Substitui as contas bancárias cujo SALDO este usuário pode ver.
 *
 * A permissão é por LINHA (usuário x conta), então não cabe na matriz de
 * recurso x ação: ela mora em `usuario_conta_saldo`, e quem grava é
 * `salvar_saldos_usuario`, que checa `administracao.usuarios / editar` no banco
 * também — a checagem daqui é a camada 2, não a única.
 *
 * Marcar ou desmarcar não muda o que os ADMINS veem: quem tem
 * `administracao.usuarios / editar` vê o saldo de todas as contas por
 * `fn_pode_ver_saldo`, decisão do Tiago em 27/08/2026. A tela avisa isso, senão
 * testar a marcação num Admin dá a impressão de que ela não funciona.
 *
 * Revalida a ROTA de usuários e também "/financeiro/contas-bancarias": o saldo
 * que o próprio editor vê pode ter mudado se ele editou a si mesmo, e a listagem
 * de contas é onde isso aparece.
 */
export async function salvarSaldosUsuario(
  usuarioId: string,
  contaIds: string[],
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar usuários" };
  }

  const usuarioValido = idSchema.safeParse(usuarioId);
  if (!usuarioValido.success) return { erro: "Usuário inválido" };

  // Só uuid, e sem repetição: o array vem do cliente, e a RPC já ignora id que
  // não é conta — mas mandar lixo pela rede não ajuda ninguém a depurar.
  const validos = Array.from(
    new Set(
      contaIds.filter((id) => idSchema.safeParse(id).success),
    ),
  );

  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_saldos_usuario", {
    p_usuario_id: usuarioValido.data,
    p_contas: validos,
  });

  if (error) {
    return erroAcao(
      "administracao.usuarios.salvar-saldos",
      error,
      "Não foi possível salvar as contas. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  revalidatePath("/financeiro/contas-bancarias");
  return { ok: true };
}
