"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { CelulaVazia, DataTable, MoneyText } from "@/components/canonicos";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import type { MaiorCusto } from "../queries";

/**
 * Os maiores lançamentos a pagar do período, com link para o lançamento. É um
 * recorte fixo de leitura: não tem filtro, e quem quer a lista inteira abre o
 * Financeiro. Mesmo assim usa a DataTable, porque o Tiago pediu (12/10/2026) que
 * toda tabela do app seja ajustável: largura, ordem, colunas e altura ficam com
 * o usuário e são lembradas. Por ser um ranking plano, ordenar pela coluna é
 * permitido; a ordem de chegada (maior valor primeiro) é a da consulta.
 *
 * Com centro de custo filtrado, o valor é a FATIA que caiu no recorte, e não o
 * documento inteiro. Documento partido entre mais de um centro do recorte ganha
 * a marca "fatia" ao lado do número: sem ela, alguém compararia esse valor com o
 * da nota fiscal e concluiria que a tela está errada.
 */
export function MaioresCustosTabela({ custos }: { custos: MaiorCusto[] }) {
  const colunas = React.useMemo<ColumnDef<MaiorCusto, unknown>[]>(
    () => [
      {
        accessorKey: "numero",
        header: "Documento",
        size: 140,
        cell: ({ row }) => (
          <Link
            href={`/financeiro/lancamentos/${row.original.id}`}
            className="codigo-doc text-detalhe text-muted-foreground hover:text-foreground hover:underline"
          >
            {row.original.numero ?? <CelulaVazia />}
          </Link>
        ),
      },
      {
        accessorKey: "descricao",
        header: "Descrição",
        size: 288,
        cell: ({ row }) => (
          <span className="text-detalhe text-foreground">
            {row.original.descricao}
          </span>
        ),
      },
      {
        accessorKey: "fornecedor",
        header: "Fornecedor",
        size: 224,
        cell: ({ row }) => (
          <span className="text-detalhe text-muted-foreground">
            {row.original.fornecedor ?? <CelulaVazia />}
          </span>
        ),
      },
      {
        accessorKey: "mesCompetencia",
        header: "Competência",
        size: 130,
        meta: { atomico: true },
        cell: ({ row }) => (
          <span className="text-detalhe tabular-nums text-muted-foreground">
            {formatarMesAno(row.original.mesCompetencia)}
          </span>
        ),
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        size: 130,
        meta: { atomico: true },
        cell: ({ row }) => (
          <span className="text-detalhe tabular-nums text-muted-foreground">
            {row.original.dataVencimento ? (
              formatarData(row.original.dataVencimento)
            ) : (
              <CelulaVazia />
            )}
          </span>
        ),
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 170,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => (
          <>
            <MoneyText valor={row.original.valor} className="text-detalhe" />
            {row.original.centros > 1 ? (
              <span
                className="ml-1.5 text-legenda text-muted-foreground"
                title={`Rateado em ${row.original.centros} centros de custo do recorte`}
              >
                fatia
              </span>
            ) : null}
          </>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      idTabela="gestao.maiores-custos"
      columns={colunas}
      data={custos}
      idDaLinha={(custo) => custo.id}
      semPaginacao
    />
  );
}
