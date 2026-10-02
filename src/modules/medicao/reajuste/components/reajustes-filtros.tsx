"use client";

import { FilterBar, FiltroSelect, useFiltrosUrl } from "@/components/canonicos";
import type { ContratoDoSeletor } from "@/modules/medicao/_shared/seletor-contrato";
import { ROTULO_FILTRO_SITUACAO_REAJUSTE } from "@/modules/medicao/reajuste/formato";

export interface ReajustesFiltrosProps {
  contratos: ContratoDoSeletor[];
  contratoId: string;
  situacao: string;
}

/** Contrato e situação do reajuste, por `?contrato=` e `?situacao=` na URL. Vazio é "Todos". */
export function ReajustesFiltros({ contratos, contratoId, situacao }: ReajustesFiltrosProps) {
  const { setMuitos } = useFiltrosUrl();
  return (
    <FilterBar>
      <FiltroSelect
        valor={contratoId}
        onValorChange={(novo) => setMuitos({ contrato: novo === "" ? null : novo })}
        opcoes={contratos.map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nomeObra}` }))}
        todosRotulo="Todos os contratos"
        className="max-w-80"
      />
      <FiltroSelect
        valor={situacao}
        onValorChange={(novo) => setMuitos({ situacao: novo === "" ? null : novo })}
        opcoes={Object.entries(ROTULO_FILTRO_SITUACAO_REAJUSTE).map(([valor, rotulo]) => ({ valor, rotulo }))}
        todosRotulo="Todas as situações"
      />
    </FilterBar>
  );
}
