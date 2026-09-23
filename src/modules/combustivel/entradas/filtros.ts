import { dataLocalISO } from "@/lib/formatadores";
import type { EntradaLinha } from "@/modules/combustivel/entradas/queries";

/** Filtros da lista de entradas (em memória). Módulo puro: tela e teste. */
export interface FiltrosEntradas {
  busca: string;
  de: string;
  ate: string;
  tanqueId: string;
  insumoId: string;
}

/**
 * Filtro da lista, puro para o teste. O período compara o DIA em Rio Branco: uma
 * entrada às 20h de Rio Branco já é o dia seguinte em UTC.
 */
export function filtrarEntradas(entradas: readonly EntradaLinha[], filtros: FiltrosEntradas): EntradaLinha[] {
  const termo = filtros.busca.trim().toLowerCase();
  return entradas.filter((entrada) => {
    if (filtros.tanqueId && entrada.tanqueId !== filtros.tanqueId) return false;
    if (filtros.insumoId && entrada.insumoId !== filtros.insumoId) return false;
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
