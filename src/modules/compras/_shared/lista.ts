import "server-only";

import type { createClient } from "@/lib/supabase/server";

/** Paginação e busca lidas dos searchParams de uma listagem de Compras. */
export interface ParametrosLista {
  /** Página base 0 (na URL o parâmetro `pagina` é base 1). */
  pagina: number;
  tamanho: number;
  busca?: string;
}

const TAMANHO_PADRAO = 25;

/** Lê e valida um parâmetro de filtro contra a lista de valores aceitos. */
export function parametroValido<T extends string>(
  valor: string | string[] | undefined,
  validos: readonly T[],
): T | undefined {
  if (typeof valor !== "string") return undefined;
  return (validos as readonly string[]).includes(valor)
    ? (valor as T)
    : undefined;
}

/** Lê página (base 1 na URL), tamanho (padrão 25) e termo de busca. */
export function lerParametrosLista(
  params: Record<string, string | string[] | undefined>,
): ParametrosLista {
  const paginaParam = Number(params.pagina);
  const pagina =
    Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;

  const tamanhoParam = Number(params.tamanho);
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? tamanhoParam
      : TAMANHO_PADRAO;

  const busca = typeof params.busca === "string" ? params.busca.trim() : "";

  return { pagina, tamanho, busca: busca === "" ? undefined : busca };
}

/**
 * Padrão ilike (%termo%) do termo de busca. Remove caracteres que quebram a
 * sintaxe dos filtros or() do PostgREST (vírgula, parênteses, aspas, barra).
 */
export function padraoBusca(termo: string): string {
  return `%${termo.replace(/[,()"'\\]/g, "").trim()}%`;
}

/** Máximo de fornecedores resolvidos por nome numa busca (limite do filtro in). */
const MAX_FORNECEDORES_BUSCA = 50;

/**
 * Ids de fornecedores cujo nome (razão social ou fantasia) bate com o padrão.
 * Permite busca server-side por fornecedor em listagens cuja tabela só guarda
 * o fornecedor_id (o or() do PostgREST não mistura colunas do pai com joins).
 */
export async function idsFornecedoresPorNome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  padrao: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id")
    .or(`razao_social.ilike.${padrao},nome_fantasia.ilike.${padrao}`)
    .limit(MAX_FORNECEDORES_BUSCA);

  if (error) {
    throw new Error("Não foi possível aplicar a busca por fornecedor");
  }
  return (data ?? []).map((fornecedor) => fornecedor.id);
}
