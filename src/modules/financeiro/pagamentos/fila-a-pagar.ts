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
import { dentroDoPeriodo } from "@/modules/_shared/filtros-cliente";
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

/**
 * `null` quando o filtro está em branco, `Set` quando tem escolha.
 *
 * Duas coisas de propósito: o `null` distingue "todos" de "nenhum marcado" (com
 * lista vazia, `has` recusaria tudo e a fila apareceria zerada), e o `Set` faz a
 * busca ser O(1) — com `includes`, cada uma das ~900 parcelas varreria a lista
 * inteira a cada tecla digitada na busca.
 */
function conjunto(itens: readonly string[]): ReadonlySet<string> | null {
  return itens.length === 0 ? null : new Set(itens);
}

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
  const termo = valores.busca.trim().toLowerCase();
  const valorDe = valores.valorDe === "" ? null : Number(valores.valorDe);
  const valorAte = valores.valorAte === "" ? null : Number(valores.valorAte);

  const fornecedoresEscolhidos = conjunto(valores.fornecedorIds);
  const contasEscolhidas = conjunto(valores.contaIds);
  const situacoesEscolhidas = conjunto(valores.situacoes);
  const categoriasEscolhidas = conjunto(valores.categoriaIds);
  const formasEscolhidas = conjunto(valores.formaIds);

  return parcelas.filter((parcela) => {
    if (
      termo !== "" &&
      !`${parcela.lancamentoNumero ?? ""} ${parcela.descricao} ${parcela.fornecedorNome}`
        .toLowerCase()
        .includes(termo)
    ) {
      return false;
    }
    // Lista vazia é "todos": a checagem de conjunto só entra quando há escolha,
    // senão nenhuma parcela passaria com o filtro em branco.
    if (
      fornecedoresEscolhidos !== null &&
      !fornecedoresEscolhidos.has(parcela.fornecedorId ?? "")
    ) {
      return false;
    }
    if (
      contasEscolhidas !== null &&
      !contasEscolhidas.has(parcela.contaBancariaId ?? "")
    ) {
      return false;
    }
    if (
      situacoesEscolhidas !== null &&
      !situacoesEscolhidas.has(parcela.status ?? "aprovado")
    ) {
      return false;
    }
    if (valorDe !== null && parcela.valor < valorDe) return false;
    if (valorAte !== null && parcela.valor > valorAte) return false;
    if (!dentroDoPeriodo(parcela.dataVencimento, valores.vencDe, valores.vencAte)) {
      return false;
    }
    if (!dentroDoPeriodo(parcela.dataProgramada, valores.progDe, valores.progAte)) {
      return false;
    }
    if (
      categoriasEscolhidas !== null &&
      !categoriasEscolhidas.has(parcela.categoriaId ?? "")
    ) {
      return false;
    }
    // O centro casa pela SUBÁRVORE, e contra TODOS os centros do rateio:
    // escolher a manutenção acha a parcela pendurada num equipamento, e um
    // custo dividido entre duas obras aparece filtrando por qualquer uma.
    if (
      subarvore !== null &&
      !(parcela.centroCustoIds ?? []).some((id) => subarvore.has(id))
    ) {
      return false;
    }
    if (
      formasEscolhidas !== null &&
      !formasEscolhidas.has(parcela.formaPagamentoId ?? "")
    ) {
      return false;
    }
    // O campo da tela é yyyy-MM e a coluna é o primeiro dia do mês.
    if (
      valores.mes !== "" &&
      (parcela.mesCompetencia ?? "").slice(0, 7) !== valores.mes
    ) {
      return false;
    }
    if (valores.origem !== "" && parcela.origem !== valores.origem) return false;
    if (
      !dentroDoPeriodo(
        parcela.dataCompra ?? null,
        valores.compraDe,
        valores.compraAte,
      )
    ) {
      return false;
    }
    return true;
  });
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
