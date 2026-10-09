/**
 * Filtro da aba "A receber", em memória.
 *
 * A aba traz a fila inteira do servidor (os cards do topo somam o conjunto todo),
 * então os filtros dela rodam aqui. Módulo puro, sem React, para ter teste: filtro
 * que erra devolve lista vazia, e na tela isso é indistinguível de "não há nada a
 * receber assim".
 *
 * Espelha `pagamentos/fila-a-pagar.ts`: o centro casa pela SUBÁRVORE e contra
 * TODOS os centros do rateio, o mês compara o yyyy-MM do campo com o primeiro dia
 * guardado na coluna.
 */

import {
  filtrarFacetado,
  selecao,
  type ResultadoFacetado,
} from "@/modules/_shared/filtros-facetados";
import type { ParcelaAReceber } from "@/modules/financeiro/recebimentos/queries";

/** Valores dos filtros da aba "A receber", como vivem na URL. */
export interface ValoresFiltrosAReceber {
  busca: string;
  cliente: string;
  conta: string;
  categoria: string;
  /** Centros efetivos (raízes ou etapas), como em Pagamentos. Vazio = todos. */
  centroIds: string[];
  /** yyyy-MM, ou "". */
  mes: string;
  /** Status da parcela em aberto (pendente, em_revisao, aprovado), ou "". */
  status: string;
  valorDe: string;
  valorAte: string;
  vencDe: string;
  vencAte: string;
}

export const VALORES_FILTROS_A_RECEBER_VAZIOS: ValoresFiltrosAReceber = {
  busca: "",
  cliente: "",
  conta: "",
  categoria: "",
  centroIds: [],
  mes: "",
  status: "",
  valorDe: "",
  valorAte: "",
  vencDe: "",
  vencAte: "",
};

/** Os filtros de seleção da aba, no id da barra. */
export type FacetaAReceber =
  | "cliente"
  | "conta"
  | "categoria"
  | "centro"
  | "status";

/**
 * Data (YYYY-MM-DD, comparável como texto) dentro do período. Ponta vazia é sem
 * limite naquele lado. Parcela sem a data fica fora de qualquer período: ela não
 * tem data para comparar, e tratá-la como "dentro" mostraria linha que o filtro
 * não pediu.
 */
export function dentroDoPeriodo(
  data: string | null,
  de: string,
  ate: string,
): boolean {
  if (de === "" && ate === "") return true;
  if (!data) return false;
  if (de !== "" && data < de) return false;
  if (ate !== "" && data > ate) return false;
  return true;
}

/**
 * A fila filtrada e as opções FACETADAS de cada seletor (cada um só oferece o
 * que existe na fila filtrada pelos outros).
 *
 * `subarvore` é a união das subárvores dos centros escolhidos, ou `null` sem
 * filtro de centro. `subarvoreDe` abre a subárvore de UMA opção, para a faceta
 * saber se ela ainda tem parcela.
 */
export function facetarFilaAReceber(
  parcelas: readonly ParcelaAReceber[],
  valores: ValoresFiltrosAReceber,
  subarvore: ReadonlySet<string> | null,
  subarvoreDe: (centroId: string) => ReadonlySet<string> = (id) =>
    new Set([id]),
): ResultadoFacetado<ParcelaAReceber, FacetaAReceber> {
  const termo = valores.busca.trim().toLowerCase();
  const valorDe = valores.valorDe === "" ? null : Number(valores.valorDe);
  const valorAte = valores.valorAte === "" ? null : Number(valores.valorAte);
  const centrosEscolhidos = new Set(valores.centroIds);

  const tocaSubarvore = (
    parcela: ParcelaAReceber,
    dentro: ReadonlySet<string>,
  ) => parcela.centroCustoIds.some((id) => dentro.has(id));

  return filtrarFacetado<ParcelaAReceber, FacetaAReceber>(
    parcelas,
    {
      cliente: {
        selecionados: selecao(valores.cliente),
        chave: (parcela) => parcela.clienteId,
      },
      conta: {
        selecionados: selecao(valores.conta),
        chave: (parcela) => parcela.contaBancariaId,
      },
      categoria: {
        selecionados: selecao(valores.categoria),
        chave: (parcela) => parcela.categoriaId,
      },
      // Mesmo desenho de `facetarFilaAPagar`: quem manda é a subárvore já
      // resolvida; as opções testam a própria subárvore.
      centro: {
        selecionados: subarvore === null ? [] : valores.centroIds,
        casa: (parcela, valor) =>
          centrosEscolhidos.has(valor)
            ? subarvore !== null && tocaSubarvore(parcela, subarvore)
            : tocaSubarvore(parcela, subarvoreDe(valor)),
      },
      status: {
        selecionados: selecao(valores.status),
        chave: (parcela) => parcela.status,
      },
    },
    [
      (parcela) =>
        termo === "" ||
        `${parcela.lancamentoNumero ?? ""} ${parcela.numeroDocumento ?? ""} ${parcela.descricao} ${parcela.clienteNome}`
          .toLowerCase()
          .includes(termo),
      (parcela) => {
        if (valorDe !== null && parcela.valor < valorDe) return false;
        if (valorAte !== null && parcela.valor > valorAte) return false;
        return dentroDoPeriodo(
          parcela.dataVencimento,
          valores.vencDe,
          valores.vencAte,
        );
      },
      // O campo da tela é yyyy-MM e a coluna é o primeiro dia do mês.
      (parcela) =>
        valores.mes === "" ||
        (parcela.mesCompetencia ?? "").slice(0, 7) === valores.mes,
    ],
  );
}
