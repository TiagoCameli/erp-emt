"use client";

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

import { formatarBRL } from "@/lib/formatadores";

/** Linha do gráfico: rótulo do equipamento (placa/código) + custo total. */
export interface LinhaEquipamentosGrafico {
  rotulo: string;
  valor: number;
}

export interface EquipamentosGraficoProps {
  dados: LinhaEquipamentosGrafico[];
}

const CORES = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

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

/**
 * Parte Recharts do painel de equipamentos, isolada pra ser carregada com
 * next/dynamic e ficar fora do bundle inicial da rota.
 */
export function EquipamentosGrafico({ dados }: EquipamentosGraficoProps) {
  return (
    <div className="mt-2 h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
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
            {dados.map((linha, indice) => (
              <Cell key={linha.rotulo} fill={CORES[indice % CORES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
