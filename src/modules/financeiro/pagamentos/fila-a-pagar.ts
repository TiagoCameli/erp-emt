/**
 * O filtro da fila "A pagar", fora do componente.
 *
 * ## Por que saiu de dentro do `useMemo`
 *
 * A fila a pagar vem INTEIRA do servidor (~900 parcelas, sem paginação) e é
 * filtrada em memória no cliente. Enquanto a tela era a única consumidora isso
 * podia morar num `useMemo` do `pagamentos-cliente.tsx`; a exportação para Excel
 * mudou o quadro, porque a planilha tem que sair com EXATAMENTE o recorte que
 * está na tela. Duas cópias do filtro divergiriam na primeira correção feita de
 * um lado só, e o sintoma seria a pior coisa possível num arquivo de dinheiro:
 * planilha e tela com totais diferentes, as duas abrindo sem erro nenhum.
 *
 * Módulo PURO, sem `server-only` e sem React: dá para provar o filtro num teste
 * em vez de abrir a tela. Só importa TIPO de `queries.ts` (import de tipo é
 * apagado na compilação, então o `server-only` de lá não vem junto).
 */

import { z } from "zod";

import { idSchema } from "@/lib/id";
// De `filtros-predicados`, e NÃO de `filtros-cliente`: aquele é `"use client"`
// por causa de um hook que mora nele, e Next transforma cada export de módulo
// cliente numa REFERÊNCIA. Chamar a referência aqui funciona na tela e estoura
// na Server Action da planilha, que é este mesmo arquivo rodando no servidor.
import { dentroDoPeriodo } from "@/modules/_shared/filtros-predicados";
import {
  filtrarFacetado,
  selecao,
  type ResultadoFacetado,
} from "@/modules/_shared/filtros-facetados";
import { STATUS_PARCELA_ABERTA } from "@/modules/financeiro/_shared/formato";
import { MAX_ITENS_FILTRO } from "@/modules/financeiro/_shared/listas-na-url";
import { ORIGENS_LANCAMENTO } from "@/modules/financeiro/lancamentos/schemas";
import type { ParcelaAprovada } from "@/modules/financeiro/pagamentos/queries";

/** Os campos dos filtros da fila "A pagar", como a tela os escreve. */
export interface ValoresFiltrosAPagar {
  busca: string;
  /**
   * Situações da parcela na fila: lista VAZIA é "todas as situações em aberto".
   *
   * Existe porque a fila passou a mostrar pendente e em revisão junto com
   * aprovada, e porque é ele que faz o cartão "Vence em até 7 dias" do Painel
   * cair numa lista que soma exatamente o número do cartão (só aprovadas).
   *
   * Lista, e não valor único, porque "o que já posso pagar" costuma ser mais de
   * uma situação ao mesmo tempo.
   */
  situacoes: string[];
  fornecedorIds: string[];
  contaIds: string[];
  valorDe: string;
  valorAte: string;
  vencDe: string;
  vencAte: string;
  /** Período da data programada (data autorizada do pagamento). */
  progDe: string;
  progAte: string;
  /**
   * Dimensões do LANÇAMENTO por trás da parcela. Existem porque a tela de
   * Pagamentos tinha 7 filtros contra os 16 de Lançamentos, e quem paga faz as
   * mesmas perguntas de quem lança: de que obra é, que tipo de custo é, por qual
   * forma sai.
   */
  categoriaIds: string[];
  /**
   * Centros de custo escolhidos. O filtro pega a SUBÁRVORE de cada um (obra traz
   * as etapas, manutenção traz cada equipamento) e a UNIÃO dos conjuntos: marcar
   * duas obras é "quero as duas".
   */
  centroIds: string[];
  formaIds: string[];
  /** Mês de referência no formato do campo da tela: yyyy-MM. */
  mes: string;
  origem: string;
  /** Período da data da compra (o fato, não o vencimento). */
  compraDe: string;
  compraAte: string;
}

/**
 * Nenhum filtro ligado.
 *
 * Serve de base nos testes e de ponto único da lista de campos: a checagem de
 * chaves do teste compara as chaves DESTE objeto com as do schema, então um
 * campo novo que esqueça de passar por aqui quebra a suíte em vez de sumir da
 * planilha em silêncio.
 */
