"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import type { LinhaMaiorCusto } from "@/modules/manutencao/painel/queries";

export interface LinhaMaiorCustoComLink extends LinhaMaiorCusto {
  /** Caderno filtrado no equipamento e no ano; null sem permissão de ver o caderno. */
  href: string | null;
}

interface LinhaRanking extends LinhaMaiorCustoComLink {
  posicao: number;
}

/** É um ranking (o maior custo primeiro): a ordem é a informação, nenhuma coluna ordena. */
const COLUNAS: ColumnDef<LinhaRanking, unknown>[] = [
  {
    id: "posicao",
    header: "#",
    size: 48,
    enableSorting: false,
    // No celular a ordem dos cards já é a posição.
    meta: { alinharDireita: true, atomico: true, celular: "oculta" },
    cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.posicao}</span>,
  },
  {
    id: "equipamento",
    header: "Equipamento",
    size: 280,
    enableSorting: false,
    meta: { celular: "titulo" },
    cell: ({ row }) =>
      row.original.href ? (
        <Link className="font-medium hover:underline" href={row.original.href}>
          {row.original.equipamentoNome}
        </Link>
      ) : (
        <span className="font-medium">{row.original.equipamentoNome}</span>
      ),
  },
  {
    id: "quantidadeOs",
    header: "OS concluídas",
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{row.original.quantidadeOs}</span>,
  },
  {
    id: "custo",
    header: "Custo no ano",
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <MoneyText valor={row.original.custo} />,
  },
];

/** Maiores custos por equipamento no ano, do painel da Manutenção. */
export function MaioresCustosTabela({ linhas }: { linhas: LinhaMaiorCustoComLink[] }) {
  const dados: LinhaRanking[] = linhas.map((linha, indice) => ({ ...linha, posicao: indice + 1 }));
  return (
    <DataTable
      idTabela="manutencao.painel.maiores-custos"
      columns={COLUNAS}
      data={dados}
      idDaLinha={(linha) => linha.equipamentoId}
      semPaginacao
    />
  );
}
