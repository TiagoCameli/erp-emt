"use client";

import { FilterBar, FiltroSelect, useFiltrosUrl } from "@/components/canonicos";
import { ROTULO_GRAVIDADE } from "@/modules/medicao/alertas/formato";
import type { ContratoDoSeletor } from "@/modules/medicao/_shared/seletor-contrato";

export interface AlertasFiltrosProps {
  contratos: ContratoDoSeletor[];
  contratoId: string;
  gravidade: string;
}

/** Contrato e gravidade, por `?contrato=` e `?gravidade=` na URL. Vazio é "Todos". */
export function AlertasFiltros({ contratos, contratoId, gravidade }: AlertasFiltrosProps) {
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
        valor={gravidade}
        onValorChange={(novo) => setMuitos({ gravidade: novo === "" ? null : novo })}
        opcoes={Object.entries(ROTULO_GRAVIDADE).map(([valor, rotulo]) => ({ valor, rotulo }))}
        todosRotulo="Todas as gravidades"
      />
    </FilterBar>
  );
}
