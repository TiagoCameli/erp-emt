"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { DocumentoFormDrawer } from "./documento-form-drawer";

export interface DocumentosAcoesCabecalhoProps {
  colaboradores: ColaboradorOpcao[];
}

/**
 * Botão "Novo documento" + drawer de criação, para a ação primária do
 * PageHeader. Edições partem do menu de cada linha na tabela.
 */
export function DocumentosAcoesCabecalho({
  colaboradores,
}: DocumentosAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo documento
      </Button>
      <DocumentoFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        colaboradores={colaboradores}
      />
    </>
  );
}
