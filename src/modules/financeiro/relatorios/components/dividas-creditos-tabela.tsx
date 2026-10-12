"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { formatarData, formatarPercentual } from "@/lib/formatadores";
import { SeloContrato, SeloCota } from "@/modules/financeiro/dividas/components/selos";
import {
  somar,
  type ConsorcioRelatorio,
  type ContratoRelatorio,
} from "@/modules/financeiro/dividas/relatorio";

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
    size: 150,
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

const ROTULO_TOTAL = (
  <span className="text-detalhe font-semibold text-foreground">Total</span>
);

/** "2,0000% a.m. · 26,82% a.a.", ou traço sem cronograma. */
export function textoCet(contrato: ContratoRelatorio): string {
  if (!contrato.cet) return "—";
  return `${formatarPercentual(contrato.cet.mensal * 100, 4)} a.m. · ${formatarPercentual(contrato.cet.anual * 100, 2)} a.a.`;
}

/**
 * Os contratos de dívida pelo cronograma (Financeiro > Dívidas): o liberado,
 * o principal pago e o que falta (saldo devedor de PRINCIPAL, o que o banco
 * cobraria para quitar), os juros pagos e a pagar e o CET. A seta abre as
 * próximas 12 parcelas.
 *
 * É a leitura que a tabela de prestações acima não dá: lá a prestação vem
 * inteira, com o juro futuro dentro. Contrato sem cronograma mostra o liberado
 * como saldo e traço no CET, com o aviso na linha.
 */
