"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { MovimentoFormDrawer } from "./movimento-form-drawer";

export interface BancoHorasAcoesCabecalhoProps {
  colaboradores: ColaboradorOpcao[];
}

/**
 * Botão "Novo movimento" + drawer de criação, para a ação primária do
 * PageHeader. Edições partem do menu de cada linha na tabela.
 */
export function BancoHorasAcoesCabecalho({
  colaboradores,
}: BancoHorasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo movimento
      </Button>
      <MovimentoFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        colaboradores={colaboradores}
      />
    </>
  );
}
