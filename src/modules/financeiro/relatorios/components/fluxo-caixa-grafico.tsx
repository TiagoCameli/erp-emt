"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatarBRL } from "@/lib/formatadores";
import type { FluxoCaixaMes } from "../queries";

interface FluxoCaixaGraficoProps {
  meses: FluxoCaixaMes[];
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

/**
 * Fluxo de caixa por mês: barras de entradas x saídas (realizado + projetado
 * empilhados) e a linha de saldo do mês. Cores do design system EMT.
 */
export function FluxoCaixaGrafico({ meses }: FluxoCaixaGraficoProps) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={meses}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="rotulo"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tickFormatter={rotuloEixoValor}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip content={<ConteudoTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="entradasRealizado"
            stackId="entradas"
            name="Entradas realizadas"
            fill="var(--color-chart-3)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="entradasProjetado"
            stackId="entradas"
            name="Entradas projetadas"
            fill="var(--color-chart-3)"
            fillOpacity={0.45}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="saidasRealizado"
            stackId="saidas"
            name="Saídas realizadas"
            fill="var(--color-chart-1)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="saidasProjetado"
            stackId="saidas"
            name="Saídas projetadas"
            fill="var(--color-chart-1)"
            fillOpacity={0.45}
            radius={[3, 3, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="saldo"
            name="Saldo do mês"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
