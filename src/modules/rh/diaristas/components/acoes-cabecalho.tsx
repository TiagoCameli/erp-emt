"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DiaristaOpcao } from "@/modules/rh/_shared/queries";
import type {
  CentroDiaria,
  FuncaoDiaria,
} from "@/modules/rh/diaristas/queries";
import { DiariaFormDrawer } from "./diaria-form-drawer";

export interface AcoesCabecalhoProps {
  diaristas: DiaristaOpcao[];
  centros: CentroDiaria[];
  funcoes: FuncaoDiaria[];
}

/**
 * Botão "Nova diária" + drawer de criação, para a ação primária do PageHeader.
 * Edições partem do menu de cada linha na tabela.
 */
export function AcoesCabecalho({
  diaristas,
  centros,
  funcoes,
}: AcoesCabecalhoProps) {
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
        centros={centros}
        funcoes={funcoes}
      />
    </>
  );
}
