"use client";

import { FilterBar, FiltroSelect, useFiltrosUrl } from "@/components/canonicos";

export interface ContratoDoSeletor {
  id: string;
  codigo: string;
  nomeObra: string;
}

export interface FiltroContratoProps {
  contratos: ContratoDoSeletor[];
  contratoId: string;
  /**
   * Chaves da URL que dependem do contrato e zeram junto na troca (no boletim, `ate` e `grupo`:
   * a 10ª de um contrato não existe no outro). Vai na MESMA escrita da URL, ver `setMuitos`.
   */
  limparAoTrocar?: string[];
}

/** O select do contrato, por `?contrato=` na URL. Lista só os contratos da lista de acesso (RLS). */
export function FiltroContrato({ contratos, contratoId, limparAoTrocar = [] }: FiltroContratoProps) {
  const { setMuitos } = useFiltrosUrl();
  return (
    <FiltroSelect
      valor={contratoId}
      onValorChange={(novo) =>
        setMuitos({
          contrato: novo === "" ? null : novo,
          ...Object.fromEntries(limparAoTrocar.map((chave) => [chave, null])),
        })
      }
      opcoes={contratos.map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nomeObra}` }))}
      todosRotulo="Escolha o contrato"
      className="max-w-80"
    />
  );
}

/** Barra só com a escolha do contrato (Planilha contratual). */
export function SeletorContrato({ contratos, contratoId }: { contratos: ContratoDoSeletor[]; contratoId: string }) {
  return (
    <FilterBar>
      <FiltroContrato contratos={contratos} contratoId={contratoId} />
    </FilterBar>
  );
}
