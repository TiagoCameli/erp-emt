"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { CelulaVazia, DataTable, MoneyText } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import {
  drillCentroCusto,
  type FiltrosDoRelatorioDeCusto,
  type PeriodoCompetencia,
} from "@/modules/financeiro/relatorios/drill";
import {
  classeDoSinal,
  sinalDaVariacaoDeCusto,
} from "@/modules/financeiro/relatorios/relatorios";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import { ID_NAO_RATEADO } from "@/modules/financeiro/relatorios/indireto-nos-relatorios";
import type { CustoPorCentroCusto } from "../queries";

/**
 * Linha com o indireto rateado ("Com indireto rateado" ligado): `valor` é o
 * total (direto + indireto) e as duas partes vêm ao lado.
 */
type CentroDaTabela = CustoPorCentroCusto["centros"][number] & {
  direto?: number;
  indireto?: number;
};

interface CustoCcTabelaProps {
  custo: { centros: CentroDaTabela[]; total: number };
  /** O período que o relatório está mostrando, para o clique abrir o mesmo. */
  periodo: PeriodoCompetencia;
  /** Os filtros do relatório, que viajam junto no clique. */
  filtros: FiltrosDoRelatorioDeCusto;
  /** Sem permissão de ver lançamentos, o nome não vira link (daria 404). */
  podeVerLancamentos: boolean;
  /**
   * Variação contra o período anterior, por centro. Ausente quando a comparação
   * está desligada ou não se aplica ao modo.
   */
  variacao?: Map<string, VariacaoCentro>;
}

/** Quanto o centro variou contra o período anterior. */
export interface VariacaoCentro {
  valorAnterior: number;
  diferenca: number;
  /**
   * Variação percentual, ou `null` quando o anterior era zero: "+100% sobre
   * zero" se lê como a obra tendo dobrado de custo, quando na verdade ela acabou
   * de começar.
   */
  percentual: number | null;
}

/**
 * O que a linha mostra na comparação: quanto foi no período anterior e a
 * variação.
 *
 * Centro que não existia no período anterior mostra "—" na variação, e não
 * "+100%": o percentual sobre zero se lê como a obra tendo dobrado de custo,
 * quando na verdade ela começou agora. O valor anterior aparece como zero, que é
 * verdade e explica o traço ao lado.
 */
function ValorAnterior({ dados }: { dados?: VariacaoCentro }) {
  return (
    <MoneyText
      valor={dados?.valorAnterior ?? 0}
      className="text-detalhe text-muted-foreground"
    />
  );
}

function Variacao({ dados }: { dados?: VariacaoCentro }) {
  return (
    <span className="text-detalhe tabular-nums">
      {dados === undefined || dados.percentual === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span
          className={classeDoSinal(sinalDaVariacaoDeCusto(dados.diferenca))}
        >
          {dados.diferenca > 0 ? "+" : ""}
          {formatarPercentual(dados.percentual)}
        </span>
      )}
    </span>
  );
}

/**
 * A variação da linha de TOTAL, somada dos centros em vez de recebida pronta.
 *
 * Soma em centavos, como todo dinheiro deste código: somar reais em ponto
 * flutuante sobre dezenas de centros acumula resto e o total da coluna passa a
 * não bater com a soma visível das linhas.
 */
function variacaoDoTotal(
  variacao: Map<string, VariacaoCentro> | undefined,
  total: number,
): VariacaoCentro {
  const anteriorCentavos = [...(variacao?.values() ?? [])].reduce(
    (soma, item) => soma + Math.round(item.valorAnterior * 100),
    0,
  );
  const anterior = anteriorCentavos / 100;
  const diferenca = Math.round(total * 100 - anteriorCentavos) / 100;
  const percentual = anterior > 0 ? (diferenca / anterior) * 100 : null;
  return { valorAnterior: anterior, diferenca, percentual };
}

/**
 * Custo por centro de custo em tabela: código, nome, valor e participação
 * percentual no total. Maiores primeiro (a query já ordena).
 */
