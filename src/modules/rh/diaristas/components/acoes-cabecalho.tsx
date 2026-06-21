"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  DiaristaOpcao,
  ObraOpcao,
} from "@/modules/rh/_shared/queries";
import { DiariaFormDrawer } from "./diaria-form-drawer";

export interface AcoesCabecalhoProps {
  diaristas: DiaristaOpcao[];
  obras: ObraOpcao[];
}

/**
 * Botão "Nova diária" + drawer de criação, para a ação primária do PageHeader.
 * Edições partem do menu de cada linha na tabela.
 */
export function AcoesCabecalho({ diaristas, obras }: AcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova diária
      </Button>
      <DiariaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        diaristas={diaristas}
        obras={obras}
      />
    </>
  );
}
