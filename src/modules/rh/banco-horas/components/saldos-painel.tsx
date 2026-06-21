"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Scale } from "lucide-react";

import { DataTable, EmptyState } from "@/components/canonicos";
import { formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import type { SaldoColaborador } from "@/modules/rh/banco-horas/queries";

export interface SaldosPainelProps {
  saldos: SaldoColaborador[];
}

/** Saldo formatado com "h"; negativo em vermelho. */
function SaldoHoras({ saldo }: { saldo: number }) {
  return (
    <span
      className={cn(
        "tabular-nums font-medium",
        saldo < 0 ? "text-status-rejeitado" : "text-foreground",
      )}
    >
      {formatarQuantidade(saldo)} h
    </span>
  );
}

/**
 * Painel de saldos do banco de horas: um saldo por colaborador (créditos menos
 * débitos). Saldo negativo aparece em vermelho.
 */
export function SaldosPainel({ saldos }: SaldosPainelProps) {
  const colunas = React.useMemo<ColumnDef<SaldoColaborador, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "saldo",
        header: "Saldo",
        meta: { alinharDireita: true },
        cell: ({ row }) => <SaldoHoras saldo={row.original.saldo} />,
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={colunas}
      data={saldos}
      emptyState={
        <EmptyState
          icone={Scale}
          titulo="Nenhum saldo a exibir"
          descricao="Os saldos aparecem aqui assim que houver movimentos de banco de horas."
        />
      }
    />
  );
}
