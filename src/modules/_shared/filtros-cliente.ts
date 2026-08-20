"use client";

/**
 * Apoio dos filtros das listagens do Financeiro que carregam a lista inteira e
 * filtram em memória (sem paginação server-side).
 *
 * Duas coisas: os predicados de faixa (valor e data), para toda tela responder
 * "quanto custou?" e "em que período?" do mesmo jeito, e a paginação controlada
 * que volta para a primeira página quando um filtro muda.
 */

import * as React from "react";
import type { PaginationState } from "@tanstack/react-table";

import { mesParaCompetencia } from "@/lib/formatadores";

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

/**
 * Valor dentro da faixa escolhida. Ponta vazia (ou não numérica) significa sem
 * limite naquele lado, igual ao FiltroValor canônico.
 */
export function dentroDaFaixaValor(
  valor: number,
  de: string,
  ate: string,
): boolean {
  const minimo = Number(de);
  const maximo = Number(ate);
  if (de.trim() !== "" && Number.isFinite(minimo) && valor < minimo) {
    return false;
  }
  if (ate.trim() !== "" && Number.isFinite(maximo) && valor > maximo) {
    return false;
  }
  return true;
}

/**
 * Data "YYYY-MM-DD" dentro do período escolhido. Ponta vazia significa sem
 * limite naquele lado.
 *
 * Registro sem data fica de fora quando alguma ponta está preenchida: dizer que
 * ele cabe no período pedido seria mentira.
 */
export function dentroDoPeriodo(
  data: string | null,
  de: string,
  ate: string,
): boolean {
  const inicio = de.trim();
  const fim = ate.trim();
  if (inicio === "" && fim === "") return true;
  if (!data) return false;
  if (inicio !== "" && data < inicio) return false;
  if (fim !== "" && data > fim) return false;
  return true;
}

/**
 * Mês de referência do registro (yyyy-MM-01, como o banco guarda) igual ao mês
 * escolhido no FiltroMes (yyyy-MM). Mês vazio significa todos os meses.
 */
export function mesmoMesReferencia(
  competencia: string | null,
  mes: string,
): boolean {
  if (mes.trim() === "") return true;
  return competencia !== null && competencia === mesParaCompetencia(mes);
}

/**
 * Opções de select montadas a partir dos próprios dados da tela, em ordem
 * alfabética pt-BR. Filtro que oferece opção sem nenhuma linha só devolve lista
 * vazia, então as opções saem do que está na tela, não do cadastro inteiro.
 */
export function opcoesDeNomes(nomes: (string | null)[]) {
  const unicos = new Set<string>();
  for (const nome of nomes) {
    if (nome !== null && nome.trim() !== "") unicos.add(nome);
  }
  return [...unicos]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((nome) => ({ valor: nome, rotulo: nome }));
}
