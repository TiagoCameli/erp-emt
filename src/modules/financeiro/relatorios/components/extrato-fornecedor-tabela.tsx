"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  colunaDinheiro,
  DataTable,
  EmptyState,
  StatusBadge,
} from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import {
  STATUS_LANCAMENTO,
  type StatusLancamento,
} from "@/modules/financeiro/_shared/formato";
import type { ExtratoLancamento } from "../queries";

interface ExtratoFornecedorTabelaProps {
  lancamentos: ExtratoLancamento[];
}

function formatoStatus(status: string): {
  badge: StatusLancamento | string;
  rotulo: string;
} {
  const formato = STATUS_LANCAMENTO[status as StatusLancamento];
  return formato
    ? { badge: formato.badge, rotulo: formato.rotulo }
    : { badge: status, rotulo: status };
}

/**
 * Extrato de lançamentos a pagar do fornecedor: número, descrição, status,
 * competência, vencimento e valor. Ordenável e com busca pela descrição.
 */
export function ExtratoFornecedorTabela({
  lancamentos,
}: ExtratoFornecedorTabelaProps) {
  const colunas = React.useMemo<ColumnDef<ExtratoLancamento, unknown>[]>(
    () => [
      {
        accessorKey: "numero",
        header: "Número",
        cell: ({ row }) => (
          <span className="font-mono text-detalhe">
            {row.original.numero ?? "-"}
          </span>
        ),
      },
      {
        accessorKey: "descricao",
        header: "Descrição",
        cell: ({ row }) => row.original.descricao,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const { badge, rotulo } = formatoStatus(row.original.status);
          return <StatusBadge status={badge} rotulo={rotulo} />;
        },
      },
      {
        accessorKey: "competencia",
        header: "Competência",
        cell: ({ row }) => formatarData(row.original.competencia),
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        cell: ({ row }) => formatarData(row.original.dataVencimento),
      },
      colunaDinheiro<ExtratoLancamento>("valor", "Valor"),
    ],
    [],
  );

  return (
    <DataTable
      columns={colunas}
      data={lancamentos}
      searchKey="descricao"
      searchPlaceholder="Buscar pela descrição"
      emptyState={
        <EmptyState
          titulo="Sem lançamentos"
          descricao="Nenhum lançamento a pagar para este fornecedor."
        />
      }
    />
  );
}
