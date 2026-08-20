import { mesParaCompetencia } from "@/lib/formatadores";
import {
  lerCatalogoDaUrl,
  lerUuidsDaUrl,
} from "@/modules/financeiro/_shared/listas-na-url";
import type { ListarLancamentosParams } from "@/modules/financeiro/lancamentos/queries";
import { lerRecorte } from "@/modules/financeiro/lancamentos/recorte";
import {
  lerOrdenacao,
  type DirecaoOrdem,
  type OrdemLancamentos,
} from "@/modules/financeiro/lancamentos/ordenacao";
import {
  FILTROS_ATRASO,
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
  /** Situação de atraso das parcelas (vencido, a_vencer). */
  atraso: string;
  origem: string;
  /**
   * Escolhas de múltipla marcação, na ordem de escolha. Vazio = todos.
   *
   * Viraram lista porque o relatório de custo por centro de custo passou a
   * filtrar vários de cada um, e o clique numa barra dele abre ESTA lista: com um
   * valor só aqui, o drill de "três fornecedores" abriria uma lista maior que a
   * célula clicada, sem dizer que abriu.
   */
  fornecedores: string[];
  categorias: string[];
  centros: string[];
  formas: string[];
  /** "1" quando os lançamentos SEM forma de pagamento estão incluídos. */
  semForma: string;
  /** Status literais aceitos, quando o recorte vem de um relatório. */
  statusIn: string[];
  conta: string;
  valorDe: string;
  valorAte: string;
  vencDe: string;
  vencAte: string;
  compraDe: string;
  compraAte: string;
  criadoDe: string;
  criadoAte: string;
  /** "1" quando cancelados estão fora da lista, "" quando entram. */
  semCancelado: string;
  /** "1" quando previstos estão fora da lista, "" quando entram. */
  semPrevisto: string;
  /** A fatia de parcela recortada por um relatório, como veio na URL. */
  recorte: string;
  /** Faixa de MÊS DE REFERÊNCIA, como data yyyy-MM-dd. */
  compDe: string;
  compAte: string;
  /**
   * Ordenação em vigor, já validada. Diferente dos outros valores, estes NUNCA
   * são string vazia: sem escolha na URL eles vêm com o padrão, porque a tabela
   * precisa marcar alguma coluna como ordenada.
   */
  ordem: OrdemLancamentos;
  direcao: DirecaoOrdem;
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
  const statusEscolhido = parametroValido(params.status, STATUS_VALIDOS);
  /**
   * "A pagar" no seletor significa A SITUAÇÃO DO DINHEIRO, não o status exato do
   * documento.
   *
   * Medido em 15/08/2026: 86 lançamentos têm status `a_pagar` (R$ 1,90 mi) e 107
   * têm status `aprovado` — TODOS com saldo em aberto, somando R$ 9,84 mi.
   * `.eq("status","a_pagar")` trazia 16% da dívida, e quem procurava o que a
   * empresa deve ia embora achando que tinha visto tudo. Os outros status
   * continuam sendo igualdade exata: "Aprovado" é a etapa, e ela existe.
   */
  const comSaldoAberto = statusEscolhido === "a_pagar" ? true : undefined;
  const status = comSaldoAberto ? undefined : statusEscolhido;
  const revisao = parametroValido(params.revisao, FILTROS_REVISAO);
  const atraso = parametroValido(params.atraso, FILTROS_ATRASO);
  const origem = parametroValido(params.origem, ORIGENS_LANCAMENTO);
  const busca = typeof params.busca === "string" ? params.busca : "";
  const mes = typeof params.mes === "string" ? params.mes : "";
  const mesCompetencia = mesParaCompetencia(mes);
  // Múltipla escolha, no mesmo formato do relatório de custo (`listas-na-url.ts`):
  // ids por vírgula ou chave repetida, dedup, teto de 50. Um id só continua
  // valendo, então todo link antigo desta tela continua abrindo o mesmo conjunto.
  const fornecedorIds = lerUuidsDaUrl(params.fornecedor);
  const categoriaIds = lerUuidsDaUrl(params.categoria);
  const centroCustoIds = lerUuidsDaUrl(params.centro);
  const formaPagamentoIds = lerUuidsDaUrl(params.forma);
  // "Sem forma informada" é escolha, não resto: são 880 lançamentos a pagar
  // (R$ 13,4 mi em 20/08/2026), e o relatório de custo sabe marcá-los.
  const semForma = params.sem_forma === "1" ? true : undefined;
  /**
   * Status LITERAIS, e num parâmetro separado do `status` de cima.
   *
   * O `status` desta tela significa a situação do dinheiro ("A pagar" inclui
   * `aprovado` com saldo em aberto), e o relatório de custo filtra pelo status
   * exato da coluna. Reusar a mesma chave para os dois sentidos faria o clique no
   * relatório abrir um conjunto diferente do que a célula somou.
   */
  const statusIn = lerCatalogoDaUrl(params.status_in, STATUS_VALIDOS);
  const contaBancariaId = parametroUuid(params.conta);
  const valor = faixaValor(params.valor_de, params.valor_ate);
  const vencimento = periodo(params.venc_de, params.venc_ate);
  const compra = periodo(params.compra_de, params.compra_ate);
  const criado = periodo(params.criado_de, params.criado_ate);
  // Faixa de mês de REFERÊNCIA. O `mes` acima é um mês exato; esta é a janela, e
  // ela existe porque o relatório de centro de custo passou a somar período
  // ("acumulado da obra no ano") e o clique precisa de um destino equivalente.
  const competencia = periodo(params.comp_de, params.comp_ate);
  // Só o literal "1" liga: qualquer outro texto é URL mal montada, e ligar um
  // filtro por engano some com linha da lista sem dizer por quê.
  const semCancelado = params.sem_cancelado === "1" ? true : undefined;
  // Irmão do sem_cancelado, e existe pelo mesmo motivo: o relatório de custo pode
  // estar somando sem previsto, e o clique tem que abrir a MESMA fatia. Dois
  // excludes explícitos em vez de um `status` multivalorado, porque o App Router
  // entrega chave repetida como array e o contrato inteiro recusa array.
  const semPrevisto = params.sem_previsto === "1" ? true : undefined;
  const recorte = lerRecorte(params.recorte);
  // Ordenação escolhida no cabeçalho da tabela. Mora na URL como os filtros, por
  // dois motivos: o link compartilhado abre com a MESMA ordem que a pessoa viu, e
  // a exportação para Excel lê estes mesmos filtros, então a planilha sai na
  // ordem da tela em vez de numa ordem própria.
  const { ordem, direcao } = lerOrdenacao(params.ordem, params.direcao);

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
      fornecedorIds,
      categoriaIds,
      centroCustoIds,
      contaBancariaId,
      formaPagamentoIds,
      semForma,
      statusIn,
      origem,
      valorDe: valor.de,
      valorAte: valor.ate,
      vencimentoDe: vencimento.de,
      vencimentoAte: vencimento.ate,
      compraDe: compra.de,
      compraAte: compra.ate,
      criadoDe: criado.de,
      criadoAte: criado.ate,
      competenciaDe: competencia.de,
      competenciaAte: competencia.ate,
      revisao,
      atraso,
      comSaldoAberto,
      semCancelado,
      semPrevisto,
      recorte,
      ordem,
      direcao,
    },
    valores: {
      busca,
      tipo: tipo ?? "",
      // A barra mostra a escolha da pessoa, e não o que foi para o banco.
      status: statusEscolhido ?? "",
      mes: mesCompetencia === "" ? "" : mes,
      revisao: revisao ?? "",
      atraso: atraso ?? "",
      origem: origem ?? "",
      fornecedores: fornecedorIds,
      categorias: categoriaIds,
      centros: centroCustoIds,
      formas: formaPagamentoIds,
      semForma: semForma ? "1" : "",
      statusIn,
      conta: contaBancariaId ?? "",
      valorDe: texto(valor.de),
      valorAte: texto(valor.ate),
      vencDe: texto(vencimento.de),
      vencAte: texto(vencimento.ate),
      compraDe: texto(compra.de),
      compraAte: texto(compra.ate),
      criadoDe: texto(criado.de),
      criadoAte: texto(criado.ate),
      compDe: texto(competencia.de),
      compAte: texto(competencia.ate),
      semCancelado: semCancelado ? "1" : "",
      semPrevisto: semPrevisto ? "1" : "",
      // Só o recorte que PASSOU na validação volta para a tela: recorte inválido
      // aparecendo na barra diria que a lista está recortada quando ela não está.
      recorte: recorte ? (params.recorte as string) : "",
      // Sempre preenchidos, com o padrão quando a URL não escolheu: a tabela
      // precisa saber qual coluna marcar como ordenada.
      ordem,
      direcao,
    },
  };
}
