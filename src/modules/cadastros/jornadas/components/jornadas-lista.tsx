"use client";

import * as React from "react";

import type { JornadaLista } from "@/modules/cadastros/jornadas/queries";
import { JornadaFormDrawer } from "./jornada-form-drawer";
import { JornadasTabela } from "./jornadas-tabela";

export interface JornadasListaProps {
  jornadas: JornadaLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Lista de jornadas + drawer de edição compartilhado. Clicar em "Editar"
 * numa linha abre o drawer com a jornada selecionada.
 */
export function JornadasLista({
  jornadas,
  podeEditar,
  podeExcluir,
}: JornadasListaProps) {
  const [editando, setEditando] = React.useState<JornadaLista | null>(null);
  const [aberto, setAberto] = React.useState(false);

  function abrirEdicao(jornada: JornadaLista) {
    setEditando(jornada);
    setAberto(true);
  }

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  return (
    <>
      <JornadasTabela
        jornadas={jornadas}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
      />

      <JornadaFormDrawer
        key={editando?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        jornada={editando}
      />
    </>
  );
}
