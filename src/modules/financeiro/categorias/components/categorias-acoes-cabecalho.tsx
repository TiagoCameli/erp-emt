"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CategoriaPaiOpcao } from "@/modules/financeiro/categorias/queries";
import { CategoriasFormDrawer } from "./categorias-form-drawer";

export interface CategoriasAcoesCabecalhoProps {
  categoriasPai: CategoriaPaiOpcao[];
}

/**
 * Botão "Nova categoria" + drawer de criação, para a ação primária do
 * PageHeader. Edições partem do menu de cada linha na tabela.
 */
export function CategoriasAcoesCabecalho({
  categoriasPai,
}: CategoriasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova categoria
      </Button>
      <CategoriasFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        categoriasPai={categoriasPai}
      />
    </>
  );
}
