import type { PeriodoCompetencia } from "@/modules/financeiro/relatorios/drill";

/**
 * Contrato da URL do relatório de Custo por centro de custo: o que cada parâmetro
 * significa, como é validado e o que a barra de filtros mostra de volta.
 *
 * Espelha `lancamentos/filtros.ts` de propósito, incluindo a regra que mais
 * importa: **só o que passou na validação chega na tela**. Filtro inválido
 * aparecendo preenchido na barra faz o usuário ler que o relatório está filtrado
 * quando ele não está, e o número ao lado é dinheiro.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** searchParams do App Router, do jeito que chegam na página. */
export type ParametrosUrl = Record<string, string | string[] | undefined>;

/**
 * De que jeito o período é escolhido.
 *
 * `vida` é o pedido do dono: o acumulado de UMA obra desde o primeiro lançamento
 * dela, que é a pergunta real de obra rodoviária ("quanto essa obra já custou?").
 * Ela é por centro, e não global, e é por isso que ela exige um centro escolhido.
 */
export type ModoPeriodo = "mes" | "periodo" | "total" | "vida";

export type TipoCentro = "obra" | "escritorio" | "manutencao";

export interface FiltrosCustoCc {
  modo: ModoPeriodo;
  /** Mês de referência (yyyy-MM) no modo `mes`. */
  mes: string;
  /** Pontas da janela (yyyy-MM) no modo `periodo`. Vazio = sem limite. */
  de: string;
  ate: string;
  /** Obrigatório no modo `vida`; filtro comum nos outros. */
  centroId?: string;
  categoriaId?: string;
  fornecedorId?: string;
  /**
   * Tirar os lançamentos `previsto` da soma?
   *
   * Falso por padrão, e o padrão é o que importa aqui: o relatório de hoje inclui
   * previsto (ele só exclui cancelado). Fazer "incluir previsto" um opt-in
   * mudaria o número de um relatório de dinheiro sem ninguém pedir — e como a base
   * tem 0 previsto em 14/08/2026, a mudança não apareceria na tela hoje e só
   * morderia no dia em que o primeiro previsto fosse lançado.
   *
   * O filtro é o EXCLUDE, então ligar é uma escolha visível e desligado é o
   * comportamento de sempre.
   */
  excluirPrevisto: boolean;
  tipoCentro?: TipoCentro;
  /** Mostrar a variação contra o período imediatamente anterior. */
  comparar: boolean;
}

const MODOS: ModoPeriodo[] = ["mes", "periodo", "total", "vida"];
const TIPOS_CENTRO: TipoCentro[] = ["obra", "escritorio", "manutencao"];

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function parametroUuid(
  valor: string | string[] | undefined,
): string | undefined {
  return typeof valor === "string" && UUID.test(valor) ? valor : undefined;
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

  const centroId = parametroUuid(params.centro);

  const filtros: FiltrosCustoCc = {
    modo,
    mes: mesLido === "" ? mesCorrente : mesLido,
    de,
    ate,
    centroId,
    categoriaId: parametroUuid(params.categoria),
    fornecedorId: parametroUuid(params.fornecedor),
    excluirPrevisto: parametroLigado(params.sem_previsto),
    tipoCentro: parametroValido(params.tipo_centro, TIPOS_CENTRO),
    comparar: parametroLigado(params.comparar),
  };

  // O modo `vida` sem centro não é erro de digitação a ser corrigido em silêncio:
  // é uma escolha incompleta, e a tela tem que pedir o que falta.
  const erroDoModo =
    modo === "vida" && !centroId
      ? "O modo vida do centro mostra o acumulado de UM centro de custo desde o primeiro lançamento dele. Escolha um centro de custo no filtro."
      : undefined;

  return { filtros, erroDoModo };
}

/**
 * O período que vale, dado o modo.
 *
 * `primeiroMesDoCentro` só é usado no modo `vida`, e vem de fora (do banco) em vez
 * de ser lido aqui, para esta função continuar pura. Sem ele, o período volta
 * VAZIO em vez de virar "tudo": um centro que nunca teve lançamento não tem vida,
 * e mostrar o total geral no lugar seria trocar a pergunta do usuário por outra.
 */
export function periodoDoModo(
  filtros: FiltrosCustoCc,
  primeiroMesDoCentro?: string,
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
      if (!primeiroMesDoCentro) return {};
      return { de: primeiroMesDoCentro, ate: filtros.mes };
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
