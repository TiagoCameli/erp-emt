"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EsvaziamentoFormDrawer, type TanqueEsvaziavel } from "./esvaziamento-form-drawer";

export interface EsvaziamentosAcoesCabecalhoProps {
  podeCriar: boolean;
  tanques: TanqueEsvaziavel[];
}

/** Botão "Esvaziar tanque" do cabeçalho, só com `criar`. */
export function EsvaziamentosAcoesCabecalho({ podeCriar, tanques }: EsvaziamentosAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Esvaziar tanque
      </Button>
      <EsvaziamentoFormDrawer aberto={aberto} onAbertoChange={setAberto} tanques={tanques} />
    </>
  );
}
