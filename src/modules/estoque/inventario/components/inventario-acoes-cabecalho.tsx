"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  DepositoOpcao,
  InsumoOpcao,
  SaldoLista,
} from "@/modules/estoque/_shared/queries";
import { AjusteFormDrawer } from "./ajuste-form-drawer";

export interface InventarioAcoesCabecalhoProps {
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
  saldos: SaldoLista[];
}

/** Botão "Novo ajuste" + drawer, para a ação primária do PageHeader. */
export function InventarioAcoesCabecalho({
  insumos,
  depositos,
  saldos,
}: InventarioAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo ajuste
      </Button>
      <AjusteFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        insumos={insumos}
        depositos={depositos}
        saldos={saldos}
      />
    </>
  );
}
