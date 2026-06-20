"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  DepositoOpcao,
  InsumoOpcao,
} from "@/modules/estoque/_shared/queries";
import { MinimoFormDrawer } from "./minimo-form-drawer";

export interface AlertasAcoesCabecalhoProps {
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/**
 * Botão "Definir mínimo" + drawer de criação, para a ação primária do
 * PageHeader. Edições partem do menu de cada linha na tabela.
 */
export function AlertasAcoesCabecalho({
  insumos,
  depositos,
}: AlertasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Definir mínimo
      </Button>
      <MinimoFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        insumos={insumos}
        depositos={depositos}
      />
    </>
  );
}
