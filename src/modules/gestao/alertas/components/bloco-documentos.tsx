"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck } from "lucide-react";

import { formatarData } from "@/lib/formatadores";
import { BadgeSituacao } from "@/modules/gestao/alertas/components/badge-situacao";
import { BlocoAlerta } from "@/modules/gestao/alertas/components/bloco-alerta";
import type { DocumentoAlertaItem } from "@/modules/gestao/alertas/queries";

const COLUNAS: ColumnDef<DocumentoAlertaItem, unknown>[] = [
  {
    accessorKey: "colaboradorNome",
    header: "Colaborador",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.colaboradorNome}</span>
    ),
  },
  {
    accessorKey: "descricao",
    header: "Documento",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span>{row.original.descricao}</span>
        {row.original.tipo ? (
          <span className="ml-1.5 text-legenda text-muted-foreground">
            {row.original.tipo}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "dataVencimento",
    header: "Vencimento",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.dataVencimento)}
      </span>
    ),
  },
  {
    accessorKey: "situacao",
    header: "Situação",
    cell: ({ row }) => <BadgeSituacao situacao={row.original.situacao} />,
  },
];

export function BlocoDocumentos({
  itens,
  total,
}: {
  itens: DocumentoAlertaItem[];
  total: number;
}) {
  return (
    <BlocoAlerta
      titulo="Documentos vencendo"
      total={total}
      itens={itens}
      colunas={COLUNAS}
      href="/rh/documentos"
      iconeVazio={ShieldCheck}
      tituloVazio="Documentos em dia"
      descricaoVazia="Nenhum documento vencido ou vencendo nos próximos 30 dias."
    />
  );
}
