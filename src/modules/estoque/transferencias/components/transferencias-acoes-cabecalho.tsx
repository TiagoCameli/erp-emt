"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  DepositoOpcao,
  InsumoOpcao,
} from "@/modules/estoque/_shared/queries";
import { TransferenciaFormDrawer } from "./transferencia-form-drawer";

export interface TransferenciasAcoesCabecalhoProps {
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/** Botão "Nova transferência" + drawer, para a ação primária do PageHeader. */
export function TransferenciasAcoesCabecalho({
  insumos,
  depositos,
}: TransferenciasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova transferência
      </Button>
      <TransferenciaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        insumos={insumos}
        depositos={depositos}
      />
    </>
  );
}
