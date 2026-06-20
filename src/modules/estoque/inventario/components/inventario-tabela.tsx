"use client";

import { ClipboardCheck } from "lucide-react";

import {
  colunaData,
  colunaDeposito,
  colunaInsumo,
  colunaObservacao,
  colunaQuantidade,
  colunaTipo,
  MovimentosTabela,
} from "@/modules/estoque/_shared/components/movimentos-tabela";
import type {
  DepositoOpcao,
  InsumoOpcao,
  MovimentoLista,
} from "@/modules/estoque/_shared/queries";

const COLUNAS = [
  colunaData,
  colunaTipo,
  colunaInsumo,
  colunaDeposito,
  colunaQuantidade,
  colunaObservacao,
];

export interface InventarioTabelaProps {
  movimentos: MovimentoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  insumoId: string;
  depositoId: string;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/** Listagem dos ajustes de inventário de estoque. */
export function InventarioTabela(props: InventarioTabelaProps) {
  return (
    <MovimentosTabela
      {...props}
      colunas={COLUNAS}
      vazio={{
        icone: ClipboardCheck,
        titulo: "Nenhum ajuste",
        descricao:
          "Ajustes de inventário aparecem aqui, com o motivo registrado.",
      }}
    />
  );
}
