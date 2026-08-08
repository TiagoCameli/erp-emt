"use client";

import * as React from "react";

import type { EncargoLista } from "@/modules/rh/encargos/queries";
import { EncargoFormDrawer } from "./encargo-form-drawer";
import { EncargosTabela } from "./encargos-tabela";

export interface EncargosListaProps {
  encargos: EncargoLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Grupos de recolhimento já cadastrados, para o Combobox do drawer de edição. */
  grupos: string[];
}

/**
 * Lista de encargos + drawer de edição compartilhado. Clicar em "Editar"
 * numa linha abre o drawer com o encargo selecionado.
 */
export function EncargosLista({
  encargos,
  podeEditar,
  podeExcluir,
  grupos,
}: EncargosListaProps) {
  const [editando, setEditando] = React.useState<EncargoLista | null>(null);
  const [aberto, setAberto] = React.useState(false);

  function abrirEdicao(encargo: EncargoLista) {
    setEditando(encargo);
    setAberto(true);
  }

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  return (
    <>
      <EncargosTabela
        encargos={encargos}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
      />

      <EncargoFormDrawer
        key={editando?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        encargo={editando}
        grupos={grupos}
      />
    </>
  );
}
