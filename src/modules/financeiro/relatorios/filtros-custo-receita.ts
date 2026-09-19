import {
  lerListaDaUrl,
  lerUuidsDaUrl,
} from "@/modules/financeiro/_shared/listas-na-url";

/**
 * Contrato da URL do relatório de Custo x receita por centro de custo.
 *
 * A tela compara DOIS conjuntos escolhidos separadamente: os centros de onde sai
 * o custo e os centros de onde entra a receita. Não é capricho de interface —
 * medido em 22/08/2026, sete centros têm custo e receita zero (carretas,
 * equipamentos, escritório, casas), e a receita se concentra nas obras. Comparar
 * "o custo da obra mais o das máquinas que servem ela" contra "a receita da obra"
 * é a pergunta real, e ela precisa dos dois lados soltos.
 *
 * ## Cada lado tem DOIS campos: a raiz e a etapa
 *
 * `centro_custo` traz as raízes e `etapa_custo` o recorte dentro delas (o mesmo
 * do lado da receita). São dois parâmetros, e não um só com tudo dentro, porque
 * eles significam coisas diferentes: a raiz é o conjunto, a etapa é o recorte —
 * e quem lê a URL precisa saber qual é qual para o segundo campo abrir marcado.
 * A tradução dos dois numa lista só para o banco é de `_shared/centro-custo/filtro.ts`.
 *
 * ## O tempo é UMA janela de meses, e só
 *
 * Desde 19/09/2026 a tela tem um controle de tempo só: a régua de mês de
 * referência, a mesma de Lançamentos (pedido do Tiago, com o print desta tela).
 * Antes eram TRÊS trilhos para a mesma pergunta — uma lista de meses avulsos
 * (`mes_ref`), um campo De e um campo Até — com a regra "mês marcado manda" e a
 * janela apagada em silêncio quando havia mês na lista. Dois controles de tempo
 * brigando na mesma barra é a coisa que faz a pessoa desconfiar do número.
 *
 * `mes_ref` continua sendo LIDO, para link salvo e favorito não abrirem sem
 * recorte nenhum: ele vira a janela que vai do menor ao maior mês marcado. Um
 * link com meses NÃO contíguos (jan e jul) passa a mostrar também o que está no
 * meio — e a barra diz isso, porque a régua exibe "jan - jul de 2026". O que não
 * pode acontecer é o relatório recortar por uma lista que nenhum filtro da tela
 * mostra.
 *
 * Sem nada escolhido, valem TODOS os meses que existem: é a pergunta que faz
 * alguém abrir esta tela ("quanto essa obra deu de resultado").
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** searchParams do App Router, do jeito que chegam na página. */
export type ParametrosUrl = Record<string, string | string[] | undefined>;

/**
 * Teto de meses no eixo.
 *
 * Cinco anos. Não é gosto: a lista de meses viaja como `date[]` para a RPC e vira
 * coluna no gráfico, e uma URL montada à mão com "de 2000 a 2030" desenharia 372
 * colunas ilegíveis. A base tem 17 meses de lançamento em 22/08/2026.
 */
export const MAX_MESES = 60;

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface FiltrosCustoReceita {
  /** Primeiro mês da janela (yyyy-MM). Vazio = sem limite desse lado. */
  de: string;
  /** Último mês da janela (yyyy-MM). Vazio = sem limite desse lado. */
  ate: string;
  /** Centros-raiz cujo CUSTO entra. Vazio = todos. Cada um vale pela subárvore. */
  centrosCusto: string[];
  /** Centros-raiz cuja RECEITA entra. Vazio = todos. Cada um vale pela subárvore. */
  centrosReceita: string[];
  /**
   * Etapas escolhidas dentro dos centros do custo. Vazio = o centro inteiro.
   *
   * Escolher etapa RECORTA a raiz, não soma a ela: ver `_shared/centro-custo/filtro.ts`, que
   * é quem traduz os dois campos numa lista só para o banco. A validação de a
   * quem cada etapa pertence mora lá, porque depende do cadastro e esta leitura é
   * pura — aqui só se garante que são uuids.
   */
  etapasCusto: string[];
  /** Etapas escolhidas dentro dos centros da receita. Vazio = o centro inteiro. */
  etapasReceita: string[];
}

