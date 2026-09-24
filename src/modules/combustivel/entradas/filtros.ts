import { dataLocalISO } from "@/lib/formatadores";
import type { EntradaLinha } from "@/modules/combustivel/entradas/queries";
import { diaValido, type Periodo } from "@/modules/combustivel/relatorios/periodo";
import { lerUuidsDaUrl } from "@/modules/financeiro/_shared/listas-na-url";

/**
 * Filtros da lista de entradas (em memória). Módulo puro: página, tela e teste.
 *
 * Período, tanque, combustível e fornecedor são o recorte do cabeçalho do módulo e vivem
 * na URL (`de`, `ate`, `tanque`, `combustivel`, `fornecedor`), para atravessar de uma aba
 * para outra como a barra de filtros da origem. A busca é da lista e fica na sessão.
 */
export interface FiltrosEntradas {
  busca: string;
  de: string;
  ate: string;
  tanqueIds: readonly string[];
  insumoIds: readonly string[];
  fornecedorIds: readonly string[];
}

export const CHAVES_FILTRO_ENTRADAS = {
  de: "de",
  ate: "ate",
  tanque: "tanque",
  combustivel: "combustivel",
  fornecedor: "fornecedor",
} as const;

export type FiltrosEntradasUrl = Omit<FiltrosEntradas, "busca">;

type Parametros = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * O recorte da URL. Sem período nenhum, o padrão (a origem abre nos últimos 30 dias);
 * com só uma ponta, a outra fica aberta. Período invertido troca de lado.
 */
export function lerFiltrosEntradas(params: Parametros, periodoPadrao?: Periodo): FiltrosEntradasUrl {
  let de = diaValido(primeiro(params.de)) ?? "";
  let ate = diaValido(primeiro(params.ate)) ?? "";
  if (!de && !ate && periodoPadrao) ({ de, ate } = periodoPadrao);
  if (de && ate && de > ate) [de, ate] = [ate, de];
  return {
    de,
    ate,
    tanqueIds: lerUuidsDaUrl(params.tanque),
    insumoIds: lerUuidsDaUrl(params.combustivel),
    fornecedorIds: lerUuidsDaUrl(params.fornecedor),
  };
}

/**
 * Filtro da lista, puro para o teste. O período compara o DIA em Rio Branco: uma
 * entrada às 20h de Rio Branco já é o dia seguinte em UTC.
 */
export function filtrarEntradas(entradas: readonly EntradaLinha[], filtros: FiltrosEntradas): EntradaLinha[] {
  const termo = filtros.busca.trim().toLowerCase();
  return entradas.filter((entrada) => {
    if (filtros.tanqueIds.length > 0 && !filtros.tanqueIds.includes(entrada.tanqueId)) return false;
    if (filtros.insumoIds.length > 0 && !filtros.insumoIds.includes(entrada.insumoId)) return false;
    if (filtros.fornecedorIds.length > 0 && !(entrada.fornecedorId && filtros.fornecedorIds.includes(entrada.fornecedorId))) {
      return false;
    }
    const dia = dataLocalISO(entrada.dataHora) ?? "";
    if (filtros.de && dia < filtros.de) return false;
    if (filtros.ate && dia > filtros.ate) return false;
    if (!termo) return true;
    return (
      (entrada.fornecedorNome ?? "").toLowerCase().includes(termo) ||
      (entrada.notaFiscal ?? "").toLowerCase().includes(termo) ||
      (entrada.observacoes ?? "").toLowerCase().includes(termo)
    );
  });
}
