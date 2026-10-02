/**
 * Como os filtros do histórico de pagamentos viram consulta.
 *
 * Módulo puro, SEM `server-only`, de propósito: o `queries.ts` não pode ser
 * importado num teste (o `server-only` estoura), e enquanto esta função morava
 * lá a única forma de saber se ela monta o filtro certo era abrir a tela. O
 * erro que isso esconde não grita — um filtro montado na coluna errada devolve
 * lista VAZIA, que na tela é indistinguível de "não há pagamento assim".
 *
 * O filtro de CENTRO DE CUSTO não está aqui: ele precisa ir ao banco expandir a
 * subárvore, e é isso que este módulo não faz. Ele ficou em `queries.ts`.
 */

import { z } from "zod";

import { idSchema } from "@/lib/id";
import { MAX_ITENS_FILTRO } from "@/modules/financeiro/_shared/listas-na-url";
import { ORIGENS_LANCAMENTO } from "@/modules/financeiro/lancamentos/schemas";

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
  gte: (coluna: string, valor: string | number) => T;
  lte: (coluna: string, valor: string | number) => T;
  or: (filtro: string, opcoes?: { referencedTable?: string }) => T;
  /**
   * Necessário para filtrar embed NÃO-inner: `eq` no embed sozinho só esvazia o
   * embed, e a linha do pai continua vindo. O par é `eq` + `not(embed,is,null)`.
   */
  not: (coluna: string, operador: string, valor: null) => T;
  in: (coluna: string, valores: readonly string[]) => T;
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
  if (filtros.formaPagamentoIds && filtros.formaPagamentoIds.length > 0) {
    // A forma é da PARCELA, não do lançamento: um lançamento pode sair por duas
    // formas, e é o bloco (`lancamento_forma_id`) que diz por qual esta parcela
    // saiu. `!inner` no embed é de propósito aqui e SÓ aqui: parcela sem bloco
    // (884 delas, da carga histórica) não tem forma nenhuma, então ela não
    // pertence a nenhum recorte de forma -- some do filtro, como deve.
    consulta = consulta
      .in("lancamento_formas.forma_pagamento_id", filtros.formaPagamentoIds)
      // Sem este `not`, filtrar um embed NÃO-inner só esvazia o embed e a linha
      // continua vindo. É o mesmo par (`eq` no embed + `not is null`) que a
      // listagem de Lançamentos usa para o centro de custo.
      .not("lancamento_formas", "is", null);
  }
  // Fornecedor e busca moram no lançamento. O join já é !inner, então filtrar a
  // tabela embutida filtra as parcelas de verdade (não só o que aparece nela).
  if (filtros.fornecedorIds && filtros.fornecedorIds.length > 0) {
    consulta = consulta.in("lancamentos.fornecedor_id", filtros.fornecedorIds);
  }
  if (filtros.categoriaIds && filtros.categoriaIds.length > 0) {
    consulta = consulta.in("lancamentos.categoria_id", filtros.categoriaIds);
  }
  if (filtros.mesCompetencia) {
    consulta = consulta.eq(
      "lancamentos.mes_competencia",
      filtros.mesCompetencia,
    );
  }
  if (filtros.origem) {
    consulta = consulta.eq("lancamentos.origem", filtros.origem);
  }
  if (filtros.compraDe) {
    consulta = consulta.gte("lancamentos.data_compra", filtros.compraDe);
  }
  if (filtros.compraAte) {
    consulta = consulta.lte("lancamentos.data_compra", filtros.compraAte);
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

/**
 * Põe o recorte de CENTRO DE CUSTO na consulta, com a subárvore já expandida.
 *
 * Quem vai ao banco buscar a subárvore é o `queries.ts` (é uma RPC); o que sobra
 * aqui é o par de chamadas, que é justamente a parte que erra calado. Duas
 * coisas estão sendo defendidas, e nenhuma das duas grita quando quebra:
 *
 * 1. O caminho tem DOIS níveis (`lancamentos.lancamento_rateios`), porque a
 *    consulta parte de `lancamento_parcelas` e o centro mora no rateio do
 *    LANÇAMENTO. É o único filtro desta aba que desce dois níveis: todos os
 *    outros são coluna de um embed de primeiro nível. Caminho errado aqui não
 *    devolve lista errada, devolve HTTP 400.
 * 2. O `not(..., "is", null)` é obrigatório. Filtrar um embed NÃO-inner sozinho
 *    só ESVAZIA o embed: a parcela continua vindo, agora com o rateio em branco.
 *    O par é o mesmo que a listagem de Lançamentos usa, um nível acima.
 *
 * A subárvore chega pronta e vale para raiz e para etapa do mesmo jeito: a aba
 * guarda as duas na mesma lista (os centros efetivos), e escolher a etapa é
 * escolher a subárvore dela.
 */
export function aplicarCentroDaSubarvore<T extends ConsultaFiltravel<T>>(
  consulta: T,
  subarvore: readonly string[],
): T {
  return consulta
    .in("lancamentos.lancamento_rateios.centro_custo_id", subarvore)
    .not("lancamentos.lancamento_rateios", "is", null);
}

// ---------------------------------------------------------------------------
// Validação dos filtros que chegam do cliente
// ---------------------------------------------------------------------------

/** Teto do filtro de valor: o mesmo da coluna NUMERIC(14,2). */
const VALOR_MAXIMO = 999999999999.99;

const valorFiltroSchema = z.number().min(0).max(VALOR_MAXIMO).optional();

/**
 * Lista de ids de um filtro de múltipla escolha.
 *
 * O teto é o mesmo de `listas-na-url` e pelo mesmo motivo: a consulta filtra com
 * `in`, e o PostgREST manda o filtro na URL. Lista grande vira HTTP 400 por
 * tamanho de URL antes de chegar na RLS.
 */
const listaDeIdsSchema = z.array(idSchema).max(MAX_ITENS_FILTRO).optional();

/**
 * Filtros do histórico vindos do cliente. Revalidados na action já tendo sido
 * validados na página: a action é porta de entrada pública, e filtro inválido
 * não pode virar filtro do PostgREST.
 *
 * Mora AQUI, e não dentro do `actions.ts`, por um motivo só: arquivo `"use
 * server"` só exporta função async, então enquanto o schema morava lá ele era
 * inalcançável por teste — e o defeito que isso esconde é o pior de todos nesta
 * tela. `z.object` DESCARTA chave desconhecida em silêncio, então um campo que
 * existe na interface e não existe aqui não levanta erro: a action devolve a
 * página SEM aquele filtro, e a barra e o card continuam dizendo que está
 * filtrando. Foi o que aconteceu entre 22/08 e 01/09/2026 com nove dos catorze
 * filtros da aba: o schema ficou na era do seletor de escolha única
 * (`fornecedorId`, `contaBancariaId`) e nunca acompanhou centro de custo,
 * etapa, categoria, forma, mês, origem e período da compra.
 *
 * Duas travas contra a repetição: `strictObject`, que RECUSA a chave
 * desconhecida em vez de descartá-la, e a checagem de chaves em
 * `filtros-pagas.test.ts`, que quebra o `tsc` no dia em que a interface e este
 * schema discordarem.
 */
export const filtrosPagasSchema = z.strictObject({
  busca: z.string().trim().max(120).optional(),
  fornecedorIds: listaDeIdsSchema,
  contaBancariaIds: listaDeIdsSchema,
  valorDe: valorFiltroSchema,
  valorAte: valorFiltroSchema,
  vencimentoDe: z.iso.date().optional(),
  vencimentoAte: z.iso.date().optional(),
  programadaDe: z.iso.date().optional(),
  programadaAte: z.iso.date().optional(),
  pagamentoDe: z.iso.date().optional(),
  pagamentoAte: z.iso.date().optional(),
  categoriaIds: listaDeIdsSchema,
  formaPagamentoIds: listaDeIdsSchema,
  /**
   * A escada de centro de custo inteira numa lista só: raiz, ou as etapas dela
   * quando alguma foi escolhida (os "centros efetivos" de
   * `_shared/centro-custo/filtro.ts`). A consulta expande a subárvore de cada um
   * antes de filtrar, então a etapa chega aqui como um id qualquer.
   */
  centroCustoIds: listaDeIdsSchema,
  /** yyyy-MM-dd, primeiro dia do mês de referência (é o que a coluna guarda). */
  mesCompetencia: z.iso.date().optional(),
  /** Lista fechada, a mesma do check do banco: origem inventada não filtra. */
  origem: z.enum(ORIGENS_LANCAMENTO).optional(),
  compraDe: z.iso.date().optional(),
  compraAte: z.iso.date().optional(),
});

/** O que sai da validação, para a checagem de chaves contra a interface. */
export type FiltrosPagasValidados = z.infer<typeof filtrosPagasSchema>;

// ---------------------------------------------------------------------------
// Facetas da aba "Pagas" (ver `_shared/filtros-facetados`)
// ---------------------------------------------------------------------------

/** Os filtros de seleção da aba, no id que a barra usa. */
export type FacetaPagas =
  | "fornecedor"
  | "conta"
  | "centro"
  | "etapa"
  | "categoria"
  | "forma"
  | "origem";

/** Embed que chega como objeto ou lista, conforme a inferência do PostgREST. */
type Embed<T> = T | T[] | null;

/** O que a consulta de facetas traz de cada parcela paga. */
export interface LinhaFacetaPagas {
  conta_bancaria_id: string | null;
  lancamento_formas: Embed<{ forma_pagamento_id: string | null }>;
  lancamentos: Embed<{
    fornecedor_id: string | null;
    categoria_id: string | null;
    origem: string | null;
    lancamento_rateios: { centro_custo_id: string | null }[] | null;
  }>;
}

function lista<T>(embed: Embed<T>): T[] {
  if (embed === null) return [];
  return Array.isArray(embed) ? embed : [embed];
}

/**
 * As facetas da aba, com a chave de cada parcela copiada dos filtros de
 * `aplicarFiltrosPagas`. `etapaAtiva`: a lista de centros tem etapa escolhida,
 * o que só dá para saber com o cadastro de centros.
 *
 * O centro devolve o id cru do rateio; a tela sobe cada um até a raiz com o
 * cadastro que já tem.
 */
export function facetasDasPagas(
  filtros: FiltrosParcelasPagas,
  etapaAtiva: boolean,
): Record<
  FacetaPagas,
  {
    ativo: boolean;
    chave: (linha: LinhaFacetaPagas) => (string | null)[] | string | null;
  }
> {
  const doLancamento = (linha: LinhaFacetaPagas) => lista(linha.lancamentos);
  const centros = (linha: LinhaFacetaPagas) =>
    doLancamento(linha).flatMap((lancamento) =>
      (lancamento.lancamento_rateios ?? []).map(
        (rateio) => rateio.centro_custo_id,
      ),
    );
  return {
    fornecedor: {
      ativo: !!filtros.fornecedorIds?.length,
      chave: (linha) => doLancamento(linha).map((l) => l.fornecedor_id),
    },
    conta: {
      ativo: !!filtros.contaBancariaIds?.length,
      chave: (linha) => linha.conta_bancaria_id,
    },
    centro: {
      ativo: !!filtros.centroCustoIds?.length,
      chave: centros,
    },
    etapa: { ativo: etapaAtiva, chave: centros },
    categoria: {
      ativo: !!filtros.categoriaIds?.length,
      chave: (linha) => doLancamento(linha).map((l) => l.categoria_id),
    },
    forma: {
      ativo: !!filtros.formaPagamentoIds?.length,
      chave: (linha) =>
        lista(linha.lancamento_formas).map((forma) => forma.forma_pagamento_id),
    },
    origem: {
      ativo: !!filtros.origem,
      chave: (linha) => doLancamento(linha).map((l) => l.origem),
    },
  };
}

/**
 * Os filtros sem o da faceta, para calcular as opções dela. A etapa troca a
 * lista de centros pelas raízes escolhidas: os equipamentos oferecidos são os
 * do centro marcado no primeiro campo, não os de qualquer centro.
 */
export function filtrosPagasSemFaceta(
  filtros: FiltrosParcelasPagas,
  faceta: FacetaPagas,
  raizesEscolhidas: string[],
): FiltrosParcelasPagas {
  switch (faceta) {
    case "fornecedor":
      return { ...filtros, fornecedorIds: undefined };
    case "conta":
      return { ...filtros, contaBancariaIds: undefined };
    case "centro":
      return { ...filtros, centroCustoIds: undefined };
    case "etapa":
      return { ...filtros, centroCustoIds: raizesEscolhidas };
    case "categoria":
      return { ...filtros, categoriaIds: undefined };
    case "forma":
      return { ...filtros, formaPagamentoIds: undefined };
    case "origem":
      return { ...filtros, origem: undefined };
  }
}
