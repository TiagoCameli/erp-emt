"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BellOff } from "lucide-react";

import { DataTable, EmptyState, StatusBadge } from "@/components/canonicos";
import { ROTULO_GRAVIDADE, ROTULO_TIPO_ALERTA, fraseAlerta } from "@/modules/medicao/alertas/formato";
import type { AlertaLinha } from "@/modules/medicao/alertas/tipos";

const COR_GRAVIDADE: Record<string, string> = { alta: "rejeitado", media: "pendente_aprovacao", baixa: "rascunho" };

const colunas: ColumnDef<AlertaLinha, unknown>[] = [
  {
    accessorKey: "codigo",
    header: "Contrato",
    size: 110,
    meta: { fixa: true, atomico: true },
    cell: ({ row }) => <span className="font-mono font-medium">{row.original.codigo}</span>,
  },
  {
    accessorKey: "gravidade",
    header: "Gravidade",
    size: 120,
    meta: { atomico: true },
    cell: ({ row }) => (
      <StatusBadge
        status={COR_GRAVIDADE[row.original.gravidade] ?? row.original.gravidade}
        rotulo={ROTULO_GRAVIDADE[row.original.gravidade] ?? row.original.gravidade}
      />
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    size: 260,
    cell: ({ row }) => ROTULO_TIPO_ALERTA[row.original.tipo] ?? row.original.tipo,
  },
  {
    id: "mensagem",
    header: "O que aconteceu",
    size: 520,
    cell: ({ row }) => <span className="tabular-nums">{fraseAlerta(row.original)}</span>,
  },
];

function idDaLinha(a: AlertaLinha): string {
  return a.chave;
}

export function AlertasTabela({ alertas }: { alertas: AlertaLinha[] }) {
  return (
    <DataTable
      idTabela="medicao.alertas"
      columns={colunas}
      data={alertas}
      idDaLinha={idDaLinha}
      cabecalhoFixo
      emptyState={
        <EmptyState
          icone={BellOff}
          titulo="Nenhum alerta"
          descricao="Nenhum contrato passou de uma regra de alerta"
          className="border-none bg-transparent"
        />
      }
    />
  );
}
