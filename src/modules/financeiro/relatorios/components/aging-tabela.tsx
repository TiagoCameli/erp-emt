"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { drillAging } from "@/modules/financeiro/relatorios/drill";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import type { Aging } from "../queries";

interface AgingTabelaProps {
  aging: Aging;
  /** Sem permissão de ver lançamentos, o valor não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

/** Uma faixa de vencimento com as duas colunas lado a lado. */
interface LinhaAging {
  faixa: Aging["aPagar"][number]["faixa"];
  rotulo: string;
  aPagar: number;
  aReceber: number;
}

/**
 * O valor da faixa, que vira link para as parcelas dela.
 *
 * Faixa zerada não vira link: abriria uma lista vazia, o que é um clique que
 * não leva a nada.
 */
function ValorDaFaixa({
  linha,
  tipo,
  podeVerLancamentos,
}: {
  linha: LinhaAging;
  tipo: "a_pagar" | "a_receber";
  podeVerLancamentos: boolean;
}) {
  const valor = tipo === "a_pagar" ? linha.aPagar : linha.aReceber;
  const dinheiro = <MoneyText valor={valor} className="text-detalhe" />;
  if (valor <= 0 || !podeVerLancamentos) return dinheiro;
  return (
    <LinkDrill
      href={drillAging({ faixa: linha.faixa, tipo })}
      titulo={`Ver as parcelas ${tipo === "a_pagar" ? "a pagar" : "a receber"} ${linha.rotulo.toLowerCase()}`}
    >
      {dinheiro}
    </LinkDrill>
  );
}

/**
 * Aging em tabela: uma linha por faixa, colunas a pagar e a receber.
 *
 * O link fica no VALOR, e não na faixa, porque a faixa é a mesma nas duas colunas
 * e o que se clica é "esses R$ X a pagar vencidos 8 a 15 dias" — a coluna faz
 * parte da identidade do que abre.
 */
export function AgingTabela({ aging, podeVerLancamentos }: AgingTabelaProps) {
  const linhas = React.useMemo<LinhaAging[]>(
    () =>
      aging.aPagar.map((faixa, indice) => ({
        faixa: faixa.faixa,
        rotulo: faixa.rotulo,
        aPagar: faixa.valor,
        aReceber: aging.aReceber[indice]?.valor ?? 0,
      })),
    [aging],
  );

  const colunas = React.useMemo<ColumnDef<LinhaAging, unknown>[]>(
    () => [
      {
        accessorKey: "rotulo",
        header: "Faixa de vencimento",
        size: 220,
        // As faixas têm ordem própria (do vencido ao que vence depois); em
        // ordem alfabética a leitura do aging se perde.
        enableSorting: false,
        meta: { celular: "titulo" },
        cell: ({ row }) => (
          <span className="text-foreground">{row.original.rotulo}</span>
        ),
      },
      {
        accessorKey: "aPagar",
        header: "A pagar",
        size: 160,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <ValorDaFaixa
            linha={row.original}
            tipo="a_pagar"
            podeVerLancamentos={podeVerLancamentos}
          />
        ),
      },
      {
        accessorKey: "aReceber",
        header: "A receber",
        size: 160,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <ValorDaFaixa
            linha={row.original}
            tipo="a_receber"
            podeVerLancamentos={podeVerLancamentos}
          />
        ),
      },
    ],
    [podeVerLancamentos],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.aging"
      columns={colunas}
      data={linhas}
      idDaLinha={(linha) => linha.faixa}
      semPaginacao
      rodape={{
        rotulo: (
          <span className="text-detalhe font-semibold text-foreground">
            Total
          </span>
        ),
        aPagar: (
          <MoneyText
            valor={aging.totalAPagar}
            className="text-detalhe font-semibold"
          />
        ),
        aReceber: (
          <MoneyText
            valor={aging.totalAReceber}
            className="text-detalhe font-semibold"
          />
        ),
      }}
    />
  );
}
