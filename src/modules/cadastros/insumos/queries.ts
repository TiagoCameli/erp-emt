import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  facetasNoServidor,
  type FacetasPresentes,
} from "@/modules/_shared/filtros-facetados";
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
   * A categoria de CUSTO saiu do insumo em 28/08/2026 (decisão do Tiago: "eu não
   * quero categoria de custo no app, somente grupo e sub categoria"). Ela passou
   * a ser configurada uma vez por SUBCATEGORIA, em
   * `categorias_insumo.categoria_financeira_id` — eram 3.391 insumos carregando
   * um campo que 28 subcategorias já determinavam.
   */
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

/** Os filtros da listagem, sem a paginação. */
export type FiltrosInsumos = Omit<ListarInsumosParams, "pagina" | "tamanho">;

/** O pedaço do builder do PostgREST que os filtros dos insumos usam. */
interface ConsultaFiltravelInsumos<T> {
  eq: (coluna: string, valor: string | boolean) => T;
  or: (filtro: string) => T;
}

/**
 * Aplica os filtros na consulta: serve a página e as facetas, que precisam do
 * MESMO recorte. Síncrona: o builder é thenable (ver `aplicarFiltrosPagas`).
 * O filtro de grupo cai no embed `categorias_insumo!inner`, então quem chama
 * tem que trazê-lo no select.
 */
function aplicarFiltrosInsumos<T extends ConsultaFiltravelInsumos<T>>(
  consultaInicial: T,
  filtros: FiltrosInsumos,
): T {
  let consulta = consultaInicial;
  if (filtros.ativo !== undefined) consulta = consulta.eq("ativo", filtros.ativo);
  if (filtros.unidadeId) consulta = consulta.eq("unidade_id", filtros.unidadeId);
  if (filtros.categoriaId) {
    consulta = consulta.eq("categoria_id", filtros.categoriaId);
  } else if (filtros.grupoId) {
    // Filtro por grupo passa pela categoria (o insumo não guarda grupo).
    consulta = consulta.eq("categorias_insumo.grupo_id", filtros.grupoId);
  }

  // Remove caracteres que quebram a sintaxe do filtro `or` do PostgREST.
  const termo = (filtros.busca ?? "").trim().replace(/[,()"\\]/g, "");
  if (termo) {
    consulta = consulta.or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`);
  }
  return consulta;
}

/** Os filtros de seleção da barra, na chave que a tabela usa. */
export type FacetaInsumos = "status" | "grupo" | "categoria" | "unidade";

/** Qual parâmetro cada faceta solta quando calcula as próprias opções. */
const PARAMETRO_DA_FACETA: Record<FacetaInsumos, keyof FiltrosInsumos> = {
  status: "ativo",
  grupo: "grupoId",
  categoria: "categoriaId",
  unidade: "unidadeId",
};

interface LinhaFacetaInsumos {
  ativo: boolean;
  categoria_id: string;
  unidade_id: string;
  categorias_insumo: { grupo_id: string } | null;
}

/**
 * O que existe na lista filtrada, por filtro de seleção (ver
 * `_shared/filtros-facetados`). A tabela é paginada no banco, então só o
 * servidor sabe quais grupos, subcategorias e unidades sobram depois dos
 * outros filtros. São ~3,6 mil insumos, só com as colunas das chaves.
 *
 * A subcategoria continua em cascata com o grupo: sem ela, a faceta da
 * subcategoria já sai do recorte do grupo escolhido. E o grupo, com uma
 * subcategoria escolhida, oferece o grupo dela (o filtro de grupo é ignorado
 * quando há subcategoria, igual à lista).
 */
export async function facetasInsumos(
  filtros: FiltrosInsumos,
): Promise<FacetasPresentes<FacetaInsumos>> {
  const supabase = await createClient();

  return facetasNoServidor<LinhaFacetaInsumos, FacetaInsumos>(
    {
      status: {
        ativo: filtros.ativo !== undefined,
        chave: (insumo) => (insumo.ativo ? "ativos" : "inativos"),
      },
      grupo: {
        ativo: !!filtros.grupoId,
        chave: (insumo) => insumo.categorias_insumo?.grupo_id,
      },
      categoria: { ativo: !!filtros.categoriaId, chave: (insumo) => insumo.categoria_id },
      unidade: { ativo: !!filtros.unidadeId, chave: (insumo) => insumo.unidade_id },
    },
    async (exceto) => {
      const recorte =
        exceto === null
          ? filtros
          : { ...filtros, [PARAMETRO_DA_FACETA[exceto]]: undefined };
      const { linhas, erro } = await todasAsLinhas((de, ate) =>
        aplicarFiltrosInsumos(
          supabase
            .from("insumos")
            .select("id, ativo, categoria_id, unidade_id, categorias_insumo!inner(grupo_id)"),
          recorte,
        )
          .order("id")
          .range(de, ate),
      );
      if (erro) throw new Error("Não foi possível carregar os filtros dos insumos");
      return linhas;
    },
  );
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
      `id, codigo, nome, categoria_id, unidade_id,
       descricao, ativo,
       categorias_insumo!inner(nome, grupo_id, insumo_grupos(id, nome, cor)),
       unidades_medida(sigla)`,
      { count: "exact" },
    )
    .order("nome")
    .order("id")
    .range(de, ate);

  consulta = aplicarFiltrosInsumos(consulta, params);

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
