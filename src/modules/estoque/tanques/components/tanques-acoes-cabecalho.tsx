"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  EquipamentoOpcao,
  OperadorOpcao,
  TanqueOpcao,
} from "@/modules/estoque/_shared/queries";
import { AbastecimentoFormDrawer } from "./abastecimento-form-drawer";

export interface TanquesAcoesCabecalhoProps {
  tanques: TanqueOpcao[];
  equipamentos: EquipamentoOpcao[];
  operadores: OperadorOpcao[];
}

/** Botão "Registrar abastecimento" + drawer, para a ação primária do PageHeader. */
export function TanquesAcoesCabecalho({
  tanques,
  equipamentos,
  operadores,
}: TanquesAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Registrar abastecimento
      </Button>
      <AbastecimentoFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        tanques={tanques}
        equipamentos={equipamentos}
        operadores={operadores}
      />
    </>
  );
}
