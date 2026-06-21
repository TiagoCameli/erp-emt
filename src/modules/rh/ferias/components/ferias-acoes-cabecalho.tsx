"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { FeriasFormDrawer } from "./ferias-form-drawer";

export interface FeriasAcoesCabecalhoProps {
  colaboradores: ColaboradorOpcao[];
}

/**
 * Botão "Nova férias" + drawer de criação, para a ação primária do PageHeader.
 * Edições partem do menu de cada linha na tabela.
 */
export function FeriasAcoesCabecalho({
  colaboradores,
}: FeriasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova férias
      </Button>
      <FeriasFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        colaboradores={colaboradores}
      />
    </>
  );
}
