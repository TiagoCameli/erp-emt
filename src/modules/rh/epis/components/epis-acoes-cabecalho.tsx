"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { EpiFormDrawer } from "./epi-form-drawer";

export interface EpisAcoesCabecalhoProps {
  colaboradores: ColaboradorOpcao[];
}

/**
 * Botão "Novo EPI" + drawer de criação, para a ação primária do PageHeader.
 * Edições partem do menu de cada linha na tabela.
 */
export function EpisAcoesCabecalho({ colaboradores }: EpisAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo EPI
      </Button>
      <EpiFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        colaboradores={colaboradores}
      />
    </>
  );
}
