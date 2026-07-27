"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { SecaoFormulario } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import type { FaixaInssLista } from "@/modules/rh/parametros-folha/queries";
import { FaixaInssFormDrawer } from "./faixa-inss-form-drawer";
import { FaixasInssTabela } from "./faixas-inss-tabela";

export interface FaixasInssSecaoProps {
  faixas: FaixaInssLista[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Seção "Faixas de INSS": tabela ordenada por limite + drawer de
 * criação/edição compartilhado. Nenhum valor de exemplo — a lista nasce
 * vazia até o Tiago cadastrar as faixas oficiais vigentes.
 */
export function FaixasInssSecao({
  faixas,
  podeCriar,
  podeEditar,
  podeExcluir,
}: FaixasInssSecaoProps) {
  const [editando, setEditando] = React.useState<FaixaInssLista | null>(null);
  const [aberto, setAberto] = React.useState(false);

  function abrirCriacao() {
    setEditando(null);
    setAberto(true);
  }

  function abrirEdicao(faixa: FaixaInssLista) {
    setEditando(faixa);
    setAberto(true);
  }

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  return (
    <SecaoFormulario
      titulo="Faixas de INSS"
      acao={
        podeCriar ? (
          <Button type="button" size="sm" onClick={abrirCriacao}>
            <Plus />
            Nova faixa
          </Button>
        ) : null
      }
    >
      <p className="text-detalhe text-muted-foreground">
        Cadastre as faixas oficiais vigentes do INSS, do menor para o maior
        limite salarial.
      </p>

      <FaixasInssTabela
        faixas={faixas}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
      />

      <FaixaInssFormDrawer
        key={editando?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        faixa={editando}
      />
    </SecaoFormulario>
  );
}