export function DividasContratosTabela({
  contratos,
  podeVerDividas,
}: {
  contratos: ContratoRelatorio[];
  /** Sem a permissão de Dívidas, o credor não vira link (daria 404). */
  podeVerDividas: boolean;
}) {
  const colunas = React.useMemo<ColumnDef<ContratoRelatorio, unknown>[]>(
    () => [
      {
        accessorKey: "credor",
        header: "Contrato",
        size: 220,
        meta: { naoTruncar: true },
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="text-left">
              {podeVerDividas ? (
                <Link
                  href={`/financeiro/dividas/contratos/${c.contratoId}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {c.credor}
                </Link>
              ) : (
                <span className="text-foreground">{c.credor}</span>
              )}
              <span className="block text-legenda text-muted-foreground">
                {c.numero}
                {c.temCronograma ? "" : " · sem cronograma"}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 130,
        meta: { naoTruncar: true },
        cell: ({ row }) => <SeloContrato status={row.original.status} />,
      },
      colunaValor<ContratoRelatorio>("valorLiberado", "Liberado", (c) => c.valorLiberado),
      colunaValor<ContratoRelatorio>("principalPago", "Principal pago", (c) => c.principalPago),
      colunaValor<ContratoRelatorio>(
        "saldoDevedor",
        "Saldo devedor",
        (c) => c.saldoDevedor,
        "text-detalhe font-medium",
      ),
      colunaValor<ContratoRelatorio>("jurosPagos", "Juros pagos", (c) => c.jurosPagos),
      colunaValor<ContratoRelatorio>("jurosAPagar", "Juros a pagar", (c) => c.jurosAPagar),
      {
        id: "cet",
        // Ordena pela taxa mensal; sem cronograma vai para o fim.
        accessorFn: (c) => c.cet?.mensal,
        header: "CET",
        size: 200,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">{textoCet(row.original)}</span>
        ),
      },
    ],
    [podeVerDividas],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.creditos.dividas-contratos"
      columns={colunas}
      data={contratos}
      idDaLinha={(c) => c.contratoId}
      semPaginacao
      // A seta só aparece em contrato com parcela pela frente.
      linhaExpandida={(c) => (
        <div className="py-2 pr-3 pl-12">
          <ProximasParcelas contrato={c} />
        </div>
      )}
      podeExpandir={(c) => c.proximas.length > 0}
      rodape={{
        credor: ROTULO_TOTAL,
        valorLiberado: totalValor(somar(contratos, (c) => c.valorLiberado)),
        principalPago: totalValor(somar(contratos, (c) => c.principalPago)),
        saldoDevedor: totalValor(somar(contratos, (c) => c.saldoDevedor)),
        jurosPagos: totalValor(somar(contratos, (c) => c.jurosPagos)),
        jurosAPagar: totalValor(somar(contratos, (c) => c.jurosAPagar)),
      }}
    />
  );
}

type ParcelaProxima = ContratoRelatorio["proximas"][number];

/** As próximas parcelas na ordem do cronograma: a ordem é a informação, não ordena. */
const COLUNAS_PROXIMAS: ColumnDef<ParcelaProxima, unknown>[] = [
  {
    id: "numero",
    header: "Nº",
    size: 60,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{row.original.numero ?? "—"}</span>,
  },
  {
    id: "vencimento",
    header: "Vencimento",
    size: 110,
    enableSorting: false,
    meta: { atomico: true, celular: "titulo" },
    cell: ({ row }) => <span className="tabular-nums">{formatarData(row.original.vencimento)}</span>,
  },
  { ...colunaValor<ParcelaProxima>("principal", "Principal", (p) => p.principal), enableSorting: false },
  { ...colunaValor<ParcelaProxima>("juros", "Juros", (p) => p.juros), enableSorting: false },
  { ...colunaValor<ParcelaProxima>("encargos", "Encargos", (p) => p.encargos), enableSorting: false },
  {
    ...colunaValor<ParcelaProxima>("total", "Total", (p) => p.total, "text-detalhe font-medium"),
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
  },
];

function ProximasParcelas({ contrato }: { contrato: ContratoRelatorio }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-legenda text-muted-foreground">
        Próximas {contrato.proximas.length} parcelas (as atrasadas e não pagas entram primeiro)
      </p>
      <div className="max-w-3xl">
        <DataTable
          idTabela="financeiro.relatorios.creditos.proximas-parcelas"
          columns={COLUNAS_PROXIMAS}
          data={contrato.proximas}
          semPaginacao
        />
      </div>
    </div>
  );
}

/**
 * As cotas de consórcio: quanto do fundo comum e da taxa já foi pago, o que
 * falta e, depois da contemplação, a dívida (o que falta pagar de uma cota
 * contemplada é dívida, D9) e a carta.
 */
export function ConsorciosCreditosTabela({
  cotas,
  podeVerDividas,
}: {
  cotas: ConsorcioRelatorio[];
  podeVerDividas: boolean;
}) {
  const colunas = React.useMemo<ColumnDef<ConsorcioRelatorio, unknown>[]>(
    () => [
      {
        accessorKey: "administradora",
        header: "Cota",
        size: 240,
        meta: { naoTruncar: true },
        cell: ({ row }) => {
          const q = row.original;
          return (
            <div className="text-left">
              {podeVerDividas ? (
                <Link
                  href={`/financeiro/dividas/consorcios/${q.cotaId}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {q.administradora}
                </Link>
              ) : (
                <span className="text-foreground">{q.administradora}</span>
              )}
              <span className="block text-legenda text-muted-foreground">
                Grupo {q.grupo} · cota {q.cota} · {q.bem}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 130,
        meta: { naoTruncar: true },
        cell: ({ row }) => <SeloCota status={row.original.status} />,
      },
      {
        id: "pagas",
        accessorFn: (q) => q.parcelasPagas,
        header: "Pagas",
        size: 110,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {row.original.parcelasPagas} de {row.original.prazo}
          </span>
        ),
      },
      colunaValor<ConsorcioRelatorio>("fundoComumPago", "Fundo comum pago", (q) => q.fundoComumPago),
      colunaValor<ConsorcioRelatorio>("taxaPaga", "Taxa paga", (q) => q.taxaPaga),
      colunaValor<ConsorcioRelatorio>("aPagar", "A pagar", (q) => q.aPagar),
      colunaValor<ConsorcioRelatorio>("divida", "Dívida", (q) => q.divida, "text-detalhe font-medium"),
      {
        id: "valorCarta",
        accessorFn: (q) => q.valorCarta ?? undefined,
        header: "Carta",
        size: 150,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) =>
          row.original.valorCarta === null ? (
            <span className="text-detalhe text-muted-foreground">—</span>
          ) : (
            <MoneyText valor={row.original.valorCarta} className="text-detalhe" />
          ),
      },
    ],
    [podeVerDividas],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.creditos.consorcios"
      columns={colunas}
      data={cotas}
      idDaLinha={(q) => q.cotaId}
      semPaginacao
      rodape={{
        administradora: ROTULO_TOTAL,
        fundoComumPago: totalValor(somar(cotas, (q) => q.fundoComumPago)),
        taxaPaga: totalValor(somar(cotas, (q) => q.taxaPaga)),
        aPagar: totalValor(somar(cotas, (q) => q.aPagar)),
        divida: totalValor(somar(cotas, (q) => q.divida)),
      }}
    />
  );
}
