"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importar,
  validarImport,
} from "@/modules/cadastros/depositos/actions";
import { DepositosFormDrawer } from "@/modules/cadastros/depositos/components/depositos-form-drawer";
import type {
  InsumoOpcao,
  ObraOpcao,
} from "@/modules/cadastros/depositos/queries";

export interface DepositosHeaderAcoesProps {
  obras: ObraOpcao[];
  insumos: InsumoOpcao[];
  podeCriar: boolean;
}

/**
 * Ações do cabeçalho: importar planilha e criar depósito. Carrega o próprio
 * drawer de criação (a edição fica no menu de cada linha da tabela).
 */
export function DepositosHeaderAcoes({
  obras,
  insumos,
  podeCriar,
}: DepositosHeaderAcoesProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      {podeCriar ? (
        <ImportarCadastro
          titulo="Importar depósitos"
          modeloHref="/cadastros/depositos/modelo"
          validarAction={validarImport}
          importarAction={importar}
        />
      ) : null}
      {podeCriar ? (
        <Button type="button" size="sm" onClick={() => setAberto(true)}>
          <Plus />
          Novo depósito
        </Button>
      ) : null}
      {podeCriar ? (
        <DepositosFormDrawer
          aberto={aberto}
          onAbertoChange={setAberto}
          obras={obras}
          insumos={insumos}
        />
      ) : null}
    </>
  );
}
