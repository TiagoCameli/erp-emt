"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importar,
  validarImport,
} from "@/modules/cadastros/localidades/actions";
import { LocalidadesFormDrawer } from "./localidades-form-drawer";

export interface LocalidadesAcoesCabecalhoProps {
  podeCriar: boolean;
}

/**
 * Ações do cabeçalho da tela de localidades: importar planilha (quando pode
 * criar) e o botão "Nova localidade" que abre o drawer de criação.
 */
export function LocalidadesAcoesCabecalho({
  podeCriar,
}: LocalidadesAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar localidades"
        modeloHref="/cadastros/localidades/modelo"
        validarAction={validarImport}
        importarAction={importar}
      />
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova localidade
      </Button>
      <LocalidadesFormDrawer aberto={aberto} onAbertoChange={setAberto} />
    </>
  );
}
