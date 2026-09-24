"use client";

import * as React from "react";

import type { FornecedorOpcao, LocalidadeLista } from "@/modules/cadastros/localidades/queries";
import { LocalidadesFormDrawer } from "./localidades-form-drawer";
import { LocalidadesTabela } from "./localidades-tabela";

export interface LocalidadesListaProps {
  localidades: LocalidadeLista[];
  fornecedores: FornecedorOpcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Lista de localidades + drawer de edição compartilhado. Clicar em "Editar"
 * numa linha abre o drawer com a localidade selecionada.
 */
export function LocalidadesLista({
  localidades,
  fornecedores,
  podeEditar,
  podeExcluir,
}: LocalidadesListaProps) {
  const [editando, setEditando] = React.useState<LocalidadeLista | null>(null);
  const [aberto, setAberto] = React.useState(false);

  function abrirEdicao(localidade: LocalidadeLista) {
    setEditando(localidade);
    setAberto(true);
  }

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  return (
    <>
      <LocalidadesTabela
        localidades={localidades}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
      />

      <LocalidadesFormDrawer
        key={editando?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        localidade={editando}
        fornecedores={fornecedores}
      />
    </>
  );
}
