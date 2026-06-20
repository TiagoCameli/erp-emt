"use client";

import { PackageMinus } from "lucide-react";

import {
  colunaCentroCusto,
  colunaCustoTotal,
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
  colunaCentroCusto,
  colunaCustoTotal,
];

export interface SaidasTabelaProps {
  movimentos: MovimentoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  insumoId: string;
  depositoId: string;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/** Listagem das saídas e consumos de estoque. */
export function SaidasTabela(props: SaidasTabelaProps) {
  return (
    <MovimentosTabela
      {...props}
      colunas={COLUNAS}
      vazio={{
        icone: PackageMinus,
        titulo: "Nenhuma saída",
        descricao: "Registre a primeira saída ou consumo de material.",
      }}
    />
  );
}
