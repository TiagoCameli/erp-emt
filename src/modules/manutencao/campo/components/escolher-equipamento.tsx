"use client";

import { useRouter } from "next/navigation";

import { CampoFormulario, Combobox } from "@/components/canonicos";
import type { EquipamentoOpcaoCampo } from "@/modules/manutencao/campo/queries";

/** Escolher da lista quando o adesivo sumiu, rasgou ou não lê. */
export function EscolherEquipamento({ equipamentos }: { equipamentos: EquipamentoOpcaoCampo[] }) {
  const router = useRouter();
  return (
    <CampoFormulario id="escolher-equipamento" rotulo="Ou escolha da lista">
      <Combobox
        id="escolher-equipamento"
        valor=""
        onValorChange={(id) => {
          if (id) router.push(`/m/equipamento/${id}`);
        }}
        opcoes={equipamentos.map((equipamento) => ({ valor: equipamento.id, rotulo: equipamento.rotulo }))}
        placeholder="Buscar pelo código, nome ou placa"
        buscaPlaceholder="Código, nome ou placa"
        vazioTexto="Nenhum equipamento ativo com esse texto"
      />
    </CampoFormulario>
  );
}
