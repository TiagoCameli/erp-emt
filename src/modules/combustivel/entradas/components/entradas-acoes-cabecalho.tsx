"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { InsumoCombustivel, Opcao, TanqueOpcao } from "@/modules/combustivel/entradas/queries";
import { EntradaFormDrawer } from "./entrada-form-drawer";

export interface EntradasAcoesCabecalhoProps {
  podeCriar: boolean;
  tanques: TanqueOpcao[];
  insumos: InsumoCombustivel[];
  fornecedores: Opcao[];
}

/** Botão "Lançar entrada" do cabeçalho, com o drawer. */
export function EntradasAcoesCabecalho({ podeCriar, tanques, insumos, fornecedores }: EntradasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);
  if (!podeCriar) return null;
  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Lançar entrada
      </Button>
      <EntradaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        entrada={null}
        tanques={tanques}
        insumos={insumos}
        fornecedores={fornecedores}
      />
    </>
  );
}
