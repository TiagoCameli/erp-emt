"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TransferenciaFormDrawer, type TanqueOpcao } from "./transferencia-form-drawer";

export interface TransferenciasAcoesCabecalhoProps {
  podeCriar: boolean;
  tanques: TanqueOpcao[];
}

/** Botão "Nova transferência" do cabeçalho, só com `criar`. */
export function TransferenciasAcoesCabecalho({ podeCriar, tanques }: TransferenciasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova transferência
      </Button>
      <TransferenciaFormDrawer aberto={aberto} onAbertoChange={setAberto} tanques={tanques} />
    </>
  );
}
