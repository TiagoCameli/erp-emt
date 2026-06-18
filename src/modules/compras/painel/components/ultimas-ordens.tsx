"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ShoppingCart } from "lucide-react";

import {
  DataTable,
  EmptyState,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { infoStatusOC } from "@/modules/compras/_shared/formato";
import type { OrdemResumo } from "@/modules/compras/painel/queries";

const colunas: ColumnDef<OrdemResumo, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Número",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.numero ? (
        <span className="codigo-doc">{row.original.numero}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "fornecedorNome",
    header: "Fornecedor",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.fornecedorNome ? (
        <span className="font-medium">{row.original.fornecedorNome}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "dataEmissao",
    header: "Emissão",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.dataEmissao)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    enableSorting: false,
    cell: ({ row }) => {
      const info = infoStatusOC(row.original.status);
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "valorTotal",
    header: "Valor",
    enableSorting: false,
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorTotal} />,
  },
];

/** Lista compacta das últimas ordens, cada linha leva à tela de ordens. */
export function UltimasOrdens({ ordens }: { ordens: OrdemResumo[] }) {
  const router = useRouter();

  if (ordens.length === 0) {
    return (
      <EmptyState
        icone={ShoppingCart}
        titulo="Nenhuma ordem de compra"
        descricao="As ordens emitidas aparecem aqui assim que forem criadas."
      />
    );
  }

  return (
    <DataTable
      columns={colunas}
      data={ordens}
      pageSize={ordens.length}
      onRowClick={() => router.push("/compras/ordens")}
    />
  );
}
