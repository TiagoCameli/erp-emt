import { proximoMes, rotuloMes } from "@/modules/financeiro/relatorios/calculo";
import type { PeriodoCompetencia } from "@/modules/financeiro/relatorios/drill";

/**
 * O PERÍODO DE COMPETÊNCIA na URL dos relatórios: os três modos, a leitura e a
 * tradução para as pontas que as RPCs entendem.
 *
 * Vive num módulo só porque três relatórios oferecem a mesma escolha de tempo
 * (Custo por grupo de insumo, DRE gerencial e, com um quarto modo próprio, o
 * Custo por centro de custo). Com uma cópia por tela, a primeira divergência
 * aparece no detalhe que ninguém revisa — o `fim` da RPC é EXCLUSIVO, e fechar a
 * janela no primeiro dia do último mês em vez de no primeiro do mês seguinte
 * deixa o mês inteiro de fora sem a tela parar de mostrar número.
 *
 * Os nomes dos parâmetros (`modo`, `mes`, `de`, `ate`) são de propósito os mesmos
 * do Custo por centro de custo: os três relatórios recortam a MESMA dimensão (o
 * mês de referência do lançamento), então trocar de relatório na barra de cima
 * mantém o recorte em vez de jogá-lo fora. Modo que não existe no relatório de
 * destino cai no padrão dele, porque cada leitura valida contra o próprio
 * catálogo.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** searchParams do App Router, do jeito que chegam na página. */
export type ParametrosUrl = Record<string, string | string[] | undefined>;

/**
 * De que jeito o período é escolhido.
 *
 * Sem o `vida` do Custo por centro de custo: lá ele nasce do primeiro lançamento
 * de CADA centro escolhido, e nem o DRE nem o custo por grupo agrupam por centro.
 */
export type ModoPeriodo = "mes" | "periodo" | "total";

export const MODOS_PERIODO: readonly ModoPeriodo[] = ["mes", "periodo", "total"];

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** O período escolhido, do jeito que a barra de filtros mostra de volta. */
export interface PeriodoNaUrl {
  modo: ModoPeriodo;
  /** Mês de referência (yyyy-MM) no modo `mes`. */
  mes: string;
  /** Pontas da janela (yyyy-MM) no modo `periodo`. Vazio = ponta aberta. */
  de: string;
  ate: string;
}

/** Lê `yyyy-MM` da URL; devolve vazio quando não é um mês de verdade. */
export function lerMesDaUrl(valor: string | string[] | undefined): string {
  return typeof valor === "string" && MES.test(valor) ? valor : "";
}

/** Lê um valor de catálogo fechado da URL. */
export function lerOpcaoDaUrl<T extends string>(
  valor: string | string[] | undefined,
  validos: readonly T[],
): T | undefined {
  if (typeof valor !== "string") return undefined;
  return (validos as readonly string[]).includes(valor)
    ? (valor as T)
    : undefined;
}

/**
 * Lê o período de competência da URL.
 *
 * Janela invertida é trocada de lado em vez de devolver vazio: "de agosto até
 * janeiro" é erro de digitação, e um relatório de dinheiro em branco sem
 * explicação nenhuma é a pior resposta possível. Mesma regra do
 * `lerFiltrosCustoCc`.
 */
export function lerPeriodoDaUrl(
  params: ParametrosUrl,
  mesCorrente: string,
): PeriodoNaUrl {
  const modo = lerOpcaoDaUrl(params.modo, MODOS_PERIODO) ?? "mes";
  const mesLido = lerMesDaUrl(params.mes);

  let de = lerMesDaUrl(params.de);
  let ate = lerMesDaUrl(params.ate);
  if (de && ate && de > ate) [de, ate] = [ate, de];

  return { modo, mes: mesLido === "" ? mesCorrente : mesLido, de, ate };
}

/** O período que vale, dado o modo. `total` é o período aberto dos dois lados. */
export function periodoDoModo(escolha: PeriodoNaUrl): PeriodoCompetencia {
  switch (escolha.modo) {
    case "mes":
      return { mes: escolha.mes };
    case "periodo": {
      const periodo: PeriodoCompetencia = {};
      if (escolha.de) periodo.de = escolha.de;
      if (escolha.ate) periodo.ate = escolha.ate;
      return periodo;
    }
    case "total":
      return {};
  }
}

/**
 * Traduz o período para as pontas que a RPC entende.
 *
 * A RPC usa `[inicio, fim)` — fim EXCLUSIVO —, então a ponta de cima é o primeiro
 * dia do mês SEGUINTE ao último mês pedido. Fechar no primeiro dia do próprio mês
 * deixaria o último mês inteiro de fora, que é o tipo de erro que some do olho
 * porque o relatório continua mostrando número.
 */
export function pontasDaRpc(periodo: PeriodoCompetencia): {
  inicio?: string;
  fim?: string;
} {
  if (periodo.mes) {
    return { inicio: `${periodo.mes}-01`, fim: proximoMes(periodo.mes) };
  }
  return {
    inicio: periodo.de ? `${periodo.de}-01` : undefined,
    fim: periodo.ate ? proximoMes(periodo.ate) : undefined,
  };
}

/**
 * Descreve o período em pt-BR, para o detalhe dos cartões e o título da tabela.
 *
 * O modo entra porque "tudo" e "uma janela sem ponta nenhuma" chegam aqui como o
 * mesmo objeto vazio e não querem dizer a mesma coisa para quem lê.
 */
export function descreverPeriodo(
  periodo: PeriodoCompetencia,
  modo?: ModoPeriodo | "vida",
): string {
  if (modo === "total") return "Todo o período, sem limite de data";
  if (periodo.mes) return `Mês de referência ${rotuloMes(periodo.mes)}`;
  if (periodo.de && periodo.ate) {
    return periodo.de === periodo.ate
      ? `Mês de referência ${rotuloMes(periodo.de)}`
      : `De ${rotuloMes(periodo.de)} a ${rotuloMes(periodo.ate)}`;
  }
  if (periodo.de) return `De ${rotuloMes(periodo.de)} em diante`;
  if (periodo.ate) return `Até ${rotuloMes(periodo.ate)}`;
  return "Todo o período";
}

/**
 * Fecha as pontas abertas do período com os meses que EXISTEM na base.
 *
 * Existe para o DRE: a `fn_rel_dre` recebe `p_inicio`/`p_fim` sem `default` e sem
 * guarda de nulo (`l.mes_competencia >= date_trunc('month', p_inicio)` com nulo é
 * NULL, que filtra tudo fora), então "tudo" e "de julho em diante" precisam de uma
 * data de verdade dos dois lados. Fechar pelo primeiro e pelo último mês com
 * lançamento é o "tudo" exato, e não uma data inventada com folga.
 *
 * Devolve `null` quando não há mês nenhum: base sem lançamento não tem período, e
 * quem chama mostra o estado vazio em vez de consultar uma janela sem sentido.
 */
export function periodoFechado(
  periodo: PeriodoCompetencia,
  mesesDisponiveis: readonly string[],
): PeriodoCompetencia | null {
  if (periodo.mes) return periodo;
  const primeiro = mesesDisponiveis[0];
  const ultimo = mesesDisponiveis[mesesDisponiveis.length - 1];
  const de = periodo.de || primeiro;
  const ate = periodo.ate || ultimo;
  if (!de || !ate) return null;
  return de > ate ? { de: ate, ate: de } : { de, ate };
}