/** Recua ou avança meses em `yyyy-MM`. Aritmética inteira, sem `Date` e sem fuso. */
function somarMeses(mes: string, quantos: number): string {
  const [ano, mesNumero] = mes.split("-").map(Number);
  const zeroBase = ano * 12 + (mesNumero - 1) + quantos;
  const anoNovo = Math.floor(zeroBase / 12);
  const mesNovo = (zeroBase % 12) + 1;
  return `${anoNovo}-${String(mesNovo).padStart(2, "0")}`;
}

/** Os meses de uma janela fechada, contando as duas pontas. */
export function mesesDaJanela(de: string, ate: string): string[] {
  const meses: string[] = [];
  let atual = de;
  while (atual <= ate && meses.length < MAX_MESES) {
    meses.push(atual);
    atual = somarMeses(atual, 1);
  }
  return meses;
}

function parametroMes(valor: string | string[] | undefined): string {
  return typeof valor === "string" && MES.test(valor) ? valor : "";
}

export interface LeituraCustoReceita {
  filtros: FiltrosCustoReceita;
  /**
   * Os meses que a consulta vai usar, em ordem crescente. É a ÚNICA entrada de
   * tempo que chega ao banco.
   */
  mesesEfetivos: string[];
}

/**
 * Lê, valida e traduz a URL do relatório de custo x receita.
 *
 * `mesesDisponiveis` (os meses que têm lançamento, vindos do banco) entra por
 * parâmetro para esta função continuar pura: é ele que define o padrão e as
 * pontas abertas da janela.
 */
export function lerFiltrosCustoReceita(
  params: ParametrosUrl,
  mesesDisponiveis: readonly string[],
): LeituraCustoReceita {
  let de = parametroMes(params.de);
  let ate = parametroMes(params.ate);
  // Janela invertida é trocada de lado, senão o relatório vem vazio sem
  // explicação nenhuma. Mesma regra dos outros contratos de URL do módulo.
  if (de && ate && de > ate) [de, ate] = [ate, de];

  // `mes_ref` do formato antigo, quando o tempo era uma lista de meses avulsos:
  // vira a janela que cobre o que foi marcado, e MANDA sobre `de`/`ate`, que era
  // a precedência da tela antiga (mês marcado desabilitava a janela). Sem isto,
  // um link salvo abriria com a janela que o filtro velho tinha apagado.
  const marcados = lerListaDaUrl(
    params.mes_ref,
    (item) => MES.test(item),
    MAX_MESES,
  ).sort();
  if (marcados.length > 0) {
    de = marcados[0]!;
    ate = marcados[marcados.length - 1]!;
  }

  const filtros: FiltrosCustoReceita = {
    de,
    ate,
    centrosCusto: lerUuidsDaUrl(params.centro_custo),
    centrosReceita: lerUuidsDaUrl(params.centro_receita),
    etapasCusto: lerUuidsDaUrl(params.etapa_custo),
    etapasReceita: lerUuidsDaUrl(params.etapa_receita),
  };

  return { filtros, mesesEfetivos: resolverMeses(filtros, mesesDisponiveis) };
}

/**
 * Os meses que valem: a janela, ou tudo.
 *
 * Com uma ponta só da janela, a outra vem do que EXISTE (o primeiro ou o último
 * mês com lançamento) em vez de virar um limite inventado: "de julho em diante"
 * significa até onde há dado, não até o fim dos tempos.
 */
function resolverMeses(
  filtros: FiltrosCustoReceita,
  mesesDisponiveis: readonly string[],
): string[] {
  const existentes = [...mesesDisponiveis].sort();
  if (existentes.length === 0) return [];

  if (!filtros.de && !filtros.ate) return existentes.slice(0, MAX_MESES);

  const primeiro = existentes[0]!;
  const ultimo = existentes[existentes.length - 1]!;
  const de = filtros.de || primeiro;
  const ate = filtros.ate || ultimo;
  if (de > ate) return [];
  return mesesDaJanela(de, ate);
}
