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
  const termo = f.busca.trim().toLowerCase();
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
      (item) => {
        if (!termo) return true;
        // A busca cobre quem recebeu e o que recebeu: o nome do EPI e o CA são
        // o jeito natural de achar "quem está com bota" ou um CA específico.
        const alvo = [item.colaboradorNome, item.descricao, item.ca ?? ""]
          .join(" ")
          .toLowerCase();
        return alvo.includes(termo);
      },
    ],
  );
}
