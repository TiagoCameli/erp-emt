"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { erroAcao, logErroServidor } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { destinoSeguro } from "@/modules/auth/destino";
import {
  definirSenhaSchema,
  loginSchema,
  type DefinirSenhaInput,
  type LoginInput,
} from "@/modules/auth/schemas";

type ResultadoAcao = { erro: string } | undefined;

/**
 * Autentica com email e senha. Em caso de sucesso redireciona para o `destino`
 * pretendido, ou para "/" quando não há um que preste.
 * Retorna { erro } com mensagem amigável quando a autenticação falha.
 *
 * `destino` chega cru do query string, então é entrada não confiável: quem
 * decide para onde o redirect vai é `destinoSeguro()`, e nunca o texto recebido.
 */
export async function entrar(
  dados: LoginInput,
  destino?: string,
): Promise<ResultadoAcao> {
  const resultado = loginSchema.safeParse(dados);
  if (!resultado.success) {
    return {
      erro: resultado.error.issues[0]?.message ?? "Dados inválidos",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: resultado.data.email,
    password: resultado.data.senha,
  });

  if (error) {
    if (error.code === "invalid_credentials") {
      return { erro: "Email ou senha incorretos" };
    }
    return erroAcao(
      "auth.entrar",
      error,
      "Não foi possível entrar. Tente novamente",
    );
  }

  revalidatePath("/", "layout");
  redirect(destinoSeguro(destino));
}

/** Encerra a sessão e redireciona para o login. */
export async function sair(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Define a senha do usuário logado (primeiro acesso por convite ou
 * recuperação de senha). Em caso de sucesso redireciona para "/".
 */
export async function definirSenha(
  dados: DefinirSenhaInput,
): Promise<ResultadoAcao> {
  const resultado = definirSenhaSchema.safeParse(dados);
  if (!resultado.success) {
    return {
      erro: resultado.error.issues[0]?.message ?? "Dados inválidos",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: resultado.data.senha,
    // Limpa a flag de senha temporária do convite sem email.
    data: { senha_temporaria: false },
  });

  if (error) {
    if (error.code === "same_password") {
      return { erro: "A nova senha precisa ser diferente da atual" };
    }
    if (error.code === "weak_password") {
      return { erro: "Senha muito fraca. Use uma combinação mais segura" };
    }
    return erroAcao(
      "auth.definir-senha",
      error,
      "Não foi possível definir a senha. Tente novamente",
    );
  }

  // Acesso deixou de ser pendente: some a provisória da visão do admin.
  // Via RPC, não delete direto: a policy de SELECT da tabela é só de admin, e um
  // "delete where usuario_id = ..." precisa ler a linha para achar — quem não é
  // admin apagava zero linhas SEM ERRO e o badge "1º acesso pendente" ficava
  // para sempre.
  const { error: erroLimpeza } = await supabase.rpc(
    "fn_limpar_senha_provisoria_propria",
  );
  if (erroLimpeza) {
    logErroServidor("auth.definir-senha.limpar-provisoria", erroLimpeza);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Troca a senha do próprio usuário logado (self-service, sem deslogar e sem
 * senha provisória). Diferente de definirSenha, não redireciona: devolve
 * { ok } para a tela mostrar o sucesso e manter o usuário onde está.
 */
export async function alterarSenha(
  dados: DefinirSenhaInput,
): Promise<{ ok: true } | { erro: string }> {
  const resultado = definirSenhaSchema.safeParse(dados);
  if (!resultado.success) {
    return { erro: resultado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: resultado.data.senha,
    data: { senha_temporaria: false },
  });

  if (error) {
    if (error.code === "same_password") {
      return { erro: "A nova senha precisa ser diferente da atual" };
    }
    if (error.code === "weak_password") {
      return { erro: "Senha muito fraca. Use uma combinação mais segura" };
    }
    return erroAcao(
      "auth.alterar-senha",
      error,
      "Não foi possível alterar a senha. Tente novamente",
    );
  }

  // Some com qualquer senha provisória pendente do próprio usuário. Mesma
  // armadilha de RLS de definirSenha: pela RPC, não por delete direto.
  const { error: erroLimpeza } = await supabase.rpc(
    "fn_limpar_senha_provisoria_propria",
  );
  if (erroLimpeza) {
    logErroServidor("auth.alterar-senha.limpar-provisoria", erroLimpeza);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
