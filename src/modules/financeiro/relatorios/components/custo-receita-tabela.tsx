"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { CelulaVazia, DataTable, MoneyText } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import { drillCustoReceita } from "@/modules/financeiro/relatorios/drill";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import type { CentroCustoReceita } from "@/modules/financeiro/relatorios/custo-receita";

interface CustoReceitaTabelaProps {
  linhas: CentroCustoReceita[];
  /** Governa o rótulo, a coluna de retenção e o tipo que o clique leva. */
  lado: "custo" | "receita";
  /** Os meses que estas linhas somam, para o clique abrir os MESMOS meses. */
  meses: readonly string[];
  /** Sem permissão de ver lançamentos, o nome não vira link (daria 404). */
  podeVerLancamentos: boolean;
  /** "Incluir investimentos" marcado: o clique no custo leva o CAPEX junto. */
  incluirInvestimento?: boolean;
}

/**
 * Uma das duas tabelas do relatório: centro, valor e participação no total do
 * SEU lado.
 *
 * Participação é sobre o total do próprio lado, não sobre a soma dos dois: 40% de
 * um custo que é maior que a receita não significa nada se o denominador mistura
 * dinheiro que entra com dinheiro que sai.
 *
 * A coluna de retenção só existe na receita, e só aparece quando há retenção em
 * alguma linha. Coluna de zeros ocupa largura e ensina errado (que a EMT retém
 * imposto em toda medição, quando são 9 documentos).
 *
 * Cada lado tem o seu `idTabela`: são duas tabelas na mesma tela, e com o mesmo
 * id uma dividiria a largura e a ordem salvas com a outra.
 */
export function CustoReceitaTabela({
  linhas,
  lado,
  meses,
  podeVerLancamentos,
  incluirInvestimento,
}: CustoReceitaTabelaProps) {
  const total = linhas.reduce((soma, linha) => soma + linha.total, 0);
  const temRetencao =
    lado === "receita" && linhas.some((linha) => linha.retencao > 0);
  const tipo = lado === "custo" ? "a_pagar" : "a_receber";
  const titulo = lado === "custo" ? "Custo por centro" : "Receita por centro";
  const rotuloValor = lado === "custo" ? "Custo" : "Receita líquida";

  const colunas = React.useMemo<ColumnDef<CentroCustoReceita, unknown>[]>(
    () => [
      {
        id: "codigo",
        accessorFn: (linha) => linha.codigo ?? "",
        header: "Código",
        size: 110,
        meta: { rotulo: "Código", atomico: true },
        // `text-detalhe` vem da célula do DataTable, e não do `span`: o
        // `codigo-doc` já traz o tamanho dele, e é a CelulaVazia que precisa
        // herdar o tamanho certo da tabela.
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.codigo ? (
              <span className="codigo-doc">{row.original.codigo}</span>
            ) : (
              <CelulaVazia />
            )}
          </span>
        ),
      },
      {
        id: "nome",
        accessorFn: (linha) => linha.nome,
        header: "Centro de custo",
        size: 240,
        meta: { rotulo: "Centro de custo", fixa: true, celular: "titulo" },
        cell: ({ row }) => {
          const linha = row.original;
          return (
            <span className="text-foreground">
              {podeVerLancamentos ? (
                <LinkDrill
                  href={drillCustoReceita({
                    centroCustoId: linha.centroCustoId,
                    meses,
                    tipo,
                    incluirInvestimento,
                  })}
                  titulo={`Ver os lançamentos de ${linha.nome} nestes meses`}
                >
                  {linha.nome}
                </LinkDrill>
              ) : (
                linha.nome
              )}
            </span>
          );
        },
      },
      ...(temRetencao
        ? [
            {
              id: "retencao",
              accessorFn: (linha) => linha.retencao,
              header: "Retido",
              size: 140,
              meta: { rotulo: "Retido", alinharDireita: true, atomico: true },
              cell: ({ row }) =>
                row.original.retencao > 0 ? (
                  <MoneyText
                    valor={row.original.retencao}
                    className="text-detalhe"
                  />
                ) : (
                  <CelulaVazia />
                ),
            } satisfies ColumnDef<CentroCustoReceita, unknown>,
          ]
        : []),
      {
        id: "total",
        accessorFn: (linha) => linha.total,
        header: rotuloValor,
        size: 150,
        meta: {
          rotulo: rotuloValor,
          alinharDireita: true,
          atomico: true,
          celular: "valor",
        },
        cell: ({ row }) => (
          <MoneyText valor={row.original.total} className="text-detalhe" />
        ),
      },
      {
        id: "participacao",
        accessorFn: (linha) => linha.total,
        header: "Participação",
        size: 120,
        meta: { rotulo: "Participação", alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {total === 0
              ? "—"
              : formatarPercentual((row.original.total / total) * 100)}
          </span>
        ),
      },
    ],
    [
      temRetencao,
      rotuloValor,
      podeVerLancamentos,
      meses,
      tipo,
      incluirInvestimento,
      total,
    ],
  );

  const rodape: Record<string, React.ReactNode> = {
    nome: (
      <span className="block text-center text-detalhe font-semibold text-foreground">
        Total
      </span>
    ),
    total: <MoneyText valor={total} className="text-detalhe font-semibold" />,
    participacao: (
      <span className="text-detalhe font-semibold tabular-nums text-muted-foreground">
        100%
      </span>
    ),
  };
  if (temRetencao) {
    rodape.retencao = (
      <MoneyText
        valor={linhas.reduce((soma, l) => soma + l.retencao, 0)}
        className="text-detalhe font-semibold"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-detalhe font-medium text-foreground">{titulo}</h3>
      <DataTable
        idTabela={
          lado === "custo"
            ? "financeiro.relatorios.custo-receita.custo"
            : "financeiro.relatorios.custo-receita.receita"
        }
        columns={colunas}
        data={linhas}
        idDaLinha={(linha) => linha.centroCustoId}
        semPaginacao
        emptyState={
          lado === "custo"
            ? "Nenhum custo nos centros e meses escolhidos"
            : "Nenhuma receita nos centros e meses escolhidos"
        }
        rodape={rodape}
      />
    </div>
  );
}
