"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { InsumoOpcao, Opcao } from "@/modules/manutencao/almoxarifado/queries";
import { EntradaFormDrawer } from "./entrada-form-drawer";

export interface EntradasAcoesCabecalhoProps {
  podeCriar: boolean;
  depositos: Opcao[];
  fornecedores: Opcao[];
  insumos: InsumoOpcao[];
}

/** Botão "Registrar entrada" do cabeçalho, com o drawer da NF. */
export function EntradasAcoesCabecalho({
  podeCriar,
  depositos,
  fornecedores,
  insumos,
}: EntradasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Registrar entrada
      </Button>
      <EntradaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        depositos={depositos}
        fornecedores={fornecedores}
        insumos={insumos}
      />
    </>
  );
}
