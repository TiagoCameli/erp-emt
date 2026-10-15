import {
  filtrarFacetado,
  selecao,
  type ResultadoFacetado,
} from "@/modules/_shared/filtros-facetados";
import { casaBusca, textoPesquisavel } from "@/lib/busca";
import { facetaAtivo } from "@/modules/cadastros/_shared/faceta-ativo";
import type { ColaboradorLista } from "@/modules/cadastros/colaboradores/queries";

/** Estado dos filtros da listagem de colaboradores ("" = filtro solto). */
export interface FiltrosColaboradores {
  busca: string;
  status: string;
  funcaoId: string;
  obraId: string;
  jornadaId: string;
  vinculo: string;
  centroCustoId: string;
  cnh: string;
  admissaoDe: string;
  admissaoAte: string;
}

export type FacetaColaborador =
  | "status"
  | "funcao"
  | "obra"
  | "jornada"
  | "vinculo"
  | "centroCusto"
  | "cnh";

/**
 * Filtra a listagem de colaboradores em memória, facetado (ver
 * `_shared/filtros-facetados`): cada seletor só oferece o que existe nas linhas
 * que passam nos outros. Período de admissão e busca restringem sem serem
 * restringidos.
 */
export function filtrarColaboradores(
  colaboradores: readonly ColaboradorLista[],
  filtros: FiltrosColaboradores,
): ResultadoFacetado<ColaboradorLista, FacetaColaborador> {
  const { admissaoDe, admissaoAte } = filtros;
  return filtrarFacetado<ColaboradorLista, FacetaColaborador>(
    colaboradores,
    {
      status: facetaAtivo(filtros.status),
      funcao: { selecionados: selecao(filtros.funcaoId), chave: (c) => c.funcaoId },
      obra: { selecionados: selecao(filtros.obraId), chave: (c) => c.obraId },
      jornada: { selecionados: selecao(filtros.jornadaId), chave: (c) => c.jornadaId },
      vinculo: { selecionados: selecao(filtros.vinculo), chave: (c) => c.vinculo },
      centroCusto: {
        selecionados: selecao(filtros.centroCustoId),
        chave: (c) => c.centroCustoId,
      },
      cnh: { selecionados: selecao(filtros.cnh), chave: (c) => c.cnhCategoria },
    },
    [
      // Datas em "YYYY-MM-DD": comparação de string já é cronológica. Sem data de
      // admissão o colaborador sai quando o período está preenchido: não há como
      // afirmar que ele cabe na janela pedida.
      (c) =>
        admissaoDe === "" || (c.dataAdmissao !== null && c.dataAdmissao >= admissaoDe),
      (c) =>
        admissaoAte === "" || (c.dataAdmissao !== null && c.dataAdmissao <= admissaoAte),
      // Busca universal (src/lib/busca.ts): tudo o que a linha carrega.
      (c) =>
        casaBusca(
          textoPesquisavel(
            c.nome,
            { documento: c.cpf },
            c.funcao,
            c.jornadaNome,
            c.vinculo,
            c.obraNome,
            c.centroCustoNome,
            c.telefone,
            { valor: c.salario },
            { valor: c.valorDiaria },
            { data: c.dataAdmissao },
          ),
          filtros.busca,
        ),
    ],
  );
}
