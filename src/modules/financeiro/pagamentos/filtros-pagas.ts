/**
 * Como os filtros do histórico de pagamentos viram consulta.
 *
 * Módulo puro, SEM `server-only`, de propósito: o `queries.ts` não pode ser
 * importado num teste (o `server-only` estoura), e enquanto esta função morava
 * lá a única forma de saber se ela monta o filtro certo era abrir a tela. O
 * erro que isso esconde não grita — um filtro montado na coluna errada devolve
 * lista VAZIA, que na tela é indistinguível de "não há pagamento assim".
 */

import type { FiltrosParcelasPagas } from "@/modules/financeiro/pagamentos/queries";

/**
 * Padrão ilike (%termo%) do termo de busca. Remove os caracteres que quebram a
 * sintaxe do or() do PostgREST (vírgula, parênteses, aspas, barra).
 */
export function padraoBusca(termo: string): string {
  return `%${termo.replace(/[,()"'\\]/g, "").trim()}%`;
}

/** O pedaço do builder do PostgREST que este módulo usa. */
export interface ConsultaFiltravel<T> {
  eq: (coluna: string, valor: string) => T;
  in: (coluna: string, valores: readonly string[]) => T;
  gte: (coluna: string, valor: string | number) => T;
  lte: (coluna: string, valor: string | number) => T;
  or: (filtro: string, opcoes?: { referencedTable?: string }) => T;
}

/**
 * Aplica os filtros do histórico de pagas na consulta recebida.
 *
 * SÍNCRONA de propósito, com os ids de fornecedor já resolvidos por quem chama.
 * O builder do PostgREST é "thenable": uma função `async` que devolvesse o
 * builder o AWAITARIA no return — ou seja, dispararia a consulta ali dentro e
 * devolveria a resposta no lugar do builder. Foi o que aconteceu na primeira
 * versão disto.
 */
export function aplicarFiltrosPagas<T extends ConsultaFiltravel<T>>(
  consultaInicial: T,
  filtros: FiltrosParcelasPagas,
  idsFornecedoresDaBusca: string[],
): T {
  let consulta = consultaInicial;

  if (filtros.contaBancariaIds && filtros.contaBancariaIds.length > 0) {
    consulta = consulta.in("conta_bancaria_id", filtros.contaBancariaIds);
  }
  if (filtros.valorDe !== undefined) {
    consulta = consulta.gte("valor", filtros.valorDe);
  }
  if (filtros.valorAte !== undefined) {
    consulta = consulta.lte("valor", filtros.valorAte);
  }
  if (filtros.vencimentoDe) {
    consulta = consulta.gte("data_vencimento", filtros.vencimentoDe);
  }
  if (filtros.vencimentoAte) {
    consulta = consulta.lte("data_vencimento", filtros.vencimentoAte);
  }
  if (filtros.programadaDe) {
    consulta = consulta.gte("data_programada", filtros.programadaDe);
  }
  if (filtros.programadaAte) {
    consulta = consulta.lte("data_programada", filtros.programadaAte);
  }
  if (filtros.pagamentoDe) {
    consulta = consulta.gte("data_pagamento", filtros.pagamentoDe);
  }
  if (filtros.pagamentoAte) {
    consulta = consulta.lte("data_pagamento", filtros.pagamentoAte);
  }
  // Fornecedor e busca moram no lançamento. O join já é !inner, então filtrar a
  // tabela embutida filtra as parcelas de verdade (não só o que aparece nela).
  if (filtros.fornecedorIds && filtros.fornecedorIds.length > 0) {
    consulta = consulta.in("lancamentos.fornecedor_id", filtros.fornecedorIds);
  }
  const termo = filtros.busca?.trim() ?? "";
  if (termo !== "") {
    const padrao = padraoBusca(termo);
    const partes = [`numero.ilike.${padrao}`, `descricao.ilike.${padrao}`];
    if (idsFornecedoresDaBusca.length > 0) {
      partes.push(`fornecedor_id.in.(${idsFornecedoresDaBusca.join(",")})`);
    }
    consulta = consulta.or(partes.join(","), {
      referencedTable: "lancamentos",
    });
  }

  return consulta;
}
