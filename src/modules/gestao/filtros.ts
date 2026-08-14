import { mesHojeISO } from "@/lib/formatadores";
import {
  janelaEntre,
  janelaPainel,
  MESES_PAINEL,
  somarMeses,
  type JanelaPainel,
} from "@/modules/gestao/calculo";

/**
 * Contrato da URL do painel de Gestão: obra/centro de custo, período por mês de
 * referência e categoria financeira.
 *
 * Mora num módulo só, e não dentro da página, pelo mesmo motivo do
 * `lancamentos/filtros.ts`: a página monta a tela e as consultas de custo leem os
 * mesmos filtros. Dois lugares interpretando a URL divergem no primeiro filtro
 * novo, e aí um cartão passa a somar um conjunto e o gráfico ao lado outro.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** searchParams do App Router, do jeito que chegam na página. */
export type ParametrosUrl = Record<string, string | string[] | undefined>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES = /^\d{4}-\d{2}$/;

/** O que as consultas de custo recebem. */
export interface FiltrosPainel {
  /** Janela de competência: a mesma para todos os cortes de custo. */
  janela: JanelaPainel;
  /** Centro de custo do rateio (a obra), ou undefined para todos. */
  centroCustoId?: string;
  /** Categoria financeira do lançamento, ou undefined para todas. */
  categoriaId?: string;
}

/** O que a barra de filtros mostra de volta (string vazia = sem filtro). */
export interface ValoresFiltrosPainel {
  centro: string;
  categoria: string;
  /** Mês inicial no formato do input (yyyy-MM). */
  mesDe: string;
  mesAte: string;
}

export interface LeituraFiltrosPainel {
  filtros: FiltrosPainel;
  valores: ValoresFiltrosPainel;
  /**
   * Algum filtro de recorte está ativo? A tela usa para avisar, nos blocos que
   * não obedecem ao filtro, que o número ali é do total.
   */
  temRecorte: boolean;
  /** O período foi escolhido na tela (e não é a janela padrão de 6 meses)? */
  periodoEscolhido: boolean;
}

/** Uuid vindo da URL, ou undefined. Evita mandar lixo para o parâmetro da RPC. */
function parametroUuid(
  valor: string | string[] | undefined,
): string | undefined {
  return typeof valor === "string" && UUID.test(valor) ? valor : undefined;
}

/** Mês yyyy-MM vindo da URL, ou undefined. */
function parametroMes(
  valor: string | string[] | undefined,
): string | undefined {
  if (typeof valor !== "string" || !MES.test(valor)) return undefined;
  const mes = Number(valor.slice(5, 7));
  return mes >= 1 && mes <= 12 ? valor : undefined;
}

/**
 * Decide a janela a partir do que veio na URL.
 *
 * Com as duas pontas, vale o intervalo. Com uma ponta só, a outra é completada
 * de um jeito previsível: início solto vai até o mês corrente, fim solto abre os
 * seis meses anteriores a ele. Sem nenhuma, é a janela padrão do painel, que é o
 * comportamento que a tela sempre teve.
 */
function janelaDosFiltros(
  mesDe: string | undefined,
  mesAte: string | undefined,
  mesHoje: string,
): { janela: JanelaPainel; escolhido: boolean } {
  if (mesDe !== undefined && mesAte !== undefined) {
    return { janela: janelaEntre(mesDe, mesAte), escolhido: true };
  }
  if (mesDe !== undefined) {
    return { janela: janelaEntre(mesDe, mesHoje), escolhido: true };
  }
  if (mesAte !== undefined) {
    const inicio = somarMeses(`${mesAte}-01`, -(MESES_PAINEL - 1)).slice(0, 7);
    return { janela: janelaEntre(inicio, mesAte), escolhido: true };
  }
  return { janela: janelaPainel(mesHoje), escolhido: false };
}

/**
 * Lê, valida e traduz a URL do painel.
 *
 * `mesHoje` entra por parâmetro (yyyy-MM no fuso de Rio Branco) para a função
 * ficar pura: assim o teste não muda de resultado no mês que vem.
 */
export function lerFiltrosPainel(
  params: ParametrosUrl,
  mesHoje: string = mesHojeISO(),
): LeituraFiltrosPainel {
  const centroCustoId = parametroUuid(params.centro);
  const categoriaId = parametroUuid(params.categoria);
  const mesDe = parametroMes(params.mes_de);
  const mesAte = parametroMes(params.mes_ate);

  const { janela, escolhido } = janelaDosFiltros(mesDe, mesAte, mesHoje);

  return {
    filtros: { janela, centroCustoId, categoriaId },
    valores: {
      centro: centroCustoId ?? "",
      categoria: categoriaId ?? "",
      // Só o que passou na validação volta para a barra: parâmetro inválido na
      // URL não pode aparecer preenchido como se estivesse valendo.
      mesDe: mesDe ?? "",
      mesAte: mesAte ?? "",
    },
    // Período não conta como recorte para o aviso: os blocos que ignoram o
    // filtro são fotos do momento (a pagar em aberto, OCs a aprovar), e "hoje"
    // não muda com o período escolhido. O que os deixa fora de conversa é o
    // recorte por obra ou categoria.
    temRecorte: centroCustoId !== undefined || categoriaId !== undefined,
    periodoEscolhido: escolhido,
  };
}
