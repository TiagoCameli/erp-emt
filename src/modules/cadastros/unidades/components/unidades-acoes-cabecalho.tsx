"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importar,
  validarImport,
} from "@/modules/cadastros/unidades/actions";
import { UnidadesFormDrawer } from "./unidades-form-drawer";

export interface UnidadesAcoesCabecalhoProps {
  podeCriar: boolean;
}

/**
 * Ações do cabeçalho da tela de unidades: importar planilha (quando pode
 * criar) e o botão "Nova unidade" que abre o drawer de criação.
 */
export function UnidadesAcoesCabecalho({
  podeCriar,
}: UnidadesAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar unidades de medida"
        modeloHref="/cadastros/unidades/modelo"
        validarAction={validarImport}
        importarAction={importar}
      />
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova unidade
      </Button>
      <UnidadesFormDrawer aberto={aberto} onAbertoChange={setAberto} />
    </>
  );
}
