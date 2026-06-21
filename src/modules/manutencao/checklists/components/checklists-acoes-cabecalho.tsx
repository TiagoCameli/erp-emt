"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChecklistFormDrawer } from "./checklist-form-drawer";

/**
 * Botão "Novo checklist" + drawer de criação, para a ação primária do
 * PageHeader. Edições partem do menu de cada linha na tabela de modelos.
 */
export function ChecklistsAcoesCabecalho() {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo checklist
      </Button>
      <ChecklistFormDrawer aberto={aberto} onAbertoChange={setAberto} />
    </>
  );
}
