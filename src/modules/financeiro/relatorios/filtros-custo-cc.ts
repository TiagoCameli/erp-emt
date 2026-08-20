import type { PeriodoCompetencia } from "@/modules/financeiro/relatorios/drill";
import {
  lerCatalogoDaUrl,
  lerUuidsDaUrl,
} from "@/modules/financeiro/_shared/listas-na-url";

/**
 * Contrato da URL do relatório de Custo por centro de custo: o que cada parâmetro
 * significa, como é validado e o que a barra de filtros mostra de volta.
 *
 * Espelha `lancamentos/filtros.ts` de propósito, incluindo a regra que mais
 * importa: **só o que passou na validação chega na tela**. Filtro inválido
 * aparecendo preenchido na barra faz o usuário ler que o relatório está filtrado
 * quando ele não está, e o número ao lado é dinheiro.
 *
 * Os filtros de escolha são todos de MÚLTIPLA escolha, no formato de
 * `listas-na-url.ts` (ids separados por vírgula, teto de 50). Lista vazia é o
 * "todos", e um valor só é o link antigo continuando a funcionar.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** searchParams do App Router, do jeito que chegam na página. */
export type ParametrosUrl = Record<string, string | string[] | undefined>;

/**
 * De que jeito o período é escolhido.
 *
 * `vida` é o pedido do dono: o acumulado das obras escolhidas desde o primeiro
 * lançamento de cada uma, que é a pergunta real de obra rodoviária ("quanto essa
 * obra já custou?"). Ela é por centro, e não global, e é por isso que ela exige
 * pelo menos um centro escolhido.
 */
export type ModoPeriodo = "mes" | "periodo" | "total" | "vida";

export type TipoCentro = "obra" | "escritorio" | "manutencao";

/**
 * Status de lançamento que o filtro oferece.
 *
 * Só os três que existem na base a pagar (medido em 20/08/2026: 5.760 `pago`,
 * 90 `aprovado`, 86 `a_pagar`). `cancelado` está fora porque o relatório o exclui
 * sempre, e `previsto` está fora porque quem manda nele é o marcador "Excluir
 * lançamentos previstos": ter as duas portas para a mesma decisão deixaria a tela
 * dizer duas coisas ao mesmo tempo.
 *
 * ATENÇÃO: aqui é o status LITERAL da coluna. Na tela de Lançamentos o seletor de
 * status chamado "A pagar" significa outra coisa (a situação do dinheiro, que
 * inclui `aprovado` com saldo em aberto). É por isso que o drill leva um parâmetro
 * separado, `status_in`, em vez de reusar o `status` de lá.
 */
export type StatusCusto = "a_pagar" | "aprovado" | "pago";

export interface FiltrosCustoCc {
  modo: ModoPeriodo;
  /** Mês de referência (yyyy-MM) no modo `mes`. */
  mes: string;
  /** Pontas da janela (yyyy-MM) no modo `periodo`. Vazio = sem limite. */
  de: string;
  ate: string;
  /**
   * Centros escolhidos, na ordem de escolha. Vazio = todos.
   *
   * Cada um vale pela SUBÁRVORE dele (ver `fn_centro_custo_subarvore`): escolher
   * a obra traz as etapas dela. Obrigatório ter pelo menos um no modo `vida`.
   */
  centroIds: string[];
  categoriaIds: string[];
  fornecedorIds: string[];
  /** Formas de pagamento escolhidas. Vazio + `semForma` falso = todas. */
  formaIds: string[];
  /**
   * "Sem forma de pagamento" marcado.
   *
   * Precisa ser uma escolha própria porque 880 lançamentos a pagar não têm forma
   * nenhuma (R$ 13,4 mi em 20/08/2026). Sem esta opção, marcar "PIX e Boleto"
   * esconderia esse dinheiro sem dizer que escondeu.
   */
  semForma: boolean;
  status: StatusCusto[];
  tiposCentro: TipoCentro[];
  /**
   * Tirar os lançamentos `previsto` da soma?
   *
   * Falso por padrão, e o padrão é o que importa aqui: o relatório de hoje inclui
   * previsto (ele só exclui cancelado). Fazer "incluir previsto" um opt-in
   * mudaria o número de um relatório de dinheiro sem ninguém pedir — e como a base
   * tem 0 previsto em 20/08/2026, a mudança não apareceria na tela hoje e só
   * morderia no dia em que o primeiro previsto fosse lançado.
   *
   * O filtro é o EXCLUDE, então ligar é uma escolha visível e desligado é o
   * comportamento de sempre.
   */
  excluirPrevisto: boolean;
  /** Mostrar a variação contra o período imediatamente anterior. */
  comparar: boolean;
}

const MODOS: ModoPeriodo[] = ["mes", "periodo", "total", "vida"];
export const TIPOS_CENTRO: readonly TipoCentro[] = [
  "obra",
  "escritorio",
  "manutencao",
];
export const STATUS_CUSTO: readonly StatusCusto[] = [
  "a_pagar",
  "aprovado",
  "pago",
];

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function parametroValido<T extends string>(
  valor: string | string[] | undefined,
  validos: readonly T[],
): T | undefined {
  if (typeof valor !== "string") return undefined;
  return (validos as readonly string[]).includes(valor)
    ? (valor as T)
    : undefined;
}

function parametroMes(valor: string | string[] | undefined): string {
  return typeof valor === "string" && MES.test(valor) ? valor : "";
}

/** Liga só no literal "1": qualquer outro texto é URL mal montada. */
function parametroLigado(valor: string | string[] | undefined): boolean {
  return valor === "1";
}

