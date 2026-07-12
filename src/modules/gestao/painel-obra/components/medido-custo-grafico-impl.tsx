"use client";

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

import { formatarBRL } from "@/lib/formatadores";
import type { ResultadoObra } from "@/modules/gestao/_shared/agregacao";

interface MedidoCustoGraficoProps {
  obras: ResultadoObra[];
}

/** Eixo Y compacto: R$ 12 mil / R$ 1,2 mi, pra não estourar a largura. */
function rotuloEixoValor(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return formatarBRL(valor);
}

interface PontoTooltip {
  name: string;
  value: number;
  color: string;
}

function ConteudoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: PontoTooltip[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((ponto) => (
          <li key={ponto.name} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: ponto.color }}
            />
            <span className="text-muted-foreground">{ponto.name}</span>
            <span className="ml-auto tabular-nums text-foreground">
              {formatarBRL(ponto.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface LinhaGrafico {
  rotulo: string;
  medido: number;
  custo: number;
}

/** Medido x custo por obra, barras lado a lado, pra enxergar onde o custo come a medição. */
export function MedidoCustoGrafico({ obras }: MedidoCustoGraficoProps) {
  const dados: LinhaGrafico[] = obras.map((obra) => ({
    rotulo: obra.obraLote ?? obra.obraNome,
    medido: obra.medido,
    custo: obra.custoTotal,
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
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
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="medido"
            name="Medido"
            fill="var(--color-chart-3)"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="custo"
            name="Custo"
            fill="var(--color-chart-1)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
