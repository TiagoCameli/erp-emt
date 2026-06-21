"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Wallet } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { BlocoAlerta } from "@/modules/gestao/alertas/components/bloco-alerta";
import type { FaturaAlertaItem } from "@/modules/gestao/alertas/queries";

const COLUNAS: ColumnDef<FaturaAlertaItem, unknown>[] = [
  {
    accessorKey: "descricao",
    header: "Recebível",
    cell: ({ row }) => (
      <div className="min-w-0">
        {row.original.numero ? (
          <span className="mr-1.5 text-legenda text-muted-foreground codigo-doc">
            {row.original.numero}
          </span>
        ) : null}
        <span className="font-medium">{row.original.descricao}</span>
      </div>
    ),
  },
  {
    accessorKey: "dataVencimento",
    header: "Vencimento",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums text-status-rejeitado">
        {formatarData(row.original.dataVencimento)}
      </span>
    ),
  },
  {
    accessorKey: "valor",
    header: "Valor",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valor} />,
  },
];

export function BlocoFaturas({
  itens,
  total,
}: {
  itens: FaturaAlertaItem[];
  total: number;
}) {
  return (
    <BlocoAlerta
      titulo="Faturas vencidas"
      total={total}
      itens={itens}
      colunas={COLUNAS}
      href="/financeiro/contas-receber"
      iconeVazio={Wallet}
      tituloVazio="Nada vencido a receber"
      descricaoVazia="Nenhuma parcela a receber vencida em aberto."
    />
  );
}
