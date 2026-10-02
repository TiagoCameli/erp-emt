"use client";

import { FilterBar, FiltroSelect, useFiltrosUrl } from "@/components/canonicos";
import { restringirOpcoes, selecao, type FacetasPresentes } from "@/modules/_shared/filtros-facetados";
import { ROTULO_GRAVIDADE } from "@/modules/medicao/alertas/formato";
import type { FacetaAlertas } from "@/modules/medicao/alertas/queries";
import type { ContratoDoSeletor } from "@/modules/medicao/_shared/seletor-contrato";

export interface AlertasFiltrosProps {
  contratos: ContratoDoSeletor[];
  contratoId: string;
  gravidade: string;
  /** Valores que existem nos alertas filtrados, por filtro (ver `facetasAlertas`). */
  facetas?: FacetasPresentes<FacetaAlertas>;
}

/** Contrato e gravidade, por `?contrato=` e `?gravidade=` na URL. Vazio é "Todos". */
export function AlertasFiltros({ contratos, contratoId, gravidade, facetas }: AlertasFiltrosProps) {
  const { setMuitos } = useFiltrosUrl();

  // Cada filtro só oferece o que existe com o outro aplicado (ver `_shared/filtros-facetados`).
  function facetar(id: FacetaAlertas, base: { valor: string; rotulo: string }[], valor: string) {
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
        valor={gravidade}
        onValorChange={(novo) => setMuitos({ gravidade: novo === "" ? null : novo })}
        opcoes={facetar(
          "gravidade",
          Object.entries(ROTULO_GRAVIDADE).map(([valor, rotulo]) => ({ valor, rotulo })),
          gravidade,
        )}
        todosRotulo="Todas as gravidades"
      />
    </FilterBar>
  );
}