export const VALORES_FILTROS_A_PAGAR_VAZIOS: ValoresFiltrosAPagar = {
  busca: "",
  situacoes: [],
  fornecedorIds: [],
  contaIds: [],
  valorDe: "",
  valorAte: "",
  vencDe: "",
  vencAte: "",
  progDe: "",
  progAte: "",
  categoriaIds: [],
  centroIds: [],
  formaIds: [],
  mes: "",
  origem: "",
  compraDe: "",
  compraAte: "",
};

/** Os filtros de seleção da fila "A pagar", vistos pela faceta. */
export type FacetaAPagar =
  | "situacao"
  | "fornecedor"
  | "conta"
  | "categoria"
  | "centro"
  | "forma"
  | "origem";

/**
 * As parcelas da fila que passam pelos filtros da aba "A pagar".
 *
 * `subarvore` é o conjunto de centros que o filtro de centro de custo abriu
 * (`subarvoreDeCentros`), ou `null` quando não há filtro de centro — assim o
 * laço nem entra no teste de centro. Quem chama resolve a subárvore uma vez, e
 * não uma por linha.
 *
 * A BUSCA vem em `valores.busca`. Na tela ela chega com espera (o campo é
 * digitado), então o componente passa o termo que está valendo naquele
 * instante; a planilha passa o mesmo, e as duas veem a mesma lista.
 */
export function filtrarFilaAPagar(
  parcelas: readonly ParcelaAprovada[],
  valores: ValoresFiltrosAPagar,
  subarvore: ReadonlySet<string> | null,
): ParcelaAprovada[] {
  return facetarFilaAPagar(parcelas, valores, subarvore).linhas;
}

/**
 * O mesmo filtro de `filtrarFilaAPagar`, devolvendo também as opções FACETADAS
 * de cada seletor (ver `_shared/filtros-facetados`): cada um só oferece o que
 * existe na fila filtrada pelos outros. Busca, valor, datas e mês entram livres.
 *
 * `subarvoreDe` abre a subárvore de UMA opção de centro (raiz ou etapa), para
 * saber se ela ainda tem parcela; só a tela precisa, a planilha não pede opção.
 */
export function facetarFilaAPagar(
  parcelas: readonly ParcelaAprovada[],
  valores: ValoresFiltrosAPagar,
  subarvore: ReadonlySet<string> | null,
  subarvoreDe: (centroId: string) => ReadonlySet<string> = (id) => new Set([id]),
): ResultadoFacetado<ParcelaAprovada, FacetaAPagar> {
  const termo = valores.busca.trim().toLowerCase();
  const valorDe = valores.valorDe === "" ? null : Number(valores.valorDe);
  const valorAte = valores.valorAte === "" ? null : Number(valores.valorAte);
  const centrosEscolhidos = new Set(valores.centroIds);

  // O centro casa pela SUBÁRVORE, e contra TODOS os centros do rateio:
  // escolher a manutenção acha a parcela pendurada num equipamento, e um custo
  // dividido entre duas obras aparece filtrando por qualquer uma.
  const tocaSubarvore = (parcela: ParcelaAprovada, dentro: ReadonlySet<string>) =>
    (parcela.centroCustoIds ?? []).some((id) => dentro.has(id));

  // Lista vazia é "todos" (a faceta só testa quando há escolha). As chaves
  // trocam `null` por "" como antes: nenhuma opção tem valor vazio.
  return filtrarFacetado<ParcelaAprovada, FacetaAPagar>(
    parcelas,
    {
      situacao: {
        selecionados: valores.situacoes,
        chave: (parcela) => parcela.status ?? "aprovado",
      },
      fornecedor: {
        selecionados: valores.fornecedorIds,
        chave: (parcela) => parcela.fornecedorId ?? "",
      },
      conta: {
        selecionados: valores.contaIds,
        chave: (parcela) => parcela.contaBancariaId ?? "",
      },
      categoria: {
        selecionados: valores.categoriaIds,
        chave: (parcela) => parcela.categoriaId ?? "",
      },
      // Quem manda no filtro de centro é a `subarvore` já resolvida: sem ela
      // não há filtro, com ela o teste é contra a união toda. "" só marca a
      // faceta como ligada quando alguém passa subárvore sem `centroIds`.
      centro: {
        selecionados:
          subarvore === null
            ? []
            : valores.centroIds.length > 0
              ? valores.centroIds
              : [""],
        casa: (parcela, valor) =>
          centrosEscolhidos.has(valor) || valor === ""
            ? subarvore !== null && tocaSubarvore(parcela, subarvore)
            : tocaSubarvore(parcela, subarvoreDe(valor)),
      },
      forma: {
        selecionados: valores.formaIds,
        chave: (parcela) => parcela.formaPagamentoId ?? "",
      },
      origem: {
        selecionados: selecao(valores.origem),
        chave: (parcela) => parcela.origem,
      },
    },
    [
      (parcela) =>
        termo === "" ||
        `${parcela.lancamentoNumero ?? ""} ${parcela.descricao} ${parcela.fornecedorNome}`
          .toLowerCase()
          .includes(termo),
      (parcela) => {
        if (valorDe !== null && parcela.valor < valorDe) return false;
        if (valorAte !== null && parcela.valor > valorAte) return false;
        return (
          dentroDoPeriodo(parcela.dataVencimento, valores.vencDe, valores.vencAte) &&
          dentroDoPeriodo(parcela.dataProgramada, valores.progDe, valores.progAte)
        );
      },
      // O campo da tela é yyyy-MM e a coluna é o primeiro dia do mês.
      (parcela) =>
        valores.mes === "" ||
        (parcela.mesCompetencia ?? "").slice(0, 7) === valores.mes,
      (parcela) =>
        dentroDoPeriodo(parcela.dataCompra ?? null, valores.compraDe, valores.compraAte),
    ],
  );
}

