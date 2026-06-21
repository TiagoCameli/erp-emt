"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CalendarCheck } from "lucide-react";

import { formatarData } from "@/lib/formatadores";
import { BadgeSituacao } from "@/modules/gestao/alertas/components/badge-situacao";
import { BlocoAlerta } from "@/modules/gestao/alertas/components/bloco-alerta";
import type { FeriasAlertaItem } from "@/modules/gestao/alertas/queries";

const COLUNAS: ColumnDef<FeriasAlertaItem, unknown>[] = [
  {
    accessorKey: "colaboradorNome",
    header: "Colaborador",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.colaboradorNome}</span>
    ),
  },
  {
    accessorKey: "dias",
    header: "Dias",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.dias}</span>
    ),
  },
  {
    accessorKey: "limiteGozo",
    header: "Limite de gozo",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.limiteGozo)}
      </span>
    ),
  },
  {
    accessorKey: "situacao",
    header: "Situação",
    cell: ({ row }) => <BadgeSituacao situacao={row.original.situacao} />,
  },
];

export function BlocoFerias({
  itens,
  total,
}: {
  itens: FeriasAlertaItem[];
  total: number;
}) {
  return (
    <BlocoAlerta
      titulo="Férias vencendo"
      total={total}
      itens={itens}
      colunas={COLUNAS}
      href="/rh/ferias"
      iconeVazio={CalendarCheck}
      tituloVazio="Férias em dia"
      descricaoVazia="Nenhuma férias vencida ou vencendo nos próximos 60 dias."
    />
  );
}
