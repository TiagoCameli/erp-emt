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
import type { GrupoCusto } from "@/modules/gestao/_shared/calculo";

/** Linha do gráfico: rótulo da obra + valor de cada grupo de custo. */
export interface LinhaCustosGrafico extends Record<GrupoCusto, number> {
  rotulo: string;
}

export interface CustosGraficoProps {
  dados: LinhaCustosGrafico[];
  grupos: { chave: GrupoCusto; rotulo: string; cor: string }[];
}

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

/**
 * Parte Recharts do painel de custos, isolada pra ser carregada com
 * next/dynamic e ficar fora do bundle inicial da rota.
 */
export function CustosGrafico({ dados, grupos }: CustosGraficoProps) {
  return (
    <div className="h-80 w-full">
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
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="circle"
            iconSize={8}
          />
          {grupos.map((grupo) => (
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
  );
}
