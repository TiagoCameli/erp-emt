import "server-only";

import type { Acao } from "@/config/recursos";
import { createClient } from "@/lib/supabase/server";

export interface PerfilResumo {
  id: string;
  nome: string;
  descricao: string | null;
  totalPermissoes: number;
  totalUsuarios: number;
}

export interface PermissaoPerfil {
  recurso: string;
  acao: Acao;
}

/** Lista os perfis com contagem de permissões e de usuários vinculados. */
export async function listarPerfis(): Promise<PerfilResumo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("perfis")
    .select("id, nome, descricao, perfil_permissoes(count), usuarios(count)")
    .order("nome", { ascending: true });

  if (error) {
    throw new Error(`Falha ao listar perfis: ${error.message}`);
  }

  return (data ?? []).map((perfil) => ({
    id: perfil.id,
    nome: perfil.nome,
    descricao: perfil.descricao,
    totalPermissoes: perfil.perfil_permissoes[0]?.count ?? 0,
    totalUsuarios: perfil.usuarios[0]?.count ?? 0,
  }));
}

/** Permissões (recurso + ação) de um perfil específico. */
export async function buscarPermissoesPerfil(
  perfilId: string,
): Promise<PermissaoPerfil[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("perfil_permissoes")
    .select("recurso, acao")
    .eq("perfil_id", perfilId);

  if (error) {
    throw new Error(`Falha ao buscar permissões do perfil: ${error.message}`);
  }

  return (data ?? []).map((permissao) => ({
    recurso: permissao.recurso,
    acao: permissao.acao as Acao,
  }));
}
