import { mesParaCompetencia } from "@/lib/formatadores";
import type { ListarLancamentosParams } from "@/modules/financeiro/lancamentos/queries";
import {
  FILTROS_REVISAO,
  ORIGENS_LANCAMENTO,
} from "@/modules/financeiro/lancamentos/schemas";
import type {
  StatusLancamento,
  TipoLancamento,
} from "@/modules/financeiro/_shared/formato";

/**
 * Contrato da URL da listagem de lançamentos: o que cada parâmetro significa,
 * como é validado e o que a barra de filtros mostra de volta.
 *
 * Mora aqui, e não dentro da página, porque a exportação para Excel precisa ler
 * EXATAMENTE os mesmos filtros que a lista está mostrando. Duas leituras da URL
 * divergem no primeiro filtro que alguém acrescenta de um lado só, e aí a
 * planilha sai com um conjunto diferente do que está na tela — o pior defeito
 * possível num relatório de dinheiro. É o mesmo motivo pelo qual
 * `listarIdsLancamentosFiltrados` reusa `listarLancamentos` em vez de montar uma
 * segunda consulta.
 *
 * Módulo puro: nada de banco e nada de React, então é testável direto.
 */

/** searchParams do App Router, do jeito que chegam na página. */
export type ParametrosUrl = Record<string, string | string[] | undefined>;

/** Filtros do banco, sem paginação (quem pagina decide o tamanho). */
export type FiltrosLancamentos = Omit<
  ListarLancamentosParams,
  "pagina" | "tamanho"
>;

/**
 * Valores atuais dos filtros, do jeito que vivem na URL (string vazia = sem
 * filtro). Um objeto só em vez de vinte props soltas: a listagem tem muito
 * filtro, e assim a assinatura da tabela não vira uma lista de vinte strings
 * iguais.
 */
export interface ValoresFiltrosLancamentos {
  busca: string;
  tipo: string;
  status: string;
  /** Mês de referência, no formato do input (yyyy-MM). */
  mes: string;
  /** Estado da revisão (em_revisao, sem_conta, parcial, revisado). */
  revisao: string;
  origem: string;
  fornecedor: string;
  categoria: string;
  centro: string;
  conta: string;
  forma: string;
  valorDe: string;
  valorAte: string;
  vencDe: string;
  vencAte: string;
  compraDe: string;
  compraAte: string;
  criadoDe: string;
  criadoAte: string;
}

/** Leitura completa da URL: o que vai ao banco e o que volta para a tela. */
export interface LeituraFiltrosLancamentos {
  filtros: FiltrosLancamentos;
  /**
   * Só o que passou na validação chega na tela: filtro inválido na URL não pode
   * aparecer preenchido na barra como se estivesse valendo.
   */
  valores: ValoresFiltrosLancamentos;
  /** Página em base 0, como o banco espera (a URL conta a partir de 1). */
  pagina: number;
  tamanho: number;
}

const TIPOS_VALIDOS: TipoLancamento[] = ["a_pagar", "a_receber"];
const STATUS_VALIDOS: StatusLancamento[] = [
  "previsto",
  "a_pagar",
  "aprovado",
  "pago",
  "cancelado",
];
export const TAMANHO_PADRAO = 25;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Teto do filtro de valor: o mesmo da coluna NUMERIC(14,2). */
const VALOR_MAXIMO = 999999999999.99;

/** Lê e valida um parâmetro de filtro contra a lista de valores aceitos. */
function parametroValido<T extends string>(
  valor: string | string[] | undefined,
  validos: readonly T[],
): T | undefined {
  if (typeof valor !== "string") return undefined;
  return (validos as readonly string[]).includes(valor)
    ? (valor as T)
    : undefined;
}

/** Uuid vindo da URL, ou undefined. Evita mandar lixo pro filtro do PostgREST. */
function parametroUuid(
  valor: string | string[] | undefined,
): string | undefined {
  return typeof valor === "string" && UUID.test(valor) ? valor : undefined;
}

/** Data yyyy-MM-dd vinda da URL, ou undefined se não for uma data. */
function parametroData(
  valor: string | string[] | undefined,
): string | undefined {
  if (typeof valor !== "string" || !DATA_ISO.test(valor)) return undefined;
  return Number.isNaN(new Date(valor).getTime()) ? undefined : valor;
}

/** Valor monetário vindo da URL (não negativo, dentro da coluna do banco). */
function parametroValor(
  valor: string | string[] | undefined,
): number | undefined {
  if (typeof valor !== "string" || valor.trim() === "") return undefined;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > VALOR_MAXIMO) {
    return undefined;
  }
  return numero;
}

