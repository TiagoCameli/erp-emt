"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { OcorrenciaFormDrawer } from "./ocorrencia-form-drawer";

export interface OcorrenciasAcoesCabecalhoProps {
  colaboradores: ColaboradorOpcao[];
}

/**
 * Botão "Nova ocorrência" + drawer de criação, para a ação primária do
 * PageHeader. Edições partem do menu de cada linha na tabela.
 */
export function OcorrenciasAcoesCabecalho({
  colaboradores,
}: OcorrenciasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova ocorrência
      </Button>
      <OcorrenciaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        colaboradores={colaboradores}
      />
    </>
  );
}
