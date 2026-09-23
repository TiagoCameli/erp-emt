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

/** Ações da aba Tanques, só com `criar`: "Novo Tanque" (a da origem) e a importação por planilha, secundária. */
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
        Novo Tanque
      </Button>
      <TanqueFormDrawer aberto={aberto} onAbertoChange={setAberto} fornecedores={fornecedores} />
    </>
  );
}