export function CustoCcTabela({
  custo,
  periodo,
  filtros,
  podeVerLancamentos,
  variacao,
}: CustoCcTabelaProps) {
  const mostrarVariacao = variacao !== undefined;
  // As colunas do rateio só aparecem quando as linhas trazem as duas partes:
  // sem o rateio ligado, "Direto" seria só uma cópia do Valor.
  const mostrarIndireto = custo.centros.some((c) => c.direto !== undefined);
  const somaCent = (campo: "direto" | "indireto") =>
    custo.centros.reduce((s, c) => s + Math.round((c[campo] ?? 0) * 100), 0) / 100;

  const colunas = React.useMemo<ColumnDef<CentroDaTabela, unknown>[]>(() => {
    const participacao = (centro: CentroDaTabela) =>
      custo.total > 0 ? (centro.valor / custo.total) * 100 : 0;
    return [
      {
        id: "codigo",
        accessorFn: (centro) => centro.codigo ?? "",
        header: "Código",
        size: 110,
        meta: { atomico: true },
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
        id: "centro",
        accessorFn: (centro) => centro.nome,
        header: "Centro de custo",
        size: 280,
        meta: { celular: "titulo" },
        cell: ({ row }) => {
          const centro = row.original;
          // "Sem centro de custo" (id nulo) não vira link: não há centro para
          // filtrar, e um link que abrisse a lista inteira mentiria sobre o que
          // ele mostra.
          return (
            <span className="text-foreground">
              {centro.centroCustoId &&
              centro.centroCustoId !== ID_NAO_RATEADO &&
              podeVerLancamentos ? (
                <LinkDrill
                  href={drillCentroCusto({
                    centroCustoIds: [centro.centroCustoId],
                    periodo,
                    filtros,
                  })}
                  titulo={`Ver os lançamentos de ${centro.nome} neste período`}
                >
                  {centro.nome}
                </LinkDrill>
              ) : (
                centro.nome
              )}
            </span>
          );
        },
      },
      ...(mostrarIndireto
        ? ([
            {
              id: "direto",
              accessorFn: (centro) => centro.direto ?? 0,
              header: "Direto",
              size: 150,
              meta: { alinharDireita: true, atomico: true },
              cell: ({ row }) => (
                <MoneyText
                  valor={row.original.direto ?? 0}
                  className="text-detalhe text-muted-foreground"
                />
              ),
            },
            {
              id: "indireto",
              accessorFn: (centro) => centro.indireto ?? 0,
              header: "Indireto",
              size: 150,
              meta: { alinharDireita: true, atomico: true },
              cell: ({ row }) => (
                <MoneyText
                  valor={row.original.indireto ?? 0}
                  className="text-detalhe text-muted-foreground"
                />
              ),
            },
          ] satisfies ColumnDef<CentroDaTabela, unknown>[])
        : []),
      {
        id: "valor",
        accessorFn: (centro) => centro.valor,
        header: "Valor",
        size: 150,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => (
          <MoneyText valor={row.original.valor} className="text-detalhe" />
        ),
      },
      {
        id: "participacao",
        accessorFn: participacao,
        header: "Participação",
        size: 130,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatarPercentual(participacao(row.original))}
          </span>
        ),
      },
      ...(mostrarVariacao
        ? ([
            {
              id: "anterior",
              accessorFn: (centro) =>
                variacao?.get(centro.centroCustoId)?.valorAnterior ?? 0,
              header: "Período anterior",
              size: 150,
              meta: { alinharDireita: true, atomico: true },
              cell: ({ row }) => (
                <ValorAnterior
                  dados={variacao?.get(row.original.centroCustoId)}
                />
              ),
            },
            {
              id: "variacao",
              accessorFn: (centro) =>
                variacao?.get(centro.centroCustoId)?.percentual ?? null,
              header: "Variação",
              size: 120,
              meta: { alinharDireita: true, atomico: true },
              cell: ({ row }) => (
                <Variacao dados={variacao?.get(row.original.centroCustoId)} />
              ),
            },
          ] satisfies ColumnDef<CentroDaTabela, unknown>[])
        : []),
    ];
  }, [
    custo.total,
    mostrarIndireto,
    mostrarVariacao,
    variacao,
    podeVerLancamentos,
    periodo,
    filtros,
  ]);

  const dadosDoTotal = mostrarVariacao
    ? variacaoDoTotal(variacao, custo.total)
    : undefined;

  return (
    <DataTable
      idTabela="financeiro.relatorios.custo-cc"
      columns={colunas}
      data={custo.centros}
      idDaLinha={(centro) => centro.centroCustoId || "sem-centro"}
      semPaginacao
      rodape={{
        codigo: (
          <span className="text-detalhe font-semibold text-foreground">
            Total
          </span>
        ),
        ...(mostrarIndireto
          ? {
              direto: (
                <MoneyText
                  valor={somaCent("direto")}
                  className="text-detalhe font-semibold"
                />
              ),
              indireto: (
                <MoneyText
                  valor={somaCent("indireto")}
                  className="text-detalhe font-semibold"
                />
              ),
            }
          : {}),
        valor: (
          <MoneyText
            valor={custo.total}
            className="text-detalhe font-semibold"
          />
        ),
        participacao: (
          <span className="text-detalhe font-normal tabular-nums text-muted-foreground">
            {custo.centros.length > 0
              ? formatarPercentual(100)
              : formatarPercentual(0)}
          </span>
        ),
        ...(mostrarVariacao
          ? {
              // Sem negrito, como nas linhas: o pé do DataTable é `font-medium`.
              anterior: (
                <span className="font-normal">
                  <ValorAnterior dados={dadosDoTotal} />
                </span>
              ),
              variacao: (
                <span className="font-normal">
                  <Variacao dados={dadosDoTotal} />
                </span>
              ),
            }
          : {}),
      }}
    />
  );
}
