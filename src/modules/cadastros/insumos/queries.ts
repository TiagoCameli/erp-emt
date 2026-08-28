import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  corGrupo,
  type CorGrupo,
} from "@/modules/cadastros/_shared/insumo-grupos";

/** Linha da listagem de insumos, com grupo, categoria e unidade resolvidas. */
export interface InsumoLista {
  id: string;
  codigo: string | null;
  nome: string;
  categoriaId: string;
  categoriaNome: string | null;
  /**
   * Categoria de custo (financeira). É ela que classifica a compra no DRE
   * quando a OC é aprovada; nula trava a aprovação de qualquer OC que use o
   * insumo. Nula só nos insumos anteriores ao campo virar obrigatório.
   */
  categoriaCustoId: string | null;
  categoriaCustoNome: string | null;
  /** Grupo vem por join da categoria: não existe grupo_id no insumo. */
  grupoId: string | null;
  grupoNome: string | null;
  grupoCor: CorGrupo;
  unidadeId: string;
  unidadeSigla: string | null;
  descricao: string | null;
  ativo: boolean;
}

/**
 * Categoria (subcategoria) para o select do formulário, com o grupo dela: é o
 * que permite o segundo seletor filtrar pelo grupo escolhido no primeiro.
 */
export interface CategoriaOpcao {
  id: string;
  nome: string;
  grupoId: string;
  grupoNome: string;
}

/**
 * Categoria de custo (financeira) disponível para o select do formulário.
 * Mesma forma da opção usada no cabeçalho da OC.
 */
export interface CategoriaCustoOpcao {
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
  /** Filtro por grupo (id). */
  grupoId?: string;
  /** Filtro por subcategoria (id). */
  categoriaId?: string;
  /** Filtro por unidade de medida (id). */
  unidadeId?: string;
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
      `id, codigo, nome, categoria_id, categoria_financeira_id, unidade_id,
       descricao, ativo,
       categorias_insumo!inner(nome, grupo_id, insumo_grupos(id, nome, cor)),
       categorias_financeiras(nome),
       unidades_medida(sigla)`,
      { count: "exact" },
    )
    .order("nome")
    .order("id")
    .range(de, ate);

  if (params.ativo !== undefined) consulta = consulta.eq("ativo", params.ativo);
  if (params.unidadeId) consulta = consulta.eq("unidade_id", params.unidadeId);
  if (params.categoriaId) {
    consulta = consulta.eq("categoria_id", params.categoriaId);
  } else if (params.grupoId) {
    // Filtro por grupo passa pela categoria (o insumo não guarda grupo).
    consulta = consulta.eq("categorias_insumo.grupo_id", params.grupoId);
  }

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
    categoriaCustoId: insumo.categoria_financeira_id,
    categoriaCustoNome: insumo.categorias_financeiras?.nome ?? null,
    grupoId: insumo.categorias_insumo?.insumo_grupos?.id ?? null,
    grupoNome: insumo.categorias_insumo?.insumo_grupos?.nome ?? null,
    grupoCor: corGrupo(insumo.categorias_insumo?.insumo_grupos?.cor),
    unidadeId: insumo.unidade_id,
    unidadeSigla: insumo.unidades_medida?.sigla ?? null,
    descricao: insumo.descricao,
    ativo: insumo.ativo,
  }));

  return { itens, total: count ?? 0 };
}

/** Subcategorias ativas com o grupo, para os dois selects em cascata. */
export async function listarCategorias(): Promise<CategoriaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_insumo")
    .select("id, nome, grupo_id, insumo_grupos!inner(nome, ordem)")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias");
  }

  return (data ?? [])
    .map((categoria) => ({
      id: categoria.id,
      nome: categoria.nome,
      grupoId: categoria.grupo_id,
      grupoNome: categoria.insumo_grupos?.nome ?? "",
      ordem: categoria.insumo_grupos?.ordem ?? 99,
    }))
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .map(({ ordem: _ordem, ...opcao }) => opcao);
}

/**
 * Categorias de custo ativas do tipo 'despesa', para o select do formulário.
 * Só despesa: insumo é sempre custo, categoria de receita na lista só
 * atrapalharia quem está classificando — mesma regra do select da OC.
 */
export async function listarCategoriasCusto(): Promise<CategoriaCustoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_financeiras")
    .select("id, nome")
    .eq("ativo", true)
    .eq("tipo", "despesa")
    // Natureza `movimentacao` é principal de aplicação e de empréstimo, e
    // fn_rel_posicao_bancaria a EXCLUI do saldo: um insumo classificado nela
    // faria a compra sair do saldo bancário. `fn_reclassificar_insumo` recusa, e
    // a lista não pode oferecer o que o banco recusa.
    .neq("natureza", "movimentacao")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias de custo");
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
