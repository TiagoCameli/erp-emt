import {
  filtrarFacetado,
  selecao,
  type ResultadoFacetado,
} from "@/modules/_shared/filtros-facetados";
import { facetaAtivo } from "@/modules/cadastros/_shared/faceta-ativo";
import type { ObraLista } from "@/modules/cadastros/obras/queries";

/** Estado dos filtros da listagem de obras ("" = filtro solto). */
export interface FiltrosObras {
  busca: string;
  status: string;
  situacao: string;
  clienteId: string;
  uf: string;
  rodovia: string;
  lote: string;
  inicioDe: string;
  inicioAte: string;
  fimDe: string;
  fimAte: string;
}

export type FacetaObra = "status" | "situacao" | "cliente" | "uf" | "rodovia" | "lote";

/** Data "YYYY-MM-DD" dentro da janela; sem data sai quando a ponta está preenchida. */
function dentro(data: string | null, de: string, ate: string): boolean {
  if (de !== "" && (!data || data < de)) return false;
  if (ate !== "" && (!data || data > ate)) return false;
  return true;
}

/**
 * Filtra a listagem de obras em memória, facetado (ver
 * `_shared/filtros-facetados`): cada seletor só oferece o que existe nas linhas
 * que passam nos outros. Períodos de início e fim e a busca restringem sem
 * serem restringidos.
 */
export function filtrarObras(
  obras: readonly ObraLista[],
  filtros: FiltrosObras,
): ResultadoFacetado<ObraLista, FacetaObra> {
  const termo = filtros.busca.trim().toLowerCase();
  return filtrarFacetado<ObraLista, FacetaObra>(
    obras,
    {
      status: facetaAtivo(filtros.status),
      situacao: { selecionados: selecao(filtros.situacao), chave: (o) => o.status },
      cliente: { selecionados: selecao(filtros.clienteId), chave: (o) => o.clienteId },
      uf: { selecionados: selecao(filtros.uf), chave: (o) => o.uf },
      rodovia: { selecionados: selecao(filtros.rodovia), chave: (o) => o.rodovia },
      lote: { selecionados: selecao(filtros.lote), chave: (o) => o.lote },
    },
    [
      // Datas em "YYYY-MM-DD": comparação de string já é cronológica. Obra sem
      // data sai quando o período está preenchido, senão a linha entraria sem
      // ninguém saber se ela cabe na janela pedida.
      (o) => dentro(o.dataInicio, filtros.inicioDe, filtros.inicioAte),
      (o) => dentro(o.dataFimPrevista, filtros.fimDe, filtros.fimAte),
      (o) => !termo || o.nome.toLowerCase().includes(termo),
    ],
  );
}
