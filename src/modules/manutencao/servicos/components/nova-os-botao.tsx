"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import type { EquipamentoOpcaoOs } from "@/modules/manutencao/servicos/queries";
import { OsFormDrawer } from "./os-form-drawer";

export interface NovaOsBotaoProps {
  equipamentos: EquipamentoOpcaoOs[];
  centros: CentroCustoOpcao[];
}

/** Botão "Nova OS" do cabeçalho do caderno, com o drawer de abertura. */
export function NovaOsBotao({ equipamentos, centros }: NovaOsBotaoProps) {
  const [aberto, setAberto] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova OS
      </Button>
      <OsFormDrawer aberto={aberto} onAbertoChange={setAberto} equipamentos={equipamentos} centros={centros} />
    </>
  );
}