/** Meses entre dois `yyyy-MM`, contando os dois. Aritmética inteira, sem fuso. */
function mesesNaJanela(de: string, ate: string): number {
  const [anoDe, mesDe] = de.split("-").map(Number);
  const [anoAte, mesAte] = ate.split("-").map(Number);
  return (anoAte - anoDe) * 12 + (mesAte - mesDe) + 1;
}

/** Recua `quantos` meses em `yyyy-MM`. Aritmética inteira, sem `Date`. */
function recuarMeses(mes: string, quantos: number): string {
  const [ano, mesNumero] = mes.split("-").map(Number);
  const zeroBase = ano * 12 + (mesNumero - 1) - quantos;
  const anoNovo = Math.floor(zeroBase / 12);
  const mesNovo = (zeroBase % 12) + 1;
  return `${anoNovo}-${String(mesNovo).padStart(2, "0")}`;
}

/** Lê, valida e traduz a URL do relatório de custo por centro de custo. */
export function lerFiltrosCustoCc(
  params: ParametrosUrl,
  mesCorrente: string,
): { filtros: FiltrosCustoCc; erroDoModo?: string } {
  const modo = parametroValido(params.modo, MODOS) ?? "mes";
  const mesLido = parametroMes(params.mes);

  let de = parametroMes(params.de);
  let ate = parametroMes(params.ate);
  // Janela invertida é trocada de lado, senão o relatório vem vazio sem
  // explicação nenhuma. Mesma regra do `periodo()` de lancamentos/filtros.ts.
  if (de && ate && de > ate) [de, ate] = [ate, de];

  const centroIds = lerUuidsDaUrl(params.centro);

  const filtros: FiltrosCustoCc = {
    modo,
    mes: mesLido === "" ? mesCorrente : mesLido,
    de,
    ate,
    centroIds,
    categoriaIds: lerUuidsDaUrl(params.categoria),
    fornecedorIds: lerUuidsDaUrl(params.fornecedor),
    formaIds: lerUuidsDaUrl(params.forma),
    semForma: parametroLigado(params.sem_forma),
    status: lerCatalogoDaUrl(params.status, STATUS_CUSTO),
    tiposCentro: lerCatalogoDaUrl(params.tipo_centro, TIPOS_CENTRO),
    excluirPrevisto: parametroLigado(params.sem_previsto),
    comparar: parametroLigado(params.comparar),
  };

  // O modo `vida` sem centro não é erro de digitação a ser corrigido em silêncio:
  // é uma escolha incompleta, e a tela tem que pedir o que falta.
  const erroDoModo =
    modo === "vida" && centroIds.length === 0
      ? "O modo vida do centro mostra o acumulado de cada centro escolhido desde o primeiro lançamento dele. Escolha ao menos um centro de custo no filtro."
      : undefined;

  return { filtros, erroDoModo };
}

/**
 * O período que vale, dado o modo.
 *
 * `primeiroMes` só é usado no modo `vida`, e vem de fora (do banco) em vez de ser
 * lido aqui, para esta função continuar pura. Com vários centros escolhidos ele é
 * o MENOR primeiro mês entre eles: a janela tem que caber a vida mais antiga, e
 * cada linha do gráfico começa na vida dela (quem faz esse recorte por centro é a
 * `fn_rel_custo_centro_serie`).
 *
 * Sem ele, o período volta VAZIO em vez de virar "tudo": um centro que nunca teve
 * lançamento não tem vida, e mostrar o total geral no lugar seria trocar a
 * pergunta do usuário por outra.
 */
export function periodoDoModo(
  filtros: FiltrosCustoCc,
  primeiroMes?: string,
): PeriodoCompetencia {
  switch (filtros.modo) {
    case "mes":
      return { mes: filtros.mes };
    case "periodo": {
      const periodo: PeriodoCompetencia = {};
      if (filtros.de) periodo.de = filtros.de;
      if (filtros.ate) periodo.ate = filtros.ate;
      return periodo;
    }
    case "total":
      return {};
    case "vida":
      if (!primeiroMes) return {};
      return { de: primeiroMes, ate: filtros.mes };
  }
}

/**
 * A janela imediatamente anterior, de mesmo tamanho, para a coluna de variação.
 *
 * `null` quando não existe anterior: em "tudo" não há nada antes de tudo, e uma
 * janela com uma ponta só é aberta, então "de mesmo tamanho" não quer dizer nada.
 * Nesses casos a tela não mostra variação, em vez de mostrar 100% contra zero —
 * que se lê como a obra tendo dobrado de custo.
 */
export function periodoAnterior(
  periodo: PeriodoCompetencia,
): PeriodoCompetencia | null {
  if (periodo.mes) return { mes: recuarMeses(periodo.mes, 1) };
  if (!periodo.de || !periodo.ate) return null;
  const meses = mesesNaJanela(periodo.de, periodo.ate);
  return {
    de: recuarMeses(periodo.de, meses),
    ate: recuarMeses(periodo.ate, meses),
  };
}

/**
 * A comparação faz sentido neste modo?
 *
 * Só em `mes` e `periodo`. Em `total` não existe período anterior a "tudo", e em
 * `vida` o anterior ao primeiro lançamento do centro é vazio por definição. Nos
 * dois, a variação seria sempre "+100% contra zero", que é ruído com aparência de
 * informação.
 */
export function comparacaoPermitida(modo: ModoPeriodo): boolean {
  return modo === "mes" || modo === "periodo";
}
