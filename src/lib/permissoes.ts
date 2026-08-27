import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { MODULOS, recursosDoModulo } from "@/config/recursos";
import type {
  Acao,
  ModuloId,
  RecursoDef,
  RecursoId,
} from "@/config/recursos";

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
  /**
   * Caminho da foto de perfil no bucket, ou null.
   *
   * É o CAMINHO, não a URL: URL do Storage é assinada e expira, então guardar ou
   * passar URL adiante é o defeito. Quem precisa exibir assina na hora, com
   * `urlAssinadaDaFoto`.
   *
   * Vive aqui, e não numa consulta separada, porque o avatar está no LAYOUT: uma
   * segunda consulta só para isso rodaria em toda página, ao lado desta que já
   * roda. A coluna a mais não custa nada; a consulta a mais, sim.
   */
  fotoPath: string | null;
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
        .select("id, nome, email, ativo, perfil_id, foto_path")
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
      email: usuario.email ?? "",
      ativo: usuario.ativo,
      perfilId: usuario.perfil_id,
      fotoPath: usuario.foto_path,
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

/**
 * Módulos que o usuário pode ver, na ordem da sidebar (MODULOS).
 * Um módulo é visível quando o usuário tem "ver" em algum recurso dele.
 */
export function modulosVisiveis(
  usuario: UsuarioLogado | null,
): ReadonlyArray<(typeof MODULOS)[number]> {
  return MODULOS.filter((modulo) =>
    recursosDoModulo(modulo.id).some((recurso) =>
      temPermissao(usuario, recurso.id as RecursoId, "ver"),
    ),
  );
}

/**
 * Abas de um módulo que o usuário pode ver, na ordem do catálogo (RECURSOS).
 * Fonte única da navegação: alimenta as abas horizontais dentro do módulo e o
 * submenu da sidebar, então as duas nunca divergem.
 */
export function abasVisiveis(
  usuario: UsuarioLogado | null,
  modulo: ModuloId,
): readonly RecursoDef[] {
  return recursosDoModulo(modulo).filter((recurso) =>
    temPermissao(usuario, recurso.id as RecursoId, "ver"),
  );
}

/**
 * Rota inicial do usuário: o primeiro módulo visível na ordem da sidebar.
 * Retorna null quando não há nenhum módulo visível.
 */
export function rotaInicial(usuario: UsuarioLogado | null): string | null {
  return modulosVisiveis(usuario)[0]?.rota ?? null;
}
