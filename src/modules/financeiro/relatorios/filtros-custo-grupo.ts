import { lerUuidsDaUrl } from "@/modules/financeiro/_shared/listas-na-url";
import {
  lerPeriodoDaUrl,
  type ParametrosUrl,
  type PeriodoNaUrl,
} from "@/modules/financeiro/relatorios/filtros-periodo";

/**
 * Contrato da URL do relatório de Custo por grupo de insumo.
 *
 * Até 29/08/2026 esta tela tinha um seletor de mês e mais nada, enquanto a
 * `fn_rel_custo_por_grupo` já recebia `p_centro_custo` e `p_categoria` desde
 * 29/07 — dois filtros prontos no banco que a tela nunca ofereceu. O KPI ao lado
 * promete "igual ao custo por centro de custo", e o irmão tem doze filtros: sem
 * estes, comparar os dois exigia comparar um recorte com o total.
 *
 * ## POR QUE UM CENTRO E UMA CATEGORIA, e não uma lista de cada
 *
 * Porque é o que a função aceita: `p_centro_custo uuid` e `p_categoria uuid`, no
 * singular. Oferecer marcação múltipla na tela exigiria N chamadas somadas no
 * app, e a soma teria de ser refeita nos três níveis do drill (grupo,
 * subcategoria e insumo) — três lugares para a conta divergir do banco. A lista
 * de verdade é `p_centros uuid[]`/`p_categorias uuid[]` na RPC, e enquanto ela
 * não existe a tela oferece o que a consulta sabe responder.
 *
 * Os parâmetros continuam se chamando `centro`, `etapa` e `categoria`, e a
 * leitura continua sendo a de `listas-na-url.ts` com teto 1: assim um link vindo
 * do Custo por centro de custo (que marca vários) abre aqui pelo PRIMEIRO em vez
 * de dar erro, e a barra mostra exatamente o que a consulta usou.
 *
 * ## O CENTRO É ESCADA: raiz num campo, etapa no outro
 *
 * Igual às outras duas telas de centro do módulo. A tradução dos dois campos no
 * id que vai ao banco é de `centros-e-etapas.ts` (a etapa SUBSTITUI a raiz), e a
 * RPC filtra pela SUBÁRVORE do que receber (`fn_centro_custo_subarvore`) — então
 * escolher a obra traz as etapas dela.
 *
 * Módulo puro: nada de banco, nada de React.
 */

export interface FiltrosCustoGrupo extends PeriodoNaUrl {
  /** Centro-raiz escolhido. Vazio = todos. Vale pela subárvore dele. */
  centroId: string;
  /** Etapa escolhida dentro da raiz. Vazio = a raiz inteira. */
  etapaId: string;
  /** Categoria financeira escolhida. Vazio = todas. */
  categoriaId: string;
}

/** O primeiro uuid válido do parâmetro, ou vazio. */
function lerUuidDaUrl(valor: string | string[] | undefined): string {
  return lerUuidsDaUrl(valor, 1)[0] ?? "";
}

/** Lê e valida a URL do relatório de custo por grupo de insumo. */
export function lerFiltrosCustoGrupo(
  params: ParametrosUrl,
  mesCorrente: string,
): FiltrosCustoGrupo {
  return {
    ...lerPeriodoDaUrl(params, mesCorrente),
    centroId: lerUuidDaUrl(params.centro),
    etapaId: lerUuidDaUrl(params.etapa),
    categoriaId: lerUuidDaUrl(params.categoria),
  };
}
