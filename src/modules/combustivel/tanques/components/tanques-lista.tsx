"use client";

import * as React from "react";

import { EsvaziamentoFormDrawer } from "@/modules/combustivel/esvaziamentos/components/esvaziamento-form-drawer";
import { podeEsvaziar as temCombustivelParaEsvaziar } from "@/modules/combustivel/esvaziamentos/schemas";
import type { FornecedorOpcao, TanqueLinha } from "@/modules/combustivel/tanques/queries";
import { TanqueFormDrawer } from "./tanque-form-drawer";
import { TanquesTabela } from "./tanques-tabela";

export interface TanquesListaProps {
  tanques: TanqueLinha[];
  fornecedores: FornecedorOpcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** `combustivel.esvaziamentos`/criar: o "Esvaziar tanque" da linha (origem: TanqueList). */
  podeEsvaziar?: boolean;
}

/** Tabela de tanques com os drawers de edição e de esvaziamento compartilhados. */
export function TanquesLista({ tanques, fornecedores, podeEditar, podeExcluir, podeEsvaziar = false }: TanquesListaProps) {
  const [editando, setEditando] = React.useState<TanqueLinha | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [esvaziando, setEsvaziando] = React.useState<TanqueLinha | null>(null);

  const abrirEdicao = React.useCallback((tanque: TanqueLinha) => {
    setEditando(tanque);
    setAberto(true);
  }, []);

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  const esvaziaveis = React.useMemo(
    () =>
      tanques.filter(temCombustivelParaEsvaziar).map((t) => ({
        id: t.id,
        nome: t.nome,
        nivel: t.nivel,
        combustivelNome: t.combustivelNome,
      })),
    [tanques],
  );

  return (
    <>
      <TanquesTabela
        tanques={tanques}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
        onEsvaziar={podeEsvaziar ? setEsvaziando : undefined}
      />
      {podeEditar ? (
        <TanqueFormDrawer
          key={editando?.id ?? "nenhum"}
          aberto={aberto}
          onAbertoChange={aoMudarAberto}
          tanque={editando}
          fornecedores={fornecedores}
        />
      ) : null}
      {podeEditar && podeEsvaziar ? (
        <EsvaziamentoFormDrawer
          key={esvaziando?.id ?? "nenhum"}
          aberto={esvaziando !== null}
          onAbertoChange={(novoAberto) => {
            if (!novoAberto) setEsvaziando(null);
          }}
          tanques={esvaziaveis}
          tanqueInicialId={esvaziando?.id}
        />
      ) : null}
    </>
  );
}
