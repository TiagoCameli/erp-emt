import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Acao, RecursoId } from "@/config/recursos";

export interface PermissaoUsuario {
  recurso: string;
  acao: Acao;
}

export interface UsuarioLogado {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfilId: string | null;
  permissoes: PermissaoUsuario[];
}

/**
 * Usuário logado + matriz de permissões, com cache por request.
 * Retorna null sem sessão ou com usuário desativado.
 *
 * Camada 2 do enforcement triplo (a 1 é o RLS no banco; a 3 é a
 * UI esconder). Toda Server Action passa por aqui.
 */
export const getUsuarioLogado = cache(
  async (): Promise<UsuarioLogado | null> => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const [{ data: usuario }, { data: permissoes }] = await Promise.all([
      supabase
        .from("usuarios")
        .select("id, nome, email, ativo, perfil_id")
        .eq("id", user.id)
        .single(),
      supabase
        .from("usuario_permissoes")
        .select("recurso, acao")
        .eq("usuario_id", user.id),
    ]);

    if (!usuario || !usuario.ativo) return null;

    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      ativo: usuario.ativo,
      perfilId: usuario.perfil_id,
      permissoes: (permissoes ?? []) as PermissaoUsuario[],
    };
  },
);

export function temPermissao(
  usuario: UsuarioLogado | null,
  recurso: RecursoId,
  acao: Acao,
): boolean {
  if (!usuario) return false;
  return usuario.permissoes.some(
    (p) => p.recurso === recurso && p.acao === acao,
  );
}

/**
 * Guarda de Server Action: lança se o usuário não tem a permissão.
 * O RLS no banco continua sendo a última barreira.
 */
export async function exigirPermissao(
  recurso: RecursoId,
  acao: Acao,
): Promise<UsuarioLogado> {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, recurso, acao)) {
    throw new Error(`Sem permissão: ${recurso} / ${acao}`);
  }
  return usuario;
}
