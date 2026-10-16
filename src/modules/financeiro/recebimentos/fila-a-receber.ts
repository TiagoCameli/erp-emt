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

import { z } from "zod";

import {
  filtrarFacetado,
  selecao,
  type ResultadoFacetado,
} from "@/modules/_shared/filtros-facetados";
import { casaBusca, textoPesquisavel } from "@/lib/busca";
import { idSchema } from "@/lib/id";
import { STATUS_PARCELA_ABERTA } from "@/modules/financeiro/_shared/formato";
import { MAX_ITENS_FILTRO } from "@/modules/financeiro/_shared/listas-na-url";
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

/** Teto do filtro de valor: o mesmo da coluna NUMERIC(14,2). */
const VALOR_MAXIMO = 999999999999.99;

/** Valor em texto como o campo o escreve, ou vazio. */
const valorTextoSchema = z
  .string()
  .refine(
    (texto) =>
      texto === "" ||
      (Number.isFinite(Number(texto)) &&
        Number(texto) >= 0 &&
        Number(texto) <= VALOR_MAXIMO),
    "valor fora da faixa",
  );

/** Data yyyy-MM-dd, ou vazio para "sem limite deste lado". */
const dataTextoSchema = z.union([z.literal(""), z.iso.date()]);

/** Id de um seletor de escolha única, ou vazio para "todos". */
const idOuVazioSchema = z.union([z.literal(""), idSchema]);

/**
 * Os valores da fila "A receber" vindos do cliente, revalidados na action de
 * exportar. Mesmo desenho de `valoresFiltrosAPagarSchema`: `strictObject`
 * RECUSA chave desconhecida em vez de descartá-la, e o teste confere que o
 * schema e a interface têm as mesmas chaves — filtro que a action descarta
 * calada vira planilha com a base inteira e cara de recorte.
 */
export const valoresFiltrosAReceberSchema = z.strictObject({
  busca: z.string().max(120),
  cliente: idOuVazioSchema,
  conta: idOuVazioSchema,
  categoria: idOuVazioSchema,
  centroIds: z.array(idSchema).max(MAX_ITENS_FILTRO),
  mes: z.union([z.literal(""), z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)]),
  status: z.union([
    z.literal(""),
    z
      .string()
      .refine((status) => (STATUS_PARCELA_ABERTA as string[]).includes(status)),
  ]),
  valorDe: valorTextoSchema,
  valorAte: valorTextoSchema,
  vencDe: dataTextoSchema,
  vencAte: dataTextoSchema,
});

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
      // Busca universal (src/lib/busca.ts): tudo o que a parcela carrega.
      (parcela) =>
        casaBusca(
          textoPesquisavel(
            parcela.lancamentoNumero,
            parcela.numeroDocumento,
            parcela.descricao,
            parcela.clienteNome,
            parcela.categoriaNome,
            parcela.contaBancariaNome,
            parcela.centroCustoNomes,
            parcela.centroCustoRotulo,
            { valor: parcela.valor },
            { data: parcela.dataVencimento },
            { mes: parcela.mesCompetencia },
          ),
          valores.busca,
        ),
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
