import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Usuário nas opções dos filtros de Administração (auditoria, lixeira). */
export interface UsuarioParaFiltro {
  id: string;
  nome: string;
}

/**
 * Usuários para os filtros de "quem fez" das telas de Administração, em ordem
 * alfabética.
 *
 * Vem da tabela, então respeita a RLS de `usuarios`: quem tem auditoria ou
 * lixeira mas não tem `administracao.usuarios` ver recebe lista vazia e o filtro
 * fica só com "Todos". A trilha em si continua mostrando o nome de quem agiu,
 * que é resolvido pela RPC `nomes_usuarios_auditoria` (security definer).
 */
export async function listarUsuariosParaFiltro(): Promise<UsuarioParaFiltro[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome")
    .order("nome", { ascending: true });

  if (error) {
    throw new Error(
      `Falha ao listar os usuários para o filtro: ${error.message}`,
    );
  }

  return data ?? [];
}
