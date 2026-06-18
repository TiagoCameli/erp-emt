import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Linha da listagem de insumos, com categoria e unidade resolvidas. */
export interface InsumoLista {
  id: string;
  codigo: string | null;
  nome: string;
  categoriaId: string;
  categoriaNome: string | null;
  unidadeId: string;
  unidadeSigla: string | null;
  descricao: string | null;
  ativo: boolean;
}

/** Categoria de insumo disponível para o select do formulário. */
export interface CategoriaOpcao {
  id: string;
  nome: string;
}

/** Unidade de medida disponível para o select do formulário. */
export interface UnidadeOpcao {
  id: string;
  nome: string;
  sigla: string;
}

/** Lista todos os insumos com categoria (nome) e unidade (sigla) resolvidas. */
export async function listar(): Promise<InsumoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("insumos")
    .select(
      "id, codigo, nome, categoria_id, unidade_id, descricao, ativo, categorias_insumo(nome), unidades_medida(sigla)",
    )
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os insumos");
  }

  return (data ?? []).map((insumo) => ({
    id: insumo.id,
    codigo: insumo.codigo,
    nome: insumo.nome,
    categoriaId: insumo.categoria_id,
    categoriaNome: insumo.categorias_insumo?.nome ?? null,
    unidadeId: insumo.unidade_id,
    unidadeSigla: insumo.unidades_medida?.sigla ?? null,
    descricao: insumo.descricao,
    ativo: insumo.ativo,
  }));
}

/** Categorias de insumo ativas, para o select do formulário. */
export async function listarCategorias(): Promise<CategoriaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_insumo")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias");
  }

  return data ?? [];
}

/** Unidades de medida ativas, para o select do formulário. */
export async function listarUnidades(): Promise<UnidadeOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("unidades_medida")
    .select("id, nome, sigla")
    .eq("ativo", true)
    .order("sigla");

  if (error) {
    throw new Error("Não foi possível carregar as unidades de medida");
  }

  return data ?? [];
}
