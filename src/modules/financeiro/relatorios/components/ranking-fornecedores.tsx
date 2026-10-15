"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { formatarBRL, formatarPercentual } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { BarraProporcional } from "@/modules/financeiro/relatorios/components/barra-proporcional";
import { PARAM_FORNECEDOR } from "@/modules/financeiro/relatorios/extrato-filtros";
import {
  resumirRanking,
  type FornecedorRankingLinha,
} from "@/modules/financeiro/relatorios/fornecedores-ranking";
import { PARAM_RELATORIO } from "@/modules/financeiro/relatorios/relatorios";

/** O extrato de um fornecedor: o drill de uma linha do ranking. */
export function hrefExtratoDoFornecedor(fornecedorId: string): string {
  const query = new URLSearchParams({
    [PARAM_RELATORIO]: "extrato-fornecedor",
    [PARAM_FORNECEDOR]: fornecedorId,
  });
  return `/financeiro/relatorios?${query.toString()}`;
}

function NomeFornecedor({ linha }: { linha: FornecedorRankingLinha }) {
  if (linha.fornecedorId === null) {
    return <span className="italic text-muted-foreground">{linha.nome}</span>;
  }
  return (
    <a
      href={hrefExtratoDoFornecedor(linha.fornecedorId)}
      title={`Abrir o extrato de ${linha.nome}`}
      className="foco-anel rounded-sm text-foreground underline-offset-2 hover:underline"
    >
      {linha.nome}
    </a>
  );
}

function colunaValor(
  id: keyof FornecedorRankingLinha & string,
  header: string,
  opcoes: { alerta?: boolean; forte?: boolean } = {},
): ColumnDef<FornecedorRankingLinha, unknown> {
  return {
    accessorKey: id,
    header,
    size: 150,
    meta: { alinharDireita: true, atomico: true, rotulo: header },
    cell: ({ row }) => {
      const valor = row.original[id] as number;
      return (
        <MoneyText
          valor={valor}
          className={cn(
            opcoes.forte && "font-medium",
            opcoes.alerta && valor > 0 && "font-medium text-destructive",
            valor === 0 && "text-muted-foreground",
          )}
        />
      );
    },
  };
}

/**
 * O ranking que abre o extrato: a frase de quanto se deve hoje, os maiores
 * credores em barras e a tabela completa, ordenável, com o extrato de cada um
 * no clique do nome.
 */
export function RankingFornecedores({
  linhas,
  descricaoPeriodo,
}: {
  linhas: FornecedorRankingLinha[];
  /** O período escolhido, em texto (vale para Lançado e Pago). */
  descricaoPeriodo: string;
}) {
  const resumo = React.useMemo(() => resumirRanking(linhas), [linhas]);
  const { totais } = resumo;
  const maximo = resumo.maioresEmAberto[0]?.emAberto ?? 0;
  const semFornecedor = linhas.find((l) => l.fornecedorId === null);

  const colunas = React.useMemo<ColumnDef<FornecedorRankingLinha, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Fornecedor",
        size: 320,
        meta: { celular: "titulo" },
        cell: ({ row }) => <NomeFornecedor linha={row.original} />,
      },
      {
        accessorKey: "lancamentos",
        header: "Lançamentos",
        size: 110,
        meta: { alinharDireita: true, atomico: true, rotulo: "Lançamentos" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.lancamentos}</span>,
      },
      colunaValor("lancado", "Lançado no período"),
      colunaValor("pago", "Pago no período"),
      {
        ...colunaValor("emAberto", "Em aberto hoje", { forte: true }),
        meta: { alinharDireita: true, atomico: true, rotulo: "Em aberto hoje", celular: "valor" },
      },
      colunaValor("vencido", "Vencido", { alerta: true }),
      colunaValor("proximos30", "Vence em 30 dias"),
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-4xl flex-col gap-1">
        <p className="text-corpo text-foreground">
          Hoje a EMT deve <strong className="font-semibold tabular-nums">{formatarBRL(totais.emAberto)}</strong> a{" "}
          {resumo.comAberto} fornecedor{resumo.comAberto === 1 ? "" : "es"}
          {totais.vencido > 0 ? (
            <>
              , <strong className="font-semibold tabular-nums text-destructive">{formatarBRL(totais.vencido)}</strong>{" "}
              já vencidos
            </>
          ) : null}
          , e <strong className="font-semibold tabular-nums">{formatarBRL(totais.proximos30)}</strong> vencem nos
          próximos 30 dias.
          {resumo.concentracaoTop5 !== null && resumo.comAberto > 5 ? (
            <>
              {" "}
              Os 5 maiores credores somam {formatarPercentual(resumo.concentracaoTop5 * 100, 0)} do que está em aberto.
            </>
          ) : null}
        </p>
        <p className="text-detalhe text-muted-foreground">
          {descricaoPeriodo}: <span className="tabular-nums">{formatarBRL(totais.lancado)}</span> lançados e{" "}
          <span className="tabular-nums">{formatarBRL(totais.pago)}</span> pagos.
          {semFornecedor && semFornecedor.lancamentos > 0
            ? ` ${semFornecedor.lancamentos} lançamento(s) do período estão sem fornecedor (${formatarBRL(semFornecedor.lancado)}).`
            : null}
        </p>
      </div>

      {resumo.maioresEmAberto.length > 0 ? (
        <section aria-labelledby="maiores-credores" className="flex flex-col gap-2">
          <h3 id="maiores-credores" className="text-detalhe font-semibold uppercase tracking-wide text-foreground">
            Maiores credores hoje
          </h3>
          <ul className="flex flex-col gap-2">
            {resumo.maioresEmAberto.map((l, i) => (
              <li
                key={l.fornecedorId ?? "sem"}
                className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(12rem,20rem)_minmax(0,1fr)_8.5rem_10rem]"
              >
                <span className="min-w-0 truncate text-detalhe">
                  <NomeFornecedor linha={l} />
                </span>
                <BarraProporcional
                  valor={l.emAberto}
                  maximo={maximo}
                  ordem={i}
                  cor="bg-chart-2"
                  className="col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1"
                />
                <MoneyText valor={l.emAberto} className="text-right text-detalhe font-medium text-foreground" />
                <span className="hidden text-right text-detalhe text-muted-foreground md:block">
                  {l.vencido > 0 ? (
                    <span className="text-destructive">{formatarBRL(l.vencido)} vencido</span>
                  ) : l.proximos30 > 0 ? (
                    `${formatarBRL(l.proximos30)} em 30 dias`
                  ) : (
                    "nada nos próximos 30 dias"
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <DataTable
        idTabela="financeiro.relatorios.ranking-fornecedores"
        columns={colunas}
        data={linhas}
        idDaLinha={(l) => l.fornecedorId ?? "sem-fornecedor"}
        searchKey="nome"
        searchPlaceholder="Buscar fornecedor"
        pageSize={50}
        rodape={{
          nome: <span className="font-semibold">Total ({linhas.length})</span>,
          lancado: <MoneyText valor={totais.lancado} className="font-semibold" />,
          pago: <MoneyText valor={totais.pago} className="font-semibold" />,
          emAberto: <MoneyText valor={totais.emAberto} className="font-semibold" />,
          vencido: <MoneyText valor={totais.vencido} className="font-semibold" />,
          proximos30: <MoneyText valor={totais.proximos30} className="font-semibold" />,
        }}
      />
    </div>
  );
}
