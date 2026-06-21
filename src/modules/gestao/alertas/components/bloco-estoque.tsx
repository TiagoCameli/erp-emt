"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { PackageCheck } from "lucide-react";

import { formatarQuantidade } from "@/lib/formatadores";
import { BlocoAlerta } from "@/modules/gestao/alertas/components/bloco-alerta";
import type { EstoqueCriticoItem } from "@/modules/gestao/alertas/queries";

const COLUNAS: ColumnDef<EstoqueCriticoItem, unknown>[] = [
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
  },
  {
    accessorKey: "quantidade",
    header: "Saldo",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums text-status-rejeitado">
        {formatarQuantidade(row.original.quantidade)}{" "}
        {row.original.unidadeSigla}
      </span>
    ),
  },
  {
    accessorKey: "minimo",
    header: "Mínimo",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarQuantidade(row.original.minimo)} {row.original.unidadeSigla}
      </span>
    ),
  },
];

export function BlocoEstoque({
  itens,
  total,
}: {
  itens: EstoqueCriticoItem[];
  total: number;
}) {
  return (
    <BlocoAlerta
      titulo="Estoque crítico"
      total={total}
      itens={itens}
      colunas={COLUNAS}
      href="/estoque/alertas"
      iconeVazio={PackageCheck}
      tituloVazio="Estoque dentro do mínimo"
      descricaoVazia="Nenhum insumo abaixo do estoque mínimo definido."
    />
  );
}
