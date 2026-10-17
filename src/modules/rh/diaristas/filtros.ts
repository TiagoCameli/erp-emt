import { casaBusca, textoPesquisavel } from "@/lib/busca";
import {
  filtrarFacetado,
  selecao,
  type ResultadoFacetado,
} from "@/modules/_shared/filtros-facetados";
import { naFaixa, noPeriodo } from "@/modules/rh/_shared/filtros";
import type { DiariaLista } from "@/modules/rh/diaristas/queries";

/** Valor do filtro de obra para a diária sem rateio (não deveria existir). */
export const SEM_OBRA = "sem-obra";

/** Estado dos filtros da listagem de diárias ("" = filtro vazio). */
export interface FiltrosTelaDiarias {
  busca: string;
  /** Competência yyyy-MM-01. */
  competencia: string;
  /** Id do centro raiz (obra, Escritório, Manutenção) ou `SEM_OBRA`. */
  obraId: string;
  colaboradorId: string;
  /** "aberto" | "fechada" | "paga" */
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
  return filtrarFacetado<DiariaLista, FacetaDiarias>(
    diarias,
    {
      obra: {
        selecionados: selecao(f.obraId),
        // Diária rateada aparece em cada obra do rateio.
        chave: (item) =>
          item.rateio.length > 0
            ? item.rateio.map((r) => r.centroCustoId)
            : SEM_OBRA,
      },
      colaborador: {
        selecionados: selecao(f.colaboradorId),
        chave: (item) => item.colaboradorId,
      },
      situacao: {
        selecionados: selecao(f.situacao),
        chave: (item) => item.situacao,
      },
    },
    [
      (item) => !f.competencia || item.competencia === f.competencia,
      (item) => noPeriodo(item.data, f.dataDe, f.dataAte),
      (item) => naFaixa(item.valor, f.valorDe, f.valorAte),
      // Busca universal (src/lib/busca.ts): tudo o que a linha carrega.
      (item) =>
        casaBusca(
          textoPesquisavel(
            item.colaboradorNome,
            ...item.rateio.map((r) => r.nome),
            item.funcaoNome,
            item.observacao,
            item.situacao,
            { valor: item.valor },
            { valor: item.valorDiaria },
            { data: item.data },
            { data: item.dataFim },
            { mes: item.competencia },
          ),
          f.busca,
        ),
    ],
  );
}
