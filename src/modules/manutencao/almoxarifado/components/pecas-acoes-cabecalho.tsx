"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { InsumoOpcao, Opcao } from "@/modules/manutencao/almoxarifado/queries";
import { PecaFormDrawer } from "./peca-form-drawer";

export interface PecasAcoesCabecalhoProps {
  podeCriar: boolean;
  insumos: InsumoOpcao[];
  /** Insumos que já são peça: saem da lista do cadastro novo. */
  insumosJaCadastrados: string[];
  tiposOleo: Opcao[];
  equipamentos: (Opcao & { ativo: boolean })[];
}

/** Botão "Nova peça" do cabeçalho, com o drawer de cadastro. */
export function PecasAcoesCabecalho({
  podeCriar,
  insumos,
  insumosJaCadastrados,
  tiposOleo,
  equipamentos,
}: PecasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);
  const jaCadastrados = React.useMemo(
    () => new Set(insumosJaCadastrados),
    [insumosJaCadastrados],
  );

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova peça
      </Button>
      <PecaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        insumos={insumos}
        insumosJaCadastrados={jaCadastrados}
        tiposOleo={tiposOleo}
        equipamentos={equipamentos}
      />
    </>
  );
}
