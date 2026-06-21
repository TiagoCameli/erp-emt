"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Coins, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  DataTable,
  EmptyState,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { formatarBRL, formatarPercentual } from "@/lib/formatadores";
import type { GrupoCusto } from "@/modules/gestao/_shared/calculo";
import type {
  CustoObraLinha,
  OrcamentoLinha,
} from "@/modules/gestao/custos/queries";

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

function rotuloEixoValor(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return formatarBRL(valor);
}

interface ItemTooltip {
  name?: string;
  value?: number;
  color?: string;
}

function ConteudoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ItemTooltip[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((soma, item) => soma + (item.value ?? 0), 0);
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload
        .filter((item) => (item.value ?? 0) > 0)
        .map((item) => (
          <p
            key={item.name}
            className="flex items-center gap-1.5 text-muted-foreground"
          >
            <span
              className="size-2 shrink-0 rounded-sm"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span>{item.name}</span>
            <span className="ml-auto tabular-nums">
              {formatarBRL(item.value ?? 0)}
            </span>
          </p>
        ))}
      <p className="mt-1 flex items-center gap-1.5 border-t border-border pt-1 font-medium text-foreground">
        <span>Total</span>
        <span className="ml-auto tabular-nums">{formatarBRL(total)}</span>
      </p>
    </div>
  );
}

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
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dadosGrafico}
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="rotulo"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={64}
                />
                <YAxis
                  tickFormatter={rotuloEixoValor}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                />
                <Tooltip
                  content={<ConteudoTooltip />}
                  cursor={{ fill: "var(--muted)" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
                {GRUPOS.map((grupo) => (
                  <Bar
                    key={grupo.chave}
                    dataKey={grupo.chave}
                    name={grupo.rotulo}
                    stackId="custo"
                    fill={grupo.cor}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
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
