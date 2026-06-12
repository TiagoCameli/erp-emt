import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Linha da listagem de usuários, com o nome do perfil resolvido. */
export interface UsuarioLista {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfilId: string | null;
  perfilNome: string | null;
  criadoEm: string;
}

/** Par recurso + ação presente na matriz individual do usuário. */
export interface PermissaoLinha {
  recurso: string;
  acao: string;
}

/** Perfil disponível para aplicar como template de permissões. */
export interface PerfilOpcao {
  id: string;
  nome: string;
}

/** Lista todos os usuários com o nome do perfil (join em perfis). */
export async function listarUsuarios(): Promise<UsuarioLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, email, ativo, perfil_id, created_at, perfis(nome)")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os usuários");
  }

  return (data ?? []).map((usuario) => ({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    ativo: usuario.ativo,
    perfilId: usuario.perfil_id,
    perfilNome: usuario.perfis?.nome ?? null,
    criadoEm: usuario.created_at,
  }));
}

/** Matriz individual do usuário: linhas de usuario_permissoes. */
export async function buscarMatrizUsuario(
  usuarioId: string,
): Promise<PermissaoLinha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("usuario_permissoes")
    .select("recurso, acao")
    .eq("usuario_id", usuarioId);

  if (error) {
    throw new Error("Não foi possível carregar as permissões do usuário");
  }

  return data ?? [];
}

/** Perfis cadastrados, para aplicar como template. */
export async function listarPerfis(): Promise<PerfilOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("perfis")
    .select("id, nome")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os perfis");
  }

  return data ?? [];
}
