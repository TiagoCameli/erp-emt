"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import type { ItemPedidoLinha, PedidoLinha } from "@/modules/frete/pedidos-material/queries";
import { subtotal } from "@/modules/frete/pedidos-material/regras";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";

/** Quantidade como a origem: no mínimo 2 casas (até as 6 que o banco guarda). */
function formatarQuantidadePedido(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

const COLUNAS_ITENS: ColumnDef<ItemPedidoLinha, unknown>[] = [
  {
    id: "material",
    accessorFn: (item) => item.insumoNome || item.insumoId,
    header: "Material",
    size: 260,
    meta: { celular: "titulo" },
    cell: ({ row }) => row.original.insumoNome || row.original.insumoId,
  },
  {
    id: "quantidade",
    accessorFn: (item) => item.quantidade,
    header: "Quantidade",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarQuantidadePedido(row.original.quantidade)}
        {row.original.unidade ? (
          <span className="ml-1 text-muted-foreground">{row.original.unidade}</span>
        ) : null}
      </span>
    ),
  },
  {
    id: "valorUnitario",
    accessorFn: (item) => item.valorUnitario,
    header: "Vlr unitário",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => (
      <span className="tabular-nums">{formatarValorOperacional(row.original.valorUnitario)}</span>
    ),
  },
  {
    id: "subtotal",
    accessorFn: (item) => subtotal(item.quantidade, item.valorUnitario),
    header: "Subtotal",
    size: 140,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => (
      <MoneyText valor={subtotal(row.original.quantidade, row.original.valorUnitario)} />
    ),
  },
];

/**
 * Sub-tabela dos itens do pedido (a linha expandida do PedidoMaterialList da origem):
 * Material, Quantidade, Vlr unitário, Subtotal e as observações.
 *
 * Sem `idDaLinha`: o mesmo insumo pode repetir no pedido, então a posição é a
 * única chave que não colide.
 */
export function PedidoItens({ pedido }: { pedido: PedidoLinha }) {
  return (
    <div className="flex flex-col gap-2">
      {/*
        Em Pedidos de material esta tabela vive dentro de uma célula da listagem,
        cuja linha abre e fecha no clique e no Enter/Espaço. Sem barrar a subida
        do evento, ordenar, alargar coluna ou mexer no menu "Colunas" daqui
        fecharia o pedido no meio do gesto (o evento do portal do menu também
        sobe pela árvore do React).
      */}
      <div onClick={(evento) => evento.stopPropagation()} onKeyDown={(evento) => evento.stopPropagation()}>
        <DataTable
          idTabela="frete.pedidos-material.itens"
          columns={COLUNAS_ITENS}
          data={pedido.itens}
          semPaginacao
        />
      </div>
      {pedido.observacoes ? (
        <p className="text-legenda text-muted-foreground">
          <span className="font-medium">Obs:</span> {pedido.observacoes}
        </p>
      ) : null}
    </div>
  );
}
