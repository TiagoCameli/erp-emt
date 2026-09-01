"use client";

/**
 * Apoio dos filtros das listagens do Financeiro que carregam a lista inteira e
 * filtram em memória (sem paginação server-side).
 *
 * A paginação controlada mora aqui porque é um hook. Os PREDICADOS (faixa de
 * valor, período, mês, opções) foram para `filtros-predicados.ts`, sem
 * diretiva, e são reexportados daqui para os componentes não mudarem de porta.
 *
 * A separação não é arrumação: `"use client"` faz Next transformar cada export
 * do módulo numa REFERÊNCIA, e chamar a referência no servidor estoura em
 * runtime. Os predicados são compartilhados com Server Actions (o filtro da fila
 * a pagar serve a tela e a planilha), então eles não podem viver atrás desta
 * diretiva. Ver `servidor-nao-chama-cliente.test.ts`, que guarda isso.
 */

import * as React from "react";
import type { PaginationState } from "@tanstack/react-table";

export {
  dentroDaFaixaValor,
  dentroDoPeriodo,
  mesmoMesReferencia,
  opcoesDeNomes,
} from "@/modules/_shared/filtros-predicados";

/** Tamanho de página inicial, igual ao padrão do DataTable canônico. */
const TAMANHO_PAGINA_PADRAO = 25;

/**
 * Paginação controlada de uma listagem filtrada em memória.
 *
 * Existe por um motivo só: trocar filtro tem que voltar para a primeira página.
 * Quem está na página 3 e filtra veria a tabela vazia e concluiria que não
 * existe resultado, quando o resultado está na página 1.
 */
export function usePaginacaoCliente(tamanhoInicial = TAMANHO_PAGINA_PADRAO) {
  const [paginacao, setPaginacao] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: tamanhoInicial,
  });

  const zerarPagina = React.useCallback(() => {
    setPaginacao((atual) => ({ ...atual, pageIndex: 0 }));
  }, []);

  return { paginacao, setPaginacao, zerarPagina };
}
