"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { SecaoFormulario } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import type { FaixaIrrfLista } from "@/modules/rh/parametros-folha/queries";
import { FaixaIrrfFormDrawer } from "./faixa-irrf-form-drawer";
import { FaixasIrrfTabela } from "./faixas-irrf-tabela";

export interface FaixasIrrfSecaoProps {
  faixas: FaixaIrrfLista[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Seção "Faixas de IRRF": tabela ordenada por limite + drawer de
 * criação/edição compartilhado. Nenhum valor de exemplo — a lista nasce
 * vazia até o Tiago cadastrar as faixas oficiais vigentes.
 */
export function FaixasIrrfSecao({
  faixas,
  podeCriar,
  podeEditar,
  podeExcluir,
}: FaixasIrrfSecaoProps) {
  const [editando, setEditando] = React.useState<FaixaIrrfLista | null>(null);
  const [aberto, setAberto] = React.useState(false);

  function abrirCriacao() {
    setEditando(null);
    setAberto(true);
  }

  function abrirEdicao(faixa: FaixaIrrfLista) {
    setEditando(faixa);
    setAberto(true);
  }

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  return (
    <SecaoFormulario
      titulo="Faixas de IRRF"
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
        Cadastre as faixas oficiais vigentes do IRRF, do menor para o maior
        limite salarial.
      </p>

      <FaixasIrrfTabela
        faixas={faixas}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
      />

      <FaixaIrrfFormDrawer
        key={editando?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        faixa={editando}
      />
    </SecaoFormulario>
  );
}
