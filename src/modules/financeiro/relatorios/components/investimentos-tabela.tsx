"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import type {
  Investimentos,
  LinhaAplicacao,
  MesInvestimento,
  MovimentoInvestimento,
} from "@/modules/financeiro/relatorios/investimentos";

/** Coluna de dinheiro do relatório, com o peso da fonte que a coluna pede. */
function colunaValor<T>(
  id: string,
  header: string,
  valor: (linha: T) => number,
  className = "text-detalhe",
): ColumnDef<T, unknown> {
  return {
    id,
    accessorFn: valor,
    header,
    size: 170,
    // Centralizado é o padrão de tabela do app; só dinheiro vai à direita.
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => (
      <MoneyText valor={valor(row.original)} className={className} />
    ),
  };
}

/** Total do rodapé: o negrito vai no valor, que é quem sabe o que é número. */
function totalValor(valor: number) {
  return <MoneyText valor={valor} className="text-detalhe font-semibold" />;
}

/** Posição por aplicação: o saldo do CDB, do fundo, de cada coisa aplicada. */
export function AplicacoesTabela({ dados }: { dados: Investimentos }) {
  const total = dados.aplicacoes.reduce(
    (soma, a) => ({
      aplicado: soma.aplicado + Math.round(a.aplicado * 100),
      resgatado: soma.resgatado + Math.round(a.resgatado * 100),
      posicao: soma.posicao + Math.round(a.posicao * 100),
      aplicadoPeriodo: soma.aplicadoPeriodo + Math.round(a.aplicadoPeriodo * 100),
      resgatadoPeriodo: soma.resgatadoPeriodo + Math.round(a.resgatadoPeriodo * 100),
    }),
    { aplicado: 0, resgatado: 0, posicao: 0, aplicadoPeriodo: 0, resgatadoPeriodo: 0 },
  );

  const colunas = React.useMemo<ColumnDef<LinhaAplicacao, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Aplicação",
        size: 200,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "conta",
        header: "Conta",
        size: 180,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.conta}</span>
        ),
      },
      colunaValor<LinhaAplicacao>(
        "aplicadoPeriodo",
        "Aplicado no período",
        (a) => a.aplicadoPeriodo,
      ),
      colunaValor<LinhaAplicacao>(
        "resgatadoPeriodo",
        "Resgatado no período",
        (a) => a.resgatadoPeriodo,
      ),
      colunaValor<LinhaAplicacao>("aplicado", "Aplicado (total)", (a) => a.aplicado),
      colunaValor<LinhaAplicacao>("resgatado", "Resgatado (total)", (a) => a.resgatado),
      colunaValor<LinhaAplicacao>(
        "posicao",
        "Saldo aplicado",
        (a) => a.posicao,
        "text-detalhe font-medium",
      ),
    ],
    [],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.investimentos.aplicacoes"
      columns={colunas}
      data={dados.aplicacoes}
      idDaLinha={(a) => a.aplicacaoId}
      semPaginacao
      emptyState="Nenhuma aplicação no centro Investimentos."
      rodape={{
        nome: <span className="text-detalhe font-semibold text-foreground">Total</span>,
        aplicadoPeriodo: totalValor(total.aplicadoPeriodo / 100),
        resgatadoPeriodo: totalValor(total.resgatadoPeriodo / 100),
        aplicado: totalValor(total.aplicado / 100),
        resgatado: totalValor(total.resgatado / 100),
        posicao: totalValor(total.posicao / 100),
      }}
    />
  );
}

/** Mês a mês: quanto entrou, quanto saiu e onde a posição fechou. */
export function InvestimentosPorMesTabela({ dados }: { dados: Investimentos }) {
  const colunas = React.useMemo<ColumnDef<MesInvestimento, unknown>[]>(
    () => [
      {
        accessorKey: "mes",
        header: "Mês",
        size: 140,
        meta: { atomico: true },
        cell: ({ row }) => (
          <span className="text-foreground">
            {formatarMesAno(`${row.original.mes}-01`)}
          </span>
        ),
      },
      colunaValor<MesInvestimento>("aplicado", "Aplicado", (m) => m.aplicado),
      colunaValor<MesInvestimento>("resgatado", "Resgatado", (m) => m.resgatado),
      colunaValor<MesInvestimento>(
        "liquido",
        "Líquido do mês",
        (m) => (Math.round(m.aplicado * 100) - Math.round(m.resgatado * 100)) / 100,
      ),
      colunaValor<MesInvestimento>(
        "posicaoFinal",
        "Posição no fim do mês",
        (m) => m.posicaoFinal,
        "text-detalhe font-medium",
      ),
    ],
    [],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.investimentos.por-mes"
      columns={colunas}
      data={dados.meses}
      idDaLinha={(m) => m.mes}
      semPaginacao
    />
  );
}

/** As aplicações e resgates do período, um por linha, do mais recente. */
export function MovimentosInvestimentoTabela({ dados }: { dados: Investimentos }) {
  const colunas = React.useMemo<ColumnDef<MovimentoInvestimento, unknown>[]>(
    () => [
      {
        accessorKey: "data",
        header: "Data",
        size: 116,
        meta: { atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatarData(row.original.data)}</span>
        ),
      },
      {
        accessorKey: "numero",
        header: "Documento",
        size: 150,
        cell: ({ row }) => <span className="codigo-doc">{row.original.numero}</span>,
      },
      {
        accessorKey: "sentido",
        header: "Movimento",
        size: 120,
        cell: ({ row }) =>
          row.original.sentido === "aplicacao" ? "Aplicação" : "Resgate",
      },
      {
        accessorKey: "aplicacaoNome",
        header: "Aplicação",
        size: 180,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.aplicacaoNome}</span>
        ),
      },
      {
        id: "descricao",
        accessorFn: (m) => m.descricao ?? "",
        header: "Descrição",
        size: 240,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.descricao ?? "-"}</span>
        ),
      },
      colunaValor<MovimentoInvestimento>("valor", "Valor", (m) =>
        m.sentido === "aplicacao" ? m.valor : -m.valor,
      ),
    ],
    [],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.investimentos.movimentos"
      columns={colunas}
      data={dados.movimentos}
      idDaLinha={(m) => m.id}
      semPaginacao
    />
  );
}
