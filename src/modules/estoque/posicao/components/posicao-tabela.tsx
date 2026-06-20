"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Boxes } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
} from "@/components/canonicos";
import { formatarQuantidade } from "@/lib/formatadores";
import { ROTULO_TIPO_DEPOSITO } from "@/modules/cadastros/depositos/schemas";
import type { SaldoLista } from "@/modules/estoque/_shared/queries";

export interface PosicaoTabelaProps {
  saldos: SaldoLista[];
  depositos: { id: string; nome: string }[];
}

const COLUNAS: ColumnDef<SaldoLista, unknown>[] = [
  {
    accessorKey: "insumoNome",
    header: "Insumo",
    cell: ({ row }) => (
      <div className="min-w-0">
        {row.original.insumoCodigo ? (
          <span className="mr-1.5 text-legenda text-muted-foreground codigo-doc">
            {row.original.insumoCodigo}
          </span>
        ) : null}
        <span className="font-medium">{row.original.insumoNome}</span>
      </div>
    ),
  },
  {
    accessorKey: "depositoNome",
    header: "Depósito",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span>{row.original.depositoNome}</span>
        <span className="ml-1.5 text-legenda text-muted-foreground">
          {ROTULO_TIPO_DEPOSITO[row.original.depositoTipo]}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "quantidade",
    header: "Quantidade",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarQuantidade(row.original.quantidade)} {row.original.unidadeSigla}
      </span>
    ),
  },
  {
    accessorKey: "valorTotal",
    header: "Valor",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorTotal} />,
  },
];

/**
 * Posição de estoque (somente leitura): busca por insumo (nome ou código) e
 * filtro por depósito, ambos client-side. A tabela pagina sozinha (sem props
 * de paginação server-side), já que os saldos chegam inteiros do servidor.
 */
export function PosicaoTabela({ saldos, depositos }: PosicaoTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [depositoId, setDepositoId] = React.useState("");

  const opcoesDeposito = depositos.map((deposito) => ({
    valor: deposito.id,
    rotulo: deposito.nome,
  }));

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return saldos.filter((saldo) => {
      if (depositoId && saldo.depositoId !== depositoId) return false;
      if (termo) {
        const nome = saldo.insumoNome.toLowerCase();
        const codigo = saldo.insumoCodigo?.toLowerCase() ?? "";
        if (!nome.includes(termo) && !codigo.includes(termo)) return false;
      }
      return true;
    });
  }, [saldos, busca, depositoId]);

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por insumo ou código"
        />
        <FiltroSelect
          valor={depositoId}
          onValorChange={setDepositoId}
          opcoes={opcoesDeposito}
          placeholder="Depósito"
          todosRotulo="Todos os depósitos"
        />
      </FilterBar>

      <DataTable
        columns={COLUNAS}
        data={dados}
        emptyState={
          <EmptyState
            icone={Boxes}
            titulo="Sem saldo em estoque"
            descricao="Quando houver entradas, o saldo de cada insumo aparece aqui."
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
