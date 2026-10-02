/**
 * Filtros FACETADOS: com a tabela já filtrada, cada filtro de seleção só oferece
 * o que existe nela.
 *
 * Pedido do Tiago em 02/10/2026: "quando eu tenho um filtro que já está
 * filtrando a tabela, os outros filtros só podem mostrar opções do que tem na
 * tabela que já está filtrada, tirando os filtros de data e valores". Antes, a
 * lista de cada filtro saía do cadastro inteiro (todos os fornecedores, todos os
 * status), e escolher "Fornecedor X" deixava o filtro de categoria oferecendo
 * vinte categorias das quais dezoito devolviam tabela vazia.
 *
 * ## A regra
 *
 * As opções do filtro F saem das linhas que passam em TODOS OS OUTROS filtros
 * (busca, período e faixa de valor inclusive), mas não no próprio F. Se F se
 * restringisse por ele mesmo, escolher "Pendente" faria o filtro de status
 * oferecer só "Pendente", e trocar de status exigiria limpar antes. É a regra de
 * faceta de qualquer loja online.
 *
 * - O valor já escolhido NUNCA some da lista, mesmo sem linha: senão o gatilho
 *   fica sem rótulo e a pessoa não consegue desmarcar o que não vê.
 * - Filtro de data (período, mês) e de valor (faixa) RESTRINGEM os outros, mas não
 *   são restringidos: são faixas contínuas, não listas de opções.
 * - A ordem das opções é a da lista base: a tela continua mandando na ordem.
 *
 * Módulo puro (sem React, sem `"use client"`): serve tela e Server Action.
 */

/** Mesmo formato do `OpcaoFiltro` do canônico, sem importar o componente. */
export interface OpcaoFacetavel {
  valor: string;
  rotulo: string;
}

/**
 * Um filtro de seleção (simples ou múltipla) visto pela faceta.
 *
 * Dois jeitos de dizer se a linha casa com um valor, use UM:
 * - `chave`: o(s) valor(es) da linha neste filtro (id do fornecedor, status).
 *   É o caminho rápido, e o comum.
 * - `casa`: predicado livre, para opção que não é um valor da linha ("com nota" /
 *   "sem nota", "minhas", faixa de idade).
 */
export type Faceta<T> = {
  /** Valores escolhidos. Vazio = filtro não aplicado. */
  selecionados: readonly string[];
} & (
  | {
      chave: (linha: T) => string | null | undefined | readonly (string | null | undefined)[];
      casa?: never;
    }
  | { casa: (linha: T, valor: string) => boolean; chave?: never }
);

/** Predicado de um filtro que restringe os outros mas não tem lista (busca, data, valor). */
export type FiltroLivre<T> = (linha: T) => boolean;

/** Normaliza o `selecionados` de um FiltroSelect (string, "" = todos). */
export function selecao(valor: string | null | undefined): string[] {
  return valor ? [valor] : [];
}

function casaFaceta<T>(faceta: Faceta<T>, linha: T, valor: string): boolean {
  if (faceta.casa) return faceta.casa(linha, valor);
  const chave = faceta.chave(linha);
  if (Array.isArray(chave)) return chave.includes(valor);
  return chave === valor;
}

function passaFaceta<T>(faceta: Faceta<T>, linha: T): boolean {
  if (faceta.selecionados.length === 0) return true;
  return faceta.selecionados.some((valor) => casaFaceta(faceta, linha, valor));
}

export interface ResultadoFacetado<T, K extends string> {
  /** As linhas que passam em todos os filtros: o que a tabela mostra. */
  linhas: T[];
  /**
   * Restringe as opções de um filtro ao que existe nas linhas que passam nos
   * outros. Mantém o que já está escolhido, na ordem da lista base.
   */
  opcoes: <O extends OpcaoFacetavel>(id: K, base: readonly O[]) => O[];
}

/**
 * Filtra as linhas e prepara as opções facetadas de cada filtro, numa passada.
 *
 * Por linha guarda quantas facetas ela reprova e qual: a linha entra nas opções
 * de F quando passa nos livres e reprova no máximo F. Custo O(linhas × facetas)
 * para filtrar, mais O(linhas) por filtro na hora de montar as opções.
 */