/** Teto do filtro de valor: o mesmo da coluna NUMERIC(14,2). */
const VALOR_MAXIMO = 999999999999.99;

/**
 * Faixa de valor como a tela escreve: texto do campo, vazio quando sem limite.
 * Número inválido digitado na URL vira recusa, e não filtro `NaN` — que
 * descartaria a fila inteira em silêncio.
 */
const valorTextoSchema = z
  .string()
  .max(20)
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

/**
 * Lista de ids de um filtro de múltipla escolha. O teto é o de `listas-na-url`,
 * o mesmo que a barra de filtros da tela respeita.
 */
const listaDeIdsSchema = z.array(idSchema).max(MAX_ITENS_FILTRO);

/**
 * Os valores da fila "A pagar" vindos do cliente, revalidados na action.
 *
 * Mora AQUI, e não dentro do `actions.ts`, pelo mesmo motivo do
 * `filtrosPagasSchema`: arquivo `"use server"` só exporta função async, então
 * schema morando lá é inalcançável por teste — e foi assim que a aba "Pagas"
 * ficou dez dias sem nove dos seus filtros, com a action descartando cada um em
 * silêncio e a barra da tela dizendo que estava filtrando.
 *
 * Duas travas contra a repetição: `strictObject`, que RECUSA chave desconhecida
 * em vez de descartá-la, e a checagem de chaves em `fila-a-pagar.test.ts`, que
 * quebra a suíte no dia em que a interface e este schema discordarem.
 */
export const valoresFiltrosAPagarSchema = z.strictObject({
  busca: z.string().max(120),
  /**
   * Lista fechada: só situação de parcela EM ABERTO existe nesta fila.
   *
   * `refine` e não `z.enum` porque `STATUS_PARCELA_ABERTA` é DERIVADO da lista
   * completa de status (a regra verdadeira é "não pago e não cancelado"), então
   * é um array e não uma tupla literal. Ler dele mantém a trava viva: status
   * novo entra sozinho, sem ninguém lembrar de repetir a lista aqui.
   */
  situacoes: z.array(
    z
      .string()
      .refine((status) => (STATUS_PARCELA_ABERTA as string[]).includes(status)),
  ),
  fornecedorIds: listaDeIdsSchema,
  contaIds: listaDeIdsSchema,
  valorDe: valorTextoSchema,
  valorAte: valorTextoSchema,
  vencDe: dataTextoSchema,
  vencAte: dataTextoSchema,
  progDe: dataTextoSchema,
  progAte: dataTextoSchema,
  categoriaIds: listaDeIdsSchema,
  centroIds: listaDeIdsSchema,
  formaIds: listaDeIdsSchema,
  /** yyyy-MM, o formato do campo da tela (a coluna guarda o primeiro dia). */
  mes: z.union([z.literal(""), z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)]),
  /** Lista fechada, a mesma do check do banco: origem inventada não filtra. */
  origem: z.union([z.literal(""), z.enum(ORIGENS_LANCAMENTO)]),
  compraDe: dataTextoSchema,
  compraAte: dataTextoSchema,
});
