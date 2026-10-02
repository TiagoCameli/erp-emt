import {
  filtrarFacetado,
  selecao,
  type ResultadoFacetado,
} from "@/modules/_shared/filtros-facetados";
import { naFaixa, noPeriodo } from "@/modules/rh/_shared/filtros";
import type { DiariaLista } from "@/modules/rh/diaristas/queries";

/** Valor do filtro de obra para a diária lançada sem obra. */
export const SEM_OBRA = "sem-obra";

/** Estado dos filtros da listagem de diárias ("" = filtro vazio). */
export interface FiltrosTelaDiarias {
  busca: string;
  /** Competência yyyy-MM-01. */
  competencia: string;
  /** Id da obra ou `SEM_OBRA`. */
  obraId: string;
  colaboradorId: string;
  /** "aberto" | "paga" */
  situacao: string;
  dataDe: string;
  dataAte: string;
  valorDe: string;
  valorAte: string;
}

export type FacetaDiarias = "obra" | "colaborador" | "situacao";

/**
 * Filtra as diárias e prepara as opções facetadas: obra, diarista e situação só
 * oferecem o que existe na lista filtrada pelos outros (ver
 * `_shared/filtros-facetados`). A competência é filtro de data: restringe os
 * outros, mas mantém a lista de meses inteira; período, valor e busca idem.
 */
export function filtrarDiarias(
  diarias: readonly DiariaLista[],
  f: FiltrosTelaDiarias,
): ResultadoFacetado<DiariaLista, FacetaDiarias> {
  const termo = f.busca.trim().toLowerCase();
  return filtrarFacetado<DiariaLista, FacetaDiarias>(
    diarias,
    {
      obra: {
        selecionados: selecao(f.obraId),
        chave: (item) => item.obraId ?? SEM_OBRA,
      },
      colaborador: {
        selecionados: selecao(f.colaboradorId),
        chave: (item) => item.colaboradorId,
      },
      situacao: {
        selecionados: selecao(f.situacao),
        chave: (item) => (item.fechada ? "paga" : "aberto"),
      },
    },
    [
      (item) => !f.competencia || item.competencia === f.competencia,
      (item) => noPeriodo(item.data, f.dataDe, f.dataAte),
      (item) => naFaixa(item.valor, f.valorDe, f.valorAte),
      (item) => !termo || item.colaboradorNome.toLowerCase().includes(termo),
    ],
  );
}
