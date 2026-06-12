import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TipoCategoria } from "@/modules/cadastros/categorias/schemas";

/** Linha da listagem de categorias de insumo. */
export interface CategoriaLista {
  id: string;
  nome: string;
  tipo: TipoCategoria;
  ativo: boolean;
  criadoEm: string;
}

/** Lista todas as categorias de insumo, ordenadas por nome. */
export async function listar(): Promise<CategoriaLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_insumo")
    .select("id, nome, tipo, ativo, created_at")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias");
  }

  return (data ?? []).map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
    tipo: categoria.tipo as TipoCategoria,
    ativo: categoria.ativo,
    criadoEm: categoria.created_at,
  }));
}
