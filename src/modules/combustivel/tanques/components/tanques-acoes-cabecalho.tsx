"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import { importar, validarImport } from "@/modules/combustivel/tanques/actions";
import type { FornecedorOpcao } from "@/modules/combustivel/tanques/queries";
import { TanqueFormDrawer } from "./tanque-form-drawer";

export interface TanquesAcoesCabecalhoProps {
  podeCriar: boolean;
  fornecedores: FornecedorOpcao[];
}

/** Cabeçalho de Tanques: importar planilha e "Novo tanque", só com `criar`. */
export function TanquesAcoesCabecalho({ podeCriar, fornecedores }: TanquesAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar tanques"
        modeloHref="/combustivel/tanques/modelo"
        validarAction={validarImport}
        importarAction={importar}
      />
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo tanque
      </Button>
      <TanqueFormDrawer aberto={aberto} onAbertoChange={setAberto} fornecedores={fornecedores} />
    </>
  );
}
