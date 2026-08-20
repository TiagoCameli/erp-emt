"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ContaOpcao } from "@/modules/financeiro/transferencias/queries";
import { TransferenciaFormDrawer } from "./transferencia-form-drawer";

export interface TransferenciasAcoesCabecalhoProps {
  podeCriar: boolean;
  contas: ContaOpcao[];
}

/**
 * Ação do cabeçalho: registrar uma transferência. A ação de página vive no
 * cabeçalho, ao lado do título, e não na barra da tabela.
 */
export function TransferenciasAcoesCabecalho({
  podeCriar,
  contas,
}: TransferenciasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova transferência
      </Button>

      <TransferenciaFormDrawer
        key={aberto ? "aberto" : "fechado"}
        aberto={aberto}
        onAbertoChange={setAberto}
        transferencia={null}
        contas={contas}
      />
    </>
  );
}
