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

/** Filtros e paginação da listagem de insumos. */
export interface ListarInsumosParams {
  pagina: number;
  tamanho: number;
  /** Busca por nome ou código (ilike no servidor). */
  busca?: string;
  /** true = só ativos, false = só inativos; ausente = todos. */
  ativo?: boolean;
}

/** Resultado paginado da listagem de insumos. */
export interface InsumosPagina {
  itens: InsumoLista[];
  total: number;
}

/**
 * Lista os insumos com paginação server-side (count exato), categoria (nome)
 * e unidade (sigla) resolvidas. Aceita busca por nome ou código e filtro por
 * ativo/inativo.
 */
export async function listar(
  params: ListarInsumosParams,
): Promise<InsumosPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("insumos")
    .select(
      "id, codigo, nome, categoria_id, unidade_id, descricao, ativo, categorias_insumo(nome), unidades_medida(sigla)",
      { count: "exact" },
    )
    .order("nome")
    .order("id")
    .range(de, ate);

  if (params.ativo !== undefined) consulta = consulta.eq("ativo", params.ativo);

  // Remove caracteres que quebram a sintaxe do filtro `or` do PostgREST.
  const termo = (params.busca ?? "").trim().replace(/[,()"\\]/g, "");
  if (termo) {
    consulta = consulta.or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`);
  }

  const { data, error, count } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os insumos");
  }

  const itens: InsumoLista[] = (data ?? []).map((insumo) => ({
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

  return { itens, total: count ?? 0 };
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
