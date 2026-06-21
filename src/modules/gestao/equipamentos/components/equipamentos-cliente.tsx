"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Truck } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { formatarBRL } from "@/lib/formatadores";
import {
  STATUS_FROTA,
  type StatusFrota,
} from "@/modules/manutencao/_shared/formato";
import type { FrotaLinha } from "@/modules/manutencao/painel/queries";

export interface EquipamentosClienteProps {
  frota: FrotaLinha[];
}

const CORES = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

/** Quantos equipamentos viram barra no gráfico de ofensores. */
const TOP_GRAFICO = 10;
/** Quantos equipamentos contam como "top ofensores" (destacados na tabela). */
const TOP_OFENSORES = 5;

function rotuloEixoValor(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return formatarBRL(valor);
}

interface PontoTooltip {
  payload?: { rotulo: string; valor: number };
}

function ConteudoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: PontoTooltip[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const ponto = payload[0]?.payload;
  if (!ponto) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      <p className="font-medium text-foreground">{ponto.rotulo}</p>
      <p className="tabular-nums text-muted-foreground">
        {formatarBRL(ponto.valor)}
      </p>
    </div>
  );
}

/** Linha da tabela com a marca de top ofensor já resolvida. */
interface LinhaComOfensor extends FrotaLinha {
  ofensor: boolean;
}

const COLUNAS: ColumnDef<LinhaComOfensor, unknown>[] = [
  {
    accessorKey: "descricao",
    header: "Equipamento",
    cell: ({ row }) => {
      const legenda = row.original.placa ?? row.original.codigo;
      const ehOfensor = row.original.ofensor === true;
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          {ehOfensor ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-status-rejeitado"
              aria-hidden="true"
            />
          ) : null}
          <span className="font-medium">{row.original.descricao}</span>
          {legenda ? (
            <span className="text-legenda text-muted-foreground codigo-doc">
              {legenda}
            </span>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge
        status={STATUS_FROTA[row.original.status].badge}
        rotulo={STATUS_FROTA[row.original.status].rotulo}
      />
    ),
  },
  {
    accessorKey: "custoManutencao",
    header: "Manutenção",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custoManutencao} />,
  },
  {
    accessorKey: "custoCombustivel",
    header: "Combustível",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custoCombustivel} />,
  },
  {
    accessorKey: "custoTotal",
    header: "Total",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custoTotal} />,
  },
  {
    accessorKey: "custoPorHora",
    header: "R$/hora",
    meta: { alinharDireita: true },
    cell: ({ row }) =>
      row.original.custoPorHora !== null ? (
        <MoneyText valor={row.original.custoPorHora} />
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
];

/**
 * Painel de equipamentos (somente leitura): tabela ordenável por custo,
 * destaque dos top ofensores (maior custo total) e gráfico de barras dos top N.
 * Reaproveita os dados de listarFrota() já calculados no servidor.
 */
export function EquipamentosCliente({ frota }: EquipamentosClienteProps) {
  const [busca, setBusca] = React.useState("");

  // Top ofensores: maiores custos totais, calculado sobre a frota inteira (não
  // sobre o filtro), para a marca não mudar conforme se busca.
  const idsOfensores = React.useMemo(() => {
    return new Set(
      [...frota]
        .sort((a, b) => b.custoTotal - a.custoTotal)
        .slice(0, TOP_OFENSORES)
        .filter((linha) => linha.custoTotal > 0)
        .map((linha) => linha.equipamentoId),
    );
  }, [frota]);

  const dados = React.useMemo<LinhaComOfensor[]>(() => {
    const termo = busca.trim().toLowerCase();
    return frota
      .filter((linha) => {
        if (!termo) return true;
        const descricao = linha.descricao.toLowerCase();
        const placa = linha.placa?.toLowerCase() ?? "";
        const codigo = linha.codigo?.toLowerCase() ?? "";
        return (
          descricao.includes(termo) ||
          placa.includes(termo) ||
          codigo.includes(termo)
        );
      })
      .map((linha) => ({
        ...linha,
        ofensor: idsOfensores.has(linha.equipamentoId),
      }));
  }, [frota, busca, idsOfensores]);

  const dadosGrafico = React.useMemo(() => {
    return [...frota]
      .filter((linha) => linha.custoTotal > 0)
      .sort((a, b) => b.custoTotal - a.custoTotal)
      .slice(0, TOP_GRAFICO)
      .map((linha) => ({
        rotulo: linha.placa ?? linha.codigo ?? linha.descricao,
        valor: linha.custoTotal,
      }));
  }, [frota]);

  return (
    <div className="flex flex-col gap-4">
      {dadosGrafico.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-legenda uppercase tracking-wide text-muted-foreground">
            Maiores custos por equipamento
          </p>
          <div className="mt-2 h-80 w-full">
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
                <Bar dataKey="valor" name="Custo total" radius={[3, 3, 0, 0]}>
                  {dadosGrafico.map((linha, indice) => (
                    <Cell
                      key={linha.rotulo}
                      fill={CORES[indice % CORES.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <FilterBar>
          <FiltroBusca
            valor={busca}
            onValorChange={setBusca}
            placeholder="Buscar por equipamento, placa ou código"
          />
        </FilterBar>

        <DataTable
          columns={COLUNAS}
          data={dados}
          sorting={[{ id: "custoTotal", desc: true }]}
          emptyState={
            <EmptyState
              icone={Truck}
              titulo="Sem equipamentos na frota"
              descricao="Quando houver equipamentos ativos com custo, o painel de cada um aparece aqui."
              className="border-none bg-transparent"
            />
          }
        />
      </div>
    </div>
  );
}
