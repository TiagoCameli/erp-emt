"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importar,
  validarImport,
} from "@/modules/cadastros/jornadas/actions";
import { JornadaFormDrawer } from "./jornada-form-drawer";

export interface JornadasAcoesCabecalhoProps {
  podeCriar: boolean;
}

/**
 * Ações do cabeçalho da tela de jornadas: importar planilha (quando pode
 * criar) e o botão "Nova jornada" que abre o drawer de criação.
 */
export function JornadasAcoesCabecalho({
  podeCriar,
}: JornadasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar jornadas"
        modeloHref="/cadastros/jornadas/modelo"
        validarAction={validarImport}
        importarAction={importar}
      />
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova jornada
      </Button>
      <JornadaFormDrawer aberto={aberto} onAbertoChange={setAberto} />
    </>
  );
}
