"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { dataHojeISO, formatarData } from "@/lib/formatadores";
import type { Creditos, CreditoContrato, CreditoMes } from "../creditos";
import type { EmprestimoContrato, EmprestimosPorContrato } from "../queries";

interface CreditosTabelaProps {
  creditos: Creditos;
  /** Sem permissão de ver lançamentos, o contrato não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

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
    size: 160,
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

function rotuloTotal(texto: string) {
  return (
    <span className="text-detalhe font-semibold text-foreground">{texto}</span>
  );
}

/**
 * Um contrato por linha: quanto somam as prestações, quanto já foi pago, quanto
 * falta vencer, em quantas parcelas e quando vence a próxima.
 *
 * "Total das prestações" e "Prestações a vencer" (antes "Contratado" e "Saldo
 * devedor", D2 de 03/10/2026) porque são somas de PRESTAÇÃO, com os juros
 * futuros dentro: o principal que o banco cobraria para quitar hoje é menor, e
 * o nome antigo deixava ler um pelo outro.
 *
 * O clique leva ao LANÇAMENTO, e não a uma lista filtrada: cada contrato é um
 * documento só, com as parcelas dele. É lá que se paga, se anexa o contrato e
 * se vê o histórico.
 */
export function CreditosTabela({
  creditos,
  podeVerLancamentos,
}: CreditosTabelaProps) {
  const colunas = React.useMemo<ColumnDef<CreditoContrato, unknown>[]>(() => {
    const hoje = dataHojeISO();
    return [
      {
        accessorKey: "credor",
        header: "Credor",
        size: 200,
        cell: ({ row }) => {
          const contrato = row.original;
          return podeVerLancamentos ? (
            <Link
              href={`/financeiro/lancamentos/${contrato.lancamentoId}`}
              title={`Abrir o lançamento de ${contrato.credor}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {contrato.credor}
            </Link>
          ) : (
            <span className="text-foreground">{contrato.credor}</span>
          );
        },
      },
      {
        accessorKey: "descricao",
        header: "Contrato",
        size: 352,
        meta: { naoTruncar: true },
        cell: ({ row }) => (
          <div className="text-left text-muted-foreground">
            <span className="block truncate" title={row.original.descricao}>
              {row.original.descricao}
            </span>
            <span className="text-legenda">{row.original.categoria}</span>
          </div>
        ),
      },
      colunaValor<CreditoContrato>(
        "valorContratado",
        "Total das prestações",
        (c) => c.valorContratado,
      ),
      colunaValor<CreditoContrato>("totalPago", "Pago", (c) => c.totalPago),
      colunaValor<CreditoContrato>(
        "saldoDevedor",
        "Prestações a vencer",
        (c) => c.saldoDevedor,
        "text-detalhe font-medium",
      ),
      {
        id: "parcelas",
        accessorFn: (c) => c.parcelasPagas,
        header: "Parcelas",
        size: 110,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {row.original.parcelasPagas} de {row.original.parcelas}
          </span>
        ),
      },
      {
        id: "proximoVencimento",
        // Quitado (sem próxima parcela) vai para o fim ao ordenar.
        accessorFn: (c) => c.proximoVencimento ?? "9999-12-31",
        header: "Próximo vencimento",
        size: 170,
        meta: { atomico: true },
        cell: ({ row }) => {
          const proximo = row.original.proximoVencimento;
          if (proximo === null) {
            return <span className="text-muted-foreground">Quitado</span>;
          }
          const vencido = proximo < hoje;
          return (
            <span
              className={
                vencido ? "font-medium text-destructive" : "text-foreground"
              }
              title={vencido ? "Parcela vencida e ainda não paga" : undefined}
            >
              {formatarData(proximo)}
            </span>
          );
        },
      },
    ];
  }, [podeVerLancamentos]);

  return (
    <DataTable
      idTabela="financeiro.relatorios.creditos.contratos"
      columns={colunas}
      data={creditos.contratos}
      idDaLinha={(contrato) => contrato.lancamentoId}
      semPaginacao
      emptyState="Nenhum contrato no relatório."
      rodape={{
        credor: rotuloTotal("Total"),
        valorContratado: totalValor(creditos.totalContratado),
        totalPago: totalValor(creditos.totalPago),
        saldoDevedor: totalValor(creditos.totalSaldo),
      }}
    />
  );
}

/**
 * O que vence pela frente, mês a mês. Parcela vencida e não paga aparece no mês
 * CORRENTE, e não no mês em que venceu: para o caixa ela é compromisso de agora.
 */
export function CreditosPorMesTabela({
  meses,
  total,
}: {
  meses: Creditos["proximosMeses"];
  total: number;
}) {
  const colunas = React.useMemo<ColumnDef<CreditoMes, unknown>[]>(
    () => [
      {
        // Ordena pelo primeiro dia do mês; o rótulo "08/2026" ordenaria errado.
        id: "mes",
        accessorFn: (m) => m.mes,
        header: "Mês",
        size: 140,
        meta: { atomico: true },
        cell: ({ row }) => (
          <span className="text-foreground">{row.original.rotulo}</span>
        ),
      },
      {
        accessorKey: "parcelas",
        header: "Parcelas",
        size: 110,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.parcelas}
          </span>
        ),
      },
      colunaValor<CreditoMes>("valor", "A pagar no mês", (m) => m.valor),
    ],
    [],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.creditos.por-mes"
      columns={colunas}
      data={meses}
      idDaLinha={(mes) => mes.mes}
      semPaginacao
      rodape={{
        mes: rotuloTotal("Total no período"),
        valor: totalValor(total),
      }}
    />
  );
}

/**
 * Os contratos do centro de Empréstimos, um por etapa: quanto o banco liberou,
 * quanto já foi amortizado, o que falta e os juros embutidos nas prestações.
 *
 * Morava dentro de `relatorios/page.tsx`, montada em `<table>` cru com `<tfoot>`
 * próprio. Tabela construída na página é o começo de um segundo jeito de
 * desenhar tabela no app; agora é o `DataTable` canônico, como as vizinhas.
 *
 * `tomado` e `pago` NÃO se comparam ainda: parte das prestações antigas está nos
 * extratos e não foi lançada. As duas colunas ficam lado a lado justamente para
 * essa lacuna aparecer.
 *
 * "Juros embutidos" é pago mais a pagar, menos tomado (D2, 03/10/2026): a
 * prestação é um rateio só, então os juros não aparecem no DRE, e é aqui que se
 * vê quanto custa o dinheiro. Contrato com uma perna só fica com traço, e não
 * com um juro inventado (ver `EmprestimoContrato.jurosEmbutidos`).
 */
export function ContratosEmprestimoTabela({
  contratos,
}: {
  contratos: EmprestimosPorContrato;
}) {
  const colunas = React.useMemo<ColumnDef<EmprestimoContrato, unknown>[]>(
    () => [
      {
        accessorKey: "contrato",
        header: "Contrato",
        size: 220,
        cell: ({ row }) => (
          <span className="text-foreground">{row.original.contrato}</span>
        ),
      },
      colunaValor<EmprestimoContrato>("tomado", "Tomado", (c) => c.tomado),
      colunaValor<EmprestimoContrato>("pago", "Pago", (c) => c.pago),
      colunaValor<EmprestimoContrato>("aPagar", "A pagar", (c) => c.aPagar),
      {
        id: "jurosEmbutidos",
        accessorFn: (c) => c.jurosEmbutidos ?? undefined,
        header: "Juros embutidos",
        size: 160,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) =>
          row.original.jurosEmbutidos === null ? (
            <span
              className="text-detalhe text-muted-foreground"
              title="Falta a entrada ou as prestações deste contrato no ERP"
            >
              —
            </span>
          ) : (
            <MoneyText
              valor={row.original.jurosEmbutidos}
              className="text-detalhe"
            />
          ),
      },
      {
        id: "parcelas",
        accessorFn: (c) => c.parcelasPagas,
        header: "Parcelas",
        size: 110,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.parcelas === 0
              ? "—"
              : `${row.original.parcelasPagas} de ${row.original.parcelas}`}
          </span>
        ),
      },
      {
        id: "proximoVencimento",
        accessorFn: (c) => c.proximoVencimento ?? "9999-12-31",
        header: "Próxima",
        size: 130,
        meta: { atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {row.original.proximoVencimento
              ? formatarData(row.original.proximoVencimento)
              : "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.creditos.emprestimos"
      columns={colunas}
      data={contratos.contratos}
      idDaLinha={(contrato) => contrato.centroCustoId}
      semPaginacao
      rodape={{
        contrato: rotuloTotal("Total"),
        tomado: totalValor(contratos.totalTomado),
        pago: totalValor(contratos.totalPago),
        aPagar: totalValor(contratos.totalAPagar),
        jurosEmbutidos: totalValor(contratos.totalJurosEmbutidos),
      }}
    />
  );
}
