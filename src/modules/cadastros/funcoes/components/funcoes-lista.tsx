"use client";

import * as React from "react";

import type { FuncaoLista } from "@/modules/cadastros/funcoes/queries";
import { FuncaoFormDrawer } from "./funcao-form-drawer";
import { FuncoesTabela } from "./funcoes-tabela";

export interface FuncoesListaProps {
  funcoes: FuncaoLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Lista de funções + drawer de edição compartilhado. Clicar em "Editar"
 * numa linha abre o drawer com a função selecionada.
 */
export function FuncoesLista({
  funcoes,
  podeEditar,
  podeExcluir,
}: FuncoesListaProps) {
  const [editando, setEditando] = React.useState<FuncaoLista | null>(null);
  const [aberto, setAberto] = React.useState(false);

  function abrirEdicao(funcao: FuncaoLista) {
    setEditando(funcao);
    setAberto(true);
  }

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  return (
    <>
      <FuncoesTabela
        funcoes={funcoes}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
      />

      <FuncaoFormDrawer
        key={editando?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        funcao={editando}
      />
    </>
  );
}
