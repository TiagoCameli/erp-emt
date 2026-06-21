"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Wrench } from "lucide-react";

import { StatusBadge } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { STATUS_OS, type StatusOS } from "@/modules/manutencao/_shared/formato";
import { BlocoAlerta } from "@/modules/gestao/alertas/components/bloco-alerta";
import type { OrdemAlertaItem } from "@/modules/gestao/alertas/queries";

function comoStatusOS(status: string): StatusOS {
  return status === "em_execucao" ? "em_execucao" : "aberta";
}

const COLUNAS: ColumnDef<OrdemAlertaItem, unknown>[] = [
  {
    accessorKey: "equipamentoDescricao",
    header: "Equipamento",
    cell: ({ row }) => (
      <div className="min-w-0">
        {row.original.numero ? (
          <span className="mr-1.5 text-legenda text-muted-foreground codigo-doc">
            {row.original.numero}
          </span>
        ) : null}
        <span className="font-medium">{row.original.equipamentoDescricao}</span>
      </div>
    ),
  },
  {
    accessorKey: "dataAbertura",
    header: "Aberta em",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.dataAbertura)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Situação",
    cell: ({ row }) => {
      const formato = STATUS_OS[comoStatusOS(row.original.status)];
      return <StatusBadge status={formato.badge} rotulo={formato.rotulo} />;
    },
  },
];

export function BlocoOrdens({
  itens,
  total,
}: {
  itens: OrdemAlertaItem[];
  total: number;
}) {
  return (
    <BlocoAlerta
      titulo="Ordens de serviço abertas"
      total={total}
      itens={itens}
      colunas={COLUNAS}
      href="/manutencao/ordens-servico"
      iconeVazio={Wrench}
      tituloVazio="Nenhuma OS aberta"
      descricaoVazia="Nenhuma ordem de serviço aberta ou em execução."
    />
  );
}
