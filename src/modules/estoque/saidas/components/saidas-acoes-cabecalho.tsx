"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  CentroCustoOpcao,
  DepositoOpcao,
  InsumoOpcao,
} from "@/modules/estoque/_shared/queries";
import { SaidaFormDrawer } from "./saida-form-drawer";

export interface SaidasAcoesCabecalhoProps {
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
  centrosCusto: CentroCustoOpcao[];
}

/** Botão "Nova saída" + drawer, para a ação primária do PageHeader. */
export function SaidasAcoesCabecalho({
  insumos,
  depositos,
  centrosCusto,
}: SaidasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova saída
      </Button>
      <SaidaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        insumos={insumos}
        depositos={depositos}
        centrosCusto={centrosCusto}
      />
    </>
  );
}
