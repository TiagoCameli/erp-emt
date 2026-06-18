"use client";

import * as React from "react";

import type { UnidadeLista } from "@/modules/cadastros/unidades/queries";
import { UnidadesFormDrawer } from "./unidades-form-drawer";
import { UnidadesTabela } from "./unidades-tabela";

export interface UnidadesListaProps {
  unidades: UnidadeLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Lista de unidades + drawer de edição compartilhado. Clicar em "Editar"
 * numa linha abre o drawer com a unidade selecionada.
 */
export function UnidadesLista({
  unidades,
  podeEditar,
  podeExcluir,
}: UnidadesListaProps) {
  const [editando, setEditando] = React.useState<UnidadeLista | null>(null);
  const [aberto, setAberto] = React.useState(false);

  function abrirEdicao(unidade: UnidadeLista) {
    setEditando(unidade);
    setAberto(true);
  }

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  return (
    <>
      <UnidadesTabela
        unidades={unidades}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
      />

      <UnidadesFormDrawer
        key={editando?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        unidade={editando}
      />
    </>
  );
}
