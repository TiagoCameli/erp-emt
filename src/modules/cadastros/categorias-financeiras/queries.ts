import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import type {
  NaturezaCategoriaFinanceira,
  TipoCategoriaFinanceira,
} from "@/modules/cadastros/categorias-financeiras/schemas";

/** Linha da listagem de categorias financeiras. */
export interface CategoriaFinanceiraLista {
  id: string;
  nome: string;
  tipo: TipoCategoriaFinanceira;
  /** Onde ela entra no DRE: operacional, financeira ou movimentação. */
  natureza: NaturezaCategoriaFinanceira;
  paiId: string | null;
  paiNome: string | null;
  ativo: boolean;
  /** Quantidade de lançamentos que usam esta categoria. */
  usos: number;
  criadoEm: string;
}

/** Opção de categoria pai (só nível 1) para o select do formulário. */
export interface CategoriaPaiOpcao {
  id: string;
  nome: string;
  tipo: TipoCategoriaFinanceira;
}

/**
 * Lista todas as categorias financeiras, com o nome da categoria pai e a
 * contagem de lançamentos por categoria, ordenadas por nome.
 */
export async function listarCategorias(): Promise<CategoriaFinanceiraLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_financeiras")
    .select("id, nome, tipo, natureza, pai_id, ativo, created_at")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias");
  }

  const categorias = data ?? [];
  const nomePorId = new Map(categorias.map((c) => [c.id, c.nome]));

  // Paginado: são 6.462 lançamentos e o PostgREST corta em 1.000 sem erro
  // nenhum. Sem isto a coluna "Usos" mostrava a contagem de um sexto da base e
  // uma categoria muito usada apareceria como pouco usada -- que é justamente o
  // número que decide se dá para desativar a categoria. `.order("id")` porque
  // paginação sem desempate repete linha numa página e perde na seguinte.
  const { linhas: lancamentos, erro: erroLancamentos } = await todasAsLinhas(
    (de, ate) =>
      supabase
        .from("lancamentos")
        .select("categoria_id")
        .order("id")
        .range(de, ate),
  );

  if (erroLancamentos) {
    throw new Error("Não foi possível carregar o uso das categorias");
  }

  const usoPorCategoria = new Map<string, number>();
  for (const lancamento of lancamentos) {
    if (!lancamento.categoria_id) continue;
    usoPorCategoria.set(
      lancamento.categoria_id,
      (usoPorCategoria.get(lancamento.categoria_id) ?? 0) + 1,
    );
  }

  return categorias.map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
    tipo: categoria.tipo as TipoCategoriaFinanceira,
    natureza: categoria.natureza as NaturezaCategoriaFinanceira,
    paiId: categoria.pai_id,
    paiNome: categoria.pai_id ? (nomePorId.get(categoria.pai_id) ?? null) : null,
    ativo: categoria.ativo,
    usos: usoPorCategoria.get(categoria.id) ?? 0,
    criadoEm: categoria.created_at,
  }));
}

/**
 * Lista as categorias de nível 1 (sem pai), ativas, para servir de pai no
 * formulário. Hierarquia simples: pai só pode ser categoria raiz.
 */
export async function listarCategoriasPai(): Promise<CategoriaPaiOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_financeiras")
    .select("id, nome, tipo")
    .is("pai_id", null)
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias pai");
  }

  return (data ?? []).map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
    tipo: categoria.tipo as TipoCategoriaFinanceira,
  }));
}
