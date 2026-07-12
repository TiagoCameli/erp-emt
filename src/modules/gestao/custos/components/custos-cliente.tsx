"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { ColumnDef } from "@tanstack/react-table";
import { Coins, Wallet } from "lucide-react";

import {
  DataTable,
  EmptyState,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarPercentual } from "@/lib/formatadores";
import type { GrupoCusto } from "@/modules/gestao/_shared/calculo";
import type {
  CustoObraLinha,
  OrcamentoLinha,
} from "@/modules/gestao/custos/queries";

/**
 * Gráfico (Recharts) carregado sob demanda no client, fora do bundle inicial
 * da rota. O Skeleton tem a mesma altura do gráfico (h-80) pra não pular layout.
 */
const CustosGrafico = dynamic(
  () => import("./custos-grafico-impl").then((mod) => mod.CustosGrafico),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full" />,
  },
);

export interface CustosClienteProps {
  obras: CustoObraLinha[];
  orcamentos: OrcamentoLinha[];
}

/** Ordem e rótulo de cada grupo de custo, com a cor da paleta de gráficos. */
const GRUPOS: { chave: GrupoCusto; rotulo: string; cor: string }[] = [
  { chave: "material", rotulo: "Material", cor: "var(--color-chart-1)" },
  { chave: "combustivel", rotulo: "Combustível", cor: "var(--color-chart-2)" },
  { chave: "manutencao", rotulo: "Manutenção", cor: "var(--color-chart-3)" },
  { chave: "folha", rotulo: "Folha", cor: "var(--color-chart-4)" },
  { chave: "servicos", rotulo: "Serviços", cor: "var(--color-chart-5)" },
];

/** Quantas obras viram barra no gráfico empilhado; o resto fica só na tabela. */
const MAX_BARRAS = 12;

const COLUNAS_OBRA: ColumnDef<CustoObraLinha, unknown>[] = [
  {
    accessorKey: "obraNome",
    header: "Obra",
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="font-medium">{row.original.obraNome}</span>
        {row.original.obraLote ? (
          <span className="text-legenda text-muted-foreground">
            Lote {row.original.obraLote}
          </span>
        ) : null}
      </div>
    ),
  },
  ...GRUPOS.map<ColumnDef<CustoObraLinha, unknown>>((grupo) => ({
    id: grupo.chave,
    accessorFn: (linha) => linha.custo[grupo.chave],
    header: grupo.rotulo,
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custo[grupo.chave]} />,
  })),
  {
    accessorKey: "custoTotal",
    header: "Total",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <MoneyText valor={row.original.custoTotal} className="font-medium" />
    ),
  },
];

const COLUNAS_ORCAMENTO: ColumnDef<OrcamentoLinha, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Centro de custo",
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="font-medium">{row.original.nome}</span>
        {row.original.codigo ? (
          <span className="text-legenda text-muted-foreground codigo-doc">
            {row.original.codigo}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "orcado",
    header: "Orçado",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.orcado} />,
  },
  {
    accessorKey: "realizado",
    header: "Realizado",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.realizado} />,
  },
  {
    accessorKey: "saldo",
    header: "Saldo",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <MoneyText
        valor={row.original.saldo}
        className={
          row.original.saldo < 0 ? "text-status-rejeitado" : "text-status-aprovado"
        }
      />
    ),
  },
  {
    accessorKey: "consumoPct",
    header: "Consumo",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarPercentual(row.original.consumoPct)}
      </span>
    ),
  },
  {
    id: "situacao",
    header: "Situação",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.estourado ? (
        <StatusBadge status="rejeitado" rotulo="Estourado" />
      ) : (
        <StatusBadge status="aprovado" rotulo="No orçamento" />
      ),
  },
];

/**
 * Painel de custos (somente leitura): custo por obra quebrado por grupo, gráfico
 * de barras empilhadas por grupo, e orçado x realizado por centro de custo.
 * Os dados chegam prontos do servidor; aqui só montamos tabelas e gráfico.
 */
export function CustosCliente({ obras, orcamentos }: CustosClienteProps) {
  const dadosGrafico = React.useMemo(() => {
    return obras
      .filter((linha) => linha.custoTotal > 0)
      .slice(0, MAX_BARRAS)
      .map((linha) => ({
        rotulo: linha.obraLote ? `Lote ${linha.obraLote}` : linha.obraNome,
        material: linha.custo.material,
        combustivel: linha.custo.combustivel,
        manutencao: linha.custo.manutencao,
        folha: linha.custo.folha,
        servicos: linha.custo.servicos,
      }));
  }, [obras]);

  const temCusto = obras.some((linha) => linha.custoTotal > 0);

  if (!temCusto) {
    return (
      <EmptyState
        icone={Coins}
        titulo="Sem custo lançado"
        descricao="Quando houver consumo de estoque, folha ou serviços rateados nas obras, o custo aparece aqui."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-corpo font-semibold">Custo por obra e grupo</h2>

        <div className="rounded-lg border border-border bg-card p-4">
          <CustosGrafico dados={dadosGrafico} grupos={GRUPOS} />
        </div>

        <DataTable
          columns={COLUNAS_OBRA}
          data={obras}
          sorting={[{ id: "custoTotal", desc: true }]}
          emptyState={
            <EmptyState
              icone={Coins}
              titulo="Sem custo por obra"
              descricao="Nenhuma obra ativa com custo lançado."
              className="border-none bg-transparent"
            />
          }
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-corpo font-semibold">Orçado x realizado</h2>
        <p className="text-detalhe text-muted-foreground">
          Centros de custo com orçamento definido. Estourado quando o realizado
          passa do orçado.
        </p>

        <DataTable
          columns={COLUNAS_ORCAMENTO}
          data={orcamentos}
          emptyState={
            <EmptyState
              icone={Wallet}
              titulo="Sem orçamento definido"
              descricao="Defina o orçamento de um centro de custo para acompanhar o realizado contra ele."
              className="border-none bg-transparent"
            />
          }
        />
      </section>
    </div>
  );
}
