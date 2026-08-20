/**
 * Filtro de múltipla escolha na URL: como a lista é escrita, lida e limitada.
 *
 * Existe um módulo só para isso porque duas implementações do mesmo formato
 * divergem no primeiro detalhe que alguém acrescenta de um lado (a vírgula, o
 * teto, a deduplicação), e o sintoma é a tela abrir sem erro nenhum mostrando um
 * conjunto diferente do que o filtro diz estar aplicado.
 *
 * Módulo puro: nada de React, nada de banco.
 */

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Teto de itens num filtro de lista.
 *
 * Não é gosto: a consulta filtra com `in`, e o PostgREST manda o filtro na URL.
 * Uuid ocupa 37 caracteres ali, então lista grande vira HTTP 400 por tamanho de
 * URL **antes** de chegar na RLS (já aconteceu neste projeto com mil ids).
 * Cinquenta itens é muito além de qualquer uso real e dá 1,85 KB de filtro, bem
 * dentro do seguro.
 */
export const MAX_ITENS_FILTRO = 50;

/**
 * Lê uma lista da URL.
 *
 * Aceita valores separados por vírgula (`?centro=id1,id2`) e também a chave
 * repetida (`?centro=id1&centro=id2`), que é como um formulário mandaria.
 * Descarta o que não passa em `valido`, deduplica preservando a ordem de escolha
 * e corta no teto.
 *
 * Descartar em silêncio é de propósito, e é a mesma regra do resto dos filtros:
 * valor inválido que chegasse até a tela apareceria marcado na barra, e a pessoa
 * leria que o relatório está filtrado quando ele não está.
 */
export function lerListaDaUrl(
  valor: string | string[] | undefined,
  valido: (item: string) => boolean,
  maximo: number = MAX_ITENS_FILTRO,
): string[] {
  const cru = valor === undefined ? [] : Array.isArray(valor) ? valor : [valor];

  const itens: string[] = [];
  const vistos = new Set<string>();
  for (const parte of cru.flatMap((item) => item.split(","))) {
    const item = parte.trim();
    if (!valido(item) || vistos.has(item)) continue;
    vistos.add(item);
    itens.push(item);
    if (itens.length === maximo) break;
  }
  return itens;
}

/** Atalho de `lerListaDaUrl` para lista de uuid, que é a maioria dos casos. */
export function lerUuidsDaUrl(
  valor: string | string[] | undefined,
  maximo: number = MAX_ITENS_FILTRO,
): string[] {
  return lerListaDaUrl(valor, (item) => UUID.test(item), maximo);
}

/**
 * Lista de um catálogo fechado (status, tipo de centro), na ordem do catálogo.
 *
 * Na ordem do CATÁLOGO, e não na de escolha, porque catálogo curto aparece como
 * um texto pronto no gatilho do filtro ("Aprovado, Pago"), e esse texto mudar de
 * ordem conforme a sequência de cliques faz o mesmo filtro parecer dois.
 */
export function lerCatalogoDaUrl<T extends string>(
  valor: string | string[] | undefined,
  catalogo: readonly T[],
): T[] {
  const escolhidos = new Set(
    lerListaDaUrl(valor, (item) => (catalogo as readonly string[]).includes(item)),
  );
  return catalogo.filter((item) => escolhidos.has(item));
}

/**
 * Escreve a lista de volta no formato da URL, ou `null` para remover o parâmetro
 * (que é o "todos").
 */
export function escreverListaNaUrl(
  itens: string[],
  maximo: number = MAX_ITENS_FILTRO,
): string | null {
  const limitados = itens.slice(0, maximo);
  return limitados.length === 0 ? null : limitados.join(",");
}
