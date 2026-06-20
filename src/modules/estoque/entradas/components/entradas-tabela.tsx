"use client";

import { PackagePlus } from "lucide-react";

import {
  colunaCustoTotal,
  colunaCustoUnitario,
  colunaData,
  colunaDeposito,
  colunaInsumo,
  colunaQuantidade,
  MovimentosTabela,
} from "@/modules/estoque/_shared/components/movimentos-tabela";
import type {
  DepositoOpcao,
  InsumoOpcao,
  MovimentoLista,
} from "@/modules/estoque/_shared/queries";

const COLUNAS = [
  colunaData,
  colunaInsumo,
  colunaDeposito,
  colunaQuantidade,
  colunaCustoUnitario,
  colunaCustoTotal,
];

export interface EntradasTabelaProps {
  movimentos: MovimentoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  insumoId: string;
  depositoId: string;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/** Listagem das entradas de estoque. */
export function EntradasTabela(props: EntradasTabelaProps) {
  return (
    <MovimentosTabela
      {...props}
      colunas={COLUNAS}
      vazio={{
        icone: PackagePlus,
        titulo: "Nenhuma entrada",
        descricao:
          "Registre a primeira entrada de material no depósito para começar.",
      }}
    />
  );
}
