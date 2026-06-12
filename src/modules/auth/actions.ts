"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  definirSenhaSchema,
  loginSchema,
  type DefinirSenhaInput,
  type LoginInput,
} from "@/modules/auth/schemas";

type ResultadoAcao = { erro: string } | undefined;

/**
 * Autentica com email e senha. Em caso de sucesso redireciona para "/".
 * Retorna { erro } com mensagem amigável quando a autenticação falha.
 */
export async function entrar(dados: LoginInput): Promise<ResultadoAcao> {
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
    return { erro: "Não foi possível entrar. Tente novamente" };
  }

  revalidatePath("/", "layout");
  redirect("/");
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
  });

  if (error) {
    if (error.code === "same_password") {
      return { erro: "A nova senha precisa ser diferente da atual" };
    }
    if (error.code === "weak_password") {
      return { erro: "Senha muito fraca. Use uma combinação mais segura" };
    }
    return { erro: "Não foi possível definir a senha. Tente novamente" };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
