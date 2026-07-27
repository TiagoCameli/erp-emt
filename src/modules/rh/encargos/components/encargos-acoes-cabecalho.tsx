"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import { importar, validarImport } from "@/modules/rh/encargos/actions";
import { EncargoFormDrawer } from "./encargo-form-drawer";

export interface EncargosAcoesCabecalhoProps {
  podeCriar: boolean;
}

/**
 * Ações do cabeçalho da tela de encargos: importar planilha (quando pode
 * criar) e o botão "Novo encargo" que abre o drawer de criação.
 */
export function EncargosAcoesCabecalho({
  podeCriar,
}: EncargosAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar encargos"
        modeloHref="/rh/encargos/modelo"
        validarAction={validarImport}
        importarAction={importar}
      />
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo encargo
      </Button>
      <EncargoFormDrawer aberto={aberto} onAbertoChange={setAberto} />
    </>
  );
}
