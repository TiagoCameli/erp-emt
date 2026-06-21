"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ObraOpcao } from "@/modules/medicao/_shared/queries";
import { PlanilhaFormDrawer } from "./planilha-form-drawer";

export interface AcoesCabecalhoProps {
  obras: ObraOpcao[];
}

/**
 * Botão "Nova planilha" + drawer de criação, para a ação primária do
 * PageHeader. Edições partem do menu de cada linha na lista.
 */
export function AcoesCabecalho({ obras }: AcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova planilha
      </Button>
      <PlanilhaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        planilha={null}
        obras={obras}
      />
    </>
  );
}
