"use client";

import { FilterBar, FiltroSelect, useFiltrosUrl } from "@/components/canonicos";
import { restringirOpcoes, selecao, type FacetasPresentes } from "@/modules/_shared/filtros-facetados";
import type { ContratoDoSeletor } from "@/modules/medicao/_shared/seletor-contrato";
import { ROTULO_FILTRO_SITUACAO_REAJUSTE } from "@/modules/medicao/reajuste/formato";
import type { FacetaReajustes } from "@/modules/medicao/reajuste/queries";

export interface ReajustesFiltrosProps {
  contratos: ContratoDoSeletor[];
  contratoId: string;
  situacao: string;
  /** Valores que existem na aba filtrada, por filtro (ver `facetasReajustes`). */
  facetas?: FacetasPresentes<FacetaReajustes>;
}

/** Contrato e situação do reajuste, por `?contrato=` e `?situacao=` na URL. Vazio é "Todos". */
export function ReajustesFiltros({ contratos, contratoId, situacao, facetas }: ReajustesFiltrosProps) {
  const { setMuitos } = useFiltrosUrl();

  // Cada filtro só oferece o que existe com o outro aplicado (ver `_shared/filtros-facetados`).
  function facetar(id: FacetaReajustes, base: { valor: string; rotulo: string }[], valor: string) {
    if (!facetas) return base;
    return restringirOpcoes(base, new Set(facetas[id]), selecao(valor));
  }
  return (
    <FilterBar>
      <FiltroSelect
        valor={contratoId}
        onValorChange={(novo) => setMuitos({ contrato: novo === "" ? null : novo })}
        opcoes={facetar(
          "contrato",
          contratos.map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nomeObra}` })),
          contratoId,
        )}
        todosRotulo="Todos os contratos"
        className="max-w-80"
      />
      <FiltroSelect
        valor={situacao}
        onValorChange={(novo) => setMuitos({ situacao: novo === "" ? null : novo })}
        opcoes={facetar(
          "situacao",
          Object.entries(ROTULO_FILTRO_SITUACAO_REAJUSTE).map(([valor, rotulo]) => ({ valor, rotulo })),
          situacao,
        )}
        todosRotulo="Todas as situações"
      />
    </FilterBar>
  );
}