/**
 * Período com as duas pontas na ordem certa. Período invertido (de > ate) é
 * trocado de lado, senão a lista vem vazia sem explicação nenhuma.
 */
function periodo(
  inicio: string | string[] | undefined,
  fim: string | string[] | undefined,
): { de?: string; ate?: string } {
  let de = parametroData(inicio);
  let ate = parametroData(fim);
  if (de && ate && de > ate) [de, ate] = [ate, de];
  return { de, ate };
}

/** Faixa de valor com as pontas na ordem certa, pelo mesmo motivo do período. */
function faixaValor(
  inicio: string | string[] | undefined,
  fim: string | string[] | undefined,
): { de?: number; ate?: number } {
  let de = parametroValor(inicio);
  let ate = parametroValor(fim);
  if (de !== undefined && ate !== undefined && de > ate) [de, ate] = [ate, de];
  return { de, ate };
}

/** Texto do filtro para a tela, só quando o parâmetro passou na validação. */
function texto(valor: string | number | undefined): string {
  return valor === undefined ? "" : String(valor);
}

/**
 * Reconstrói os `searchParams` a partir de uma query string.
 *
 * Existe para a Server Action de exportação enxergar a URL do mesmo jeito que a
 * página enxerga, chave repetida incluída: `?tipo=a&tipo=b` chega na página como
 * array (e cai fora na validação), e aqui também precisa virar array, senão a
 * planilha aceitaria um filtro que a lista descarta.
 */
export function parametrosDaQueryString(query: string): ParametrosUrl {
  const params: ParametrosUrl = {};
  for (const [chave, valor] of new URLSearchParams(query)) {
    const atual = params[chave];
    if (atual === undefined) {
      params[chave] = valor;
    } else if (typeof atual === "string") {
      params[chave] = [atual, valor];
    } else {
      atual.push(valor);
    }
  }
  return params;
}

/** Lê, valida e traduz a URL da listagem de lançamentos. */
export function lerFiltrosLancamentos(
  params: ParametrosUrl,
): LeituraFiltrosLancamentos {
  const tipo = parametroValido(params.tipo, TIPOS_VALIDOS);
  const status = parametroValido(params.status, STATUS_VALIDOS);
  const revisao = parametroValido(params.revisao, FILTROS_REVISAO);
  const origem = parametroValido(params.origem, ORIGENS_LANCAMENTO);
  const busca = typeof params.busca === "string" ? params.busca : "";
  const mes = typeof params.mes === "string" ? params.mes : "";
  const mesCompetencia = mesParaCompetencia(mes);
  const fornecedorId = parametroUuid(params.fornecedor);
  const categoriaId = parametroUuid(params.categoria);
  const centroCustoId = parametroUuid(params.centro);
  const contaBancariaId = parametroUuid(params.conta);
  const formaPagamentoId = parametroUuid(params.forma);
  const valor = faixaValor(params.valor_de, params.valor_ate);
  const vencimento = periodo(params.venc_de, params.venc_ate);
  const compra = periodo(params.compra_de, params.compra_ate);
  const criado = periodo(params.criado_de, params.criado_ate);

  const paginaParam = Number(params.pagina);
  const pagina =
    Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;
  const tamanhoParam = Number(params.tamanho);
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? tamanhoParam
      : TAMANHO_PADRAO;

  return {
    pagina,
    tamanho,
    filtros: {
      tipo,
      status,
      busca,
      mesCompetencia: mesCompetencia === "" ? undefined : mesCompetencia,
      fornecedorId,
      categoriaId,
      centroCustoId,
      contaBancariaId,
      formaPagamentoId,
      origem,
      valorDe: valor.de,
      valorAte: valor.ate,
      vencimentoDe: vencimento.de,
      vencimentoAte: vencimento.ate,
      compraDe: compra.de,
      compraAte: compra.ate,
      criadoDe: criado.de,
      criadoAte: criado.ate,
      revisao,
    },
    valores: {
      busca,
      tipo: tipo ?? "",
      status: status ?? "",
      mes: mesCompetencia === "" ? "" : mes,
      revisao: revisao ?? "",
      origem: origem ?? "",
      fornecedor: fornecedorId ?? "",
      categoria: categoriaId ?? "",
      centro: centroCustoId ?? "",
      conta: contaBancariaId ?? "",
      forma: formaPagamentoId ?? "",
      valorDe: texto(valor.de),
      valorAte: texto(valor.ate),
      vencDe: texto(vencimento.de),
      vencAte: texto(vencimento.ate),
      compraDe: texto(compra.de),
      compraAte: texto(compra.ate),
      criadoDe: texto(criado.de),
      criadoAte: texto(criado.ate),
    },
  };
}
