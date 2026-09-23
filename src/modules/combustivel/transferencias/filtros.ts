import { dataLocalISO } from "@/lib/formatadores";
import { diaValido, type Periodo } from "@/modules/combustivel/relatorios/periodo";
import { lerUuidsDaUrl } from "@/modules/financeiro/_shared/listas-na-url";

/**
 * Filtros da lista de transferências (em memória). Módulo puro: página, tela e teste.
 *
 * Período, tanque e combustível são o recorte do cabeçalho do módulo e vivem na URL (`de`,
 * `ate`, `tanque`, `combustivel`). O tanque casa com a origem OU o destino, como o filtro
 * de tanque da origem nas transferências. A busca é da lista e fica na sessão.
 */
export const CHAVES_FILTRO_TRANSFERENCIAS = {
  de: "de",
  ate: "ate",
  tanque: "tanque",
  combustivel: "combustivel",
} as const;

export interface FiltrosTransferenciasUrl {
  de: string;
  ate: string;
  tanqueIds: readonly string[];
  insumoIds: readonly string[];
}

export interface FiltrosTransferencias extends FiltrosTransferenciasUrl {
  busca: string;
  mostrarExcluidos: boolean;
}

type Parametros = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** O recorte da URL; sem período nenhum, o padrão (a origem abre nos últimos 30 dias). */
export function lerFiltrosTransferencias(params: Parametros, periodoPadrao?: Periodo): FiltrosTransferenciasUrl {
  let de = diaValido(primeiro(params.de)) ?? "";
  let ate = diaValido(primeiro(params.ate)) ?? "";
  if (!de && !ate && periodoPadrao) ({ de, ate } = periodoPadrao);
  if (de && ate && de > ate) [de, ate] = [ate, de];
  return { de, ate, tanqueIds: lerUuidsDaUrl(params.tanque), insumoIds: lerUuidsDaUrl(params.combustivel) };
}

export interface TransferenciaFiltravel {
  dataHora: string;
  origemId: string;
  origemNome: string;
  destinoId: string;
  destinoNome: string;
  insumoId: string | null;
  observacoes: string | null;
  excluidoEm: string | null;
}

/** Filtro da lista. O período compara o DIA em Rio Branco. */
export function filtrarTransferencias<T extends TransferenciaFiltravel>(
  transferencias: readonly T[],
  filtros: FiltrosTransferencias,
): T[] {
  const termo = filtros.busca.trim().toLowerCase();
  return transferencias.filter((t) => {
    if (t.excluidoEm && !filtros.mostrarExcluidos) return false;
    if (filtros.tanqueIds.length > 0 && !filtros.tanqueIds.includes(t.origemId) && !filtros.tanqueIds.includes(t.destinoId)) {
      return false;
    }
    if (filtros.insumoIds.length > 0 && !(t.insumoId && filtros.insumoIds.includes(t.insumoId))) return false;
    const dia = dataLocalISO(t.dataHora) ?? "";
    if (filtros.de && dia < filtros.de) return false;
    if (filtros.ate && dia > filtros.ate) return false;
    if (!termo) return true;
    return (
      t.origemNome.toLowerCase().includes(termo) ||
      t.destinoNome.toLowerCase().includes(termo) ||
      (t.observacoes ?? "").toLowerCase().includes(termo)
    );
  });
}
