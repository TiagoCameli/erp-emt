"use client";

import * as React from "react";

import type { FornecedorOpcao, TanqueLinha } from "@/modules/combustivel/tanques/queries";
import { TanqueFormDrawer } from "./tanque-form-drawer";
import { TanquesTabela } from "./tanques-tabela";

export interface TanquesListaProps {
  tanques: TanqueLinha[];
  fornecedores: FornecedorOpcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Tabela de tanques com o drawer de edição compartilhado. */
export function TanquesLista({ tanques, fornecedores, podeEditar, podeExcluir }: TanquesListaProps) {
  const [editando, setEditando] = React.useState<TanqueLinha | null>(null);
  const [aberto, setAberto] = React.useState(false);

  const abrirEdicao = React.useCallback((tanque: TanqueLinha) => {
    setEditando(tanque);
    setAberto(true);
  }, []);

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  return (
    <>
      <TanquesTabela tanques={tanques} podeEditar={podeEditar} podeExcluir={podeExcluir} onEditar={abrirEdicao} />
      {podeEditar ? (
        <TanqueFormDrawer
          key={editando?.id ?? "nenhum"}
          aberto={aberto}
          onAbertoChange={aoMudarAberto}
          tanque={editando}
          fornecedores={fornecedores}
        />
      ) : null}
    </>
  );
}
