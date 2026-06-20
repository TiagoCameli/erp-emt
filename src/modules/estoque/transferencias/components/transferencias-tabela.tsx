"use client";

import { ArrowLeftRight } from "lucide-react";

import {
  colunaCustoTotal,
  colunaData,
  colunaDeposito,
  colunaDestino,
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
  { ...colunaDeposito, header: "Origem" },
  colunaDestino,
  colunaQuantidade,
  colunaCustoTotal,
];

export interface TransferenciasTabelaProps {
  movimentos: MovimentoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  insumoId: string;
  depositoId: string;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/** Listagem das transferências de estoque entre depósitos. */
export function TransferenciasTabela(props: TransferenciasTabelaProps) {
  return (
    <MovimentosTabela
      {...props}
      colunas={COLUNAS}
      vazio={{
        icone: ArrowLeftRight,
        titulo: "Nenhuma transferência",
        descricao: "Mova material entre depósitos preservando o custo.",
      }}
    />
  );
}
