"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EquipamentoMedicaoOpcao } from "@/modules/manutencao/medicoes/queries";
import { MedicaoFormDrawer } from "./medicao-form-drawer";

export interface MedicoesAcoesCabecalhoProps {
  podeCriar: boolean;
  equipamentos: EquipamentoMedicaoOpcao[];
}

/** Botão "Lançar leitura" do cabeçalho, só com `criar`. */
export function MedicoesAcoesCabecalho({ podeCriar, equipamentos }: MedicoesAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Lançar leitura
      </Button>
      <MedicaoFormDrawer aberto={aberto} onAbertoChange={setAberto} equipamentos={equipamentos} />
    </>
  );
}
