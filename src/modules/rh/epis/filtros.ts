import { casaBusca, textoPesquisavel } from "@/lib/busca";
import {
  filtrarFacetado,
  selecao,
  type ResultadoFacetado,
} from "@/modules/_shared/filtros-facetados";
import { noPeriodo } from "@/modules/rh/_shared/filtros";
import type { EpiLista } from "@/modules/rh/epis/queries";

/** Estado dos filtros da listagem de EPIs ("" = filtro vazio). */
export interface FiltrosTelaEpis {
  busca: string;
  colaboradorId: string;
  /** "em_uso" | "devolvido" */
  situacao: string;
  /** "sim" | "nao" */
  assinado: string;
  entregaDe: string;
  entregaAte: string;
  devolucaoDe: string;
  devolucaoAte: string;
}

export type FacetaEpis = "colaborador" | "situacao" | "assinado";

/**
 * Filtra as entregas de EPI e prepara as opções facetadas: colaborador,
 * situação e termo assinado só oferecem o que existe na lista filtrada pelos
 * outros (ver `_shared/filtros-facetados`). Períodos e busca restringem, mas não
 * são restringidos.
 */
export function filtrarEpis(
  epis: readonly EpiLista[],
  f: FiltrosTelaEpis,
): ResultadoFacetado<EpiLista, FacetaEpis> {
  return filtrarFacetado<EpiLista, FacetaEpis>(
    epis,
    {
      colaborador: {
        selecionados: selecao(f.colaboradorId),
        chave: (item) => item.colaboradorId,
      },
      situacao: {
        selecionados: selecao(f.situacao),
        chave: (item) => (item.dataDevolucao === null ? "em_uso" : "devolvido"),
      },
      assinado: {
        selecionados: selecao(f.assinado),
        chave: (item) => (item.assinado ? "sim" : "nao"),
      },
    },
    [
      (item) => noPeriodo(item.dataEntrega, f.entregaDe, f.entregaAte),
      // EPI ainda em uso (sem devolução) sai da lista quando o usuário pede uma
      // janela de devolução: sem data, não é resposta.
      (item) => noPeriodo(item.dataDevolucao, f.devolucaoDe, f.devolucaoAte),
      // Busca universal (src/lib/busca.ts): quem recebeu, o que recebeu (nome do
      // EPI e CA), situação e as datas.
      (item) =>
        casaBusca(
          textoPesquisavel(
            item.colaboradorNome,
            item.descricao,
            item.ca,
            item.observacao,
            item.dataDevolucao === null ? "em uso" : "devolvido",
            item.assinado ? "assinado" : "sem termo",
            { data: item.dataEntrega },
            { data: item.dataDevolucao },
          ),
          f.busca,
        ),
    ],
  );
}
