/**
 * Contrato da URL do extrato por fornecedor: quais fornecedores estão escolhidos.
 *
 * Vive num módulo próprio e puro porque a página lê e o seletor escreve o mesmo
 * parâmetro, e porque tem duas regras que não podem ficar espalhadas: o formato
 * (ids separados por vírgula) e o teto de quantos cabem.
 *
 * O formato em si mora em `listas-na-url.ts`, que o relatório de custo por centro
 * de custo também usa: duas leituras do mesmo formato divergem na primeira regra
 * que alguém acrescenta de um lado só.
 */

import {
  escreverListaNaUrl,
  lerUuidsDaUrl,
  MAX_ITENS_FILTRO,
} from "@/modules/financeiro/_shared/listas-na-url";

/**
 * Teto de fornecedores no extrato.
 *
 * Não é gosto: a consulta filtra com `in`, e o PostgREST manda o filtro na URL.
 * Uuid ocupa 37 caracteres ali, então lista grande vira HTTP 400 por tamanho de
 * URL **antes** de chegar na RLS (já aconteceu neste projeto com mil ids).
 * Cinquenta fornecedores no mesmo extrato é muito além de qualquer uso real, e
 * dá 1,85 KB de filtro, bem dentro do seguro.
 */
export const MAX_FORNECEDORES = MAX_ITENS_FILTRO;

/** Parâmetro da URL que carrega a escolha. */
export const PARAM_FORNECEDOR = "fornecedor";

/**
 * Lê a lista de fornecedores da URL.
 *
 * Aceita ids separados por vírgula (`?fornecedor=id1,id2`) e também a chave
 * repetida (`?fornecedor=id1&fornecedor=id2`), que é como um formulário mandaria.
 * Descarta o que não é uuid, deduplica preservando a ordem de escolha e corta no
 * teto.
 */
export function lerFornecedoresDaUrl(
  valor: string | string[] | undefined,
): string[] {
  return lerUuidsDaUrl(valor, MAX_FORNECEDORES);
}

/**
 * Escreve a lista de volta no formato da URL, ou `null` para remover o parâmetro
 * (que é o "todos os fornecedores").
 */
export function escreverFornecedoresNaUrl(ids: string[]): string | null {
  return escreverListaNaUrl(ids, MAX_FORNECEDORES);
}
