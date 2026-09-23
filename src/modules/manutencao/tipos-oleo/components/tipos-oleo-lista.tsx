"use client";

import * as React from "react";

import type { TipoOleoLista } from "@/modules/manutencao/tipos-oleo/queries";
import { TiposOleoFormDrawer } from "./tipos-oleo-form-drawer";
import { TiposOleoTabela } from "./tipos-oleo-tabela";

export interface TiposOleoListaProps {
  tipos: TipoOleoLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Tabela de tipos de óleo com o drawer de edição compartilhado. */
export function TiposOleoLista({ tipos, podeEditar, podeExcluir }: TiposOleoListaProps) {
  const [editando, setEditando] = React.useState<TipoOleoLista | null>(null);
  const [aberto, setAberto] = React.useState(false);

  const abrirEdicao = React.useCallback((tipo: TipoOleoLista) => {
    setEditando(tipo);
    setAberto(true);
  }, []);

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  return (
    <>
      <TiposOleoTabela tipos={tipos} podeEditar={podeEditar} podeExcluir={podeExcluir} onEditar={abrirEdicao} />
      <TiposOleoFormDrawer
        key={editando?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        tipo={editando}
      />
    </>
  );
}
