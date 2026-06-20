"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  DepositoOpcao,
  InsumoOpcao,
} from "@/modules/estoque/_shared/queries";
import { EntradaFormDrawer } from "./entrada-form-drawer";

export interface EntradasAcoesCabecalhoProps {
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/** Botão "Nova entrada" + drawer, para a ação primária do PageHeader. */
export function EntradasAcoesCabecalho({
  insumos,
  depositos,
}: EntradasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova entrada
      </Button>
      <EntradaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        insumos={insumos}
        depositos={depositos}
      />
    </>
  );
}
