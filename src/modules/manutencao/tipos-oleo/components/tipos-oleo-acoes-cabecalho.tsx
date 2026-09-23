"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import { importar, validarImport } from "@/modules/manutencao/tipos-oleo/actions";
import { TiposOleoFormDrawer } from "./tipos-oleo-form-drawer";

export interface TiposOleoAcoesCabecalhoProps {
  podeCriar: boolean;
}

/** Cabeçalho de Tipos de óleo: importar planilha e "Novo tipo de óleo", só com `criar`. */
export function TiposOleoAcoesCabecalho({ podeCriar }: TiposOleoAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar tipos de óleo"
        modeloHref="/manutencao/tipos-oleo/modelo"
        validarAction={validarImport}
        importarAction={importar}
      />
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo tipo de óleo
      </Button>
      <TiposOleoFormDrawer aberto={aberto} onAbertoChange={setAberto} />
    </>
  );
}
