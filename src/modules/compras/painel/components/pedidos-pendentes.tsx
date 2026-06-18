"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardCheck } from "lucide-react";

import { DataTable, EmptyState } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import type { PedidoResumo } from "@/modules/compras/painel/queries";

const colunas: ColumnDef<PedidoResumo, unknown>[] = [
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
    accessorKey: "justificativa",
    header: "Justificativa",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.justificativa ? (
        <span className="line-clamp-1">{row.original.justificativa}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "criadoEm",
    header: "Criado em",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="tabular-nums">{formatarData(row.original.criadoEm)}</span>
    ),
  },
];

/** Lista compacta dos pedidos aguardando aprovação, leva à tela de pedidos. */
export function PedidosPendentes({ pedidos }: { pedidos: PedidoResumo[] }) {
  const router = useRouter();

  if (pedidos.length === 0) {
    return (
      <EmptyState
        icone={ClipboardCheck}
        titulo="Nenhum pedido pendente"
        descricao="Quando um pedido entrar para aprovação, ele aparece aqui."
      />
    );
  }

  return (
    <DataTable
      columns={colunas}
      data={pedidos}
      pageSize={pedidos.length}
      onRowClick={() => router.push("/compras/pedidos")}
    />
  );
}