export function filtrarFacetado<T, K extends string>(
  linhas: readonly T[],
  facetas: Record<K, Faceta<T>>,
  livres: readonly FiltroLivre<T>[] = [],
): ResultadoFacetado<T, K> {
  const ids = Object.keys(facetas) as K[];
  const ativos = ids.filter((id) => facetas[id].selecionados.length > 0);

  // Linhas que passam nos livres, com a única faceta que reprovam (se for só uma).
  const candidatas: { linha: T; reprova: K | null }[] = [];
  const filtradas: T[] = [];
  for (const linha of linhas) {
    if (!livres.every((livre) => livre(linha))) continue;
    let reprova: K | null = null;
    let reprovacoes = 0;
    for (const id of ativos) {
      if (!passaFaceta(facetas[id], linha)) {
        reprovacoes += 1;
        reprova = id;
        if (reprovacoes > 1) break;
      }
    }
    if (reprovacoes === 0) {
      filtradas.push(linha);
      candidatas.push({ linha, reprova: null });
    } else if (reprovacoes === 1) {
      candidatas.push({ linha, reprova });
    }
  }

  const cache = new Map<K, Set<string> | T[]>();

  function linhasDe(id: K): T[] {
    return candidatas
      .filter((c) => c.reprova === null || c.reprova === id)
      .map((c) => c.linha);
  }

  function opcoes<O extends OpcaoFacetavel>(id: K, base: readonly O[]): O[] {
    const faceta = facetas[id];
    if (!faceta) return [...base];
    const escolhidos = new Set(faceta.selecionados);

    if (faceta.casa) {
      let universo = cache.get(id) as T[] | undefined;
      if (!universo) {
        universo = linhasDe(id);
        cache.set(id, universo);
      }
      const linhasDaFaceta = universo;
      return base.filter(
        (opcao) =>
          escolhidos.has(opcao.valor) ||
          linhasDaFaceta.some((linha) => faceta.casa(linha, opcao.valor)),
      );
    }

    let presentes = cache.get(id) as Set<string> | undefined;
    if (!presentes) {
      presentes = new Set<string>();
      for (const linha of linhasDe(id)) {
        const chave = faceta.chave(linha);
        if (Array.isArray(chave)) {
          for (const valor of chave) if (valor != null) presentes.add(valor);
        } else if (chave != null) {
          presentes.add(chave as string);
        }
      }
      cache.set(id, presentes);
    }
    return restringirOpcoes(base, presentes, faceta.selecionados);
  }

  return { linhas: filtradas, opcoes };
}

/**
 * A restrição em si, para quem já tem o conjunto de valores presentes (a consulta
 * de facetas do servidor devolve isso pronto). Mantém o escolhido e a ordem da
 * base.
 */
export function restringirOpcoes<O extends OpcaoFacetavel>(
  base: readonly O[],
  presentes: ReadonlySet<string>,
  selecionados: readonly string[] = [],
): O[] {
  const escolhidos = new Set(selecionados);
  return base.filter(
    (opcao) => escolhidos.has(opcao.valor) || presentes.has(opcao.valor),
  );
}

/** A faceta vista pela consulta do servidor: está aplicada? de onde sai o valor? */
export interface FacetaServidor<L> {
  ativo: boolean;
  chave: (linha: L) => string | null | undefined | readonly (string | null | undefined)[];
}

/** Valores presentes por filtro, pronto para atravessar a fronteira até o cliente. */
export type FacetasPresentes<K extends string> = Record<K, string[]>;

/**
 * As facetas de uma tela que filtra no BANCO (com paginação): o cliente só vê
 * uma página, então quem sabe o que existe na tabela filtrada é o servidor.
 *
 * `consultar(exceto)` roda a consulta da tela com todos os filtros MENOS
 * `exceto` (null = todos), sem paginação, trazendo só as colunas das chaves.
 * Uma consulta com tudo aplicado serve os filtros vazios (filtro vazio não se
 * exclui de nada); cada filtro preenchido pede a sua, sem ele. Na tela típica
 * são uma ou duas consultas leves.
 */
export async function facetasNoServidor<L, K extends string>(
  facetas: Record<K, FacetaServidor<L>>,
  consultar: (exceto: K | null) => Promise<readonly L[]>,
): Promise<FacetasPresentes<K>> {
  const ids = Object.keys(facetas) as K[];
  const ativos = ids.filter((id) => facetas[id].ativo);
  const inativos = ids.filter((id) => !facetas[id].ativo);

  function distintos(linhas: readonly L[], id: K): string[] {
    const presentes = new Set<string>();
    for (const linha of linhas) {
      const chave = facetas[id].chave(linha);
      if (Array.isArray(chave)) {
        for (const valor of chave) if (valor != null) presentes.add(valor);
      } else if (chave != null) {
        presentes.add(chave as string);
      }
    }
    return [...presentes];
  }

  const [todas, ...semCada] = await Promise.all([
    inativos.length > 0 ? consultar(null) : Promise.resolve([] as readonly L[]),
    ...ativos.map((id) => consultar(id)),
  ]);

  const resultado = {} as FacetasPresentes<K>;
  for (const id of inativos) resultado[id] = distintos(todas, id);
  ativos.forEach((id, i) => {
    resultado[id] = distintos(semCada[i], id);
  });
  return resultado;
}
