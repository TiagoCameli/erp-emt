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
import type { CustoCentroCusto } from "../queries";

interface CustoCcGraficoProps {
  centros: CustoCentroCusto[];
}

const CORES = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

/** Limite de barras no gráfico: o resto vira "Outros". A tabela mostra tudo. */
const MAX_BARRAS = 12;

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

/** Custo por centro de custo: barras verticais, maiores primeiro. */
export function CustoCcGrafico({ centros }: CustoCcGraficoProps) {
  const principais = centros.slice(0, MAX_BARRAS);
  const restantes = centros.slice(MAX_BARRAS);

  const dados = principais.map((centro) => ({
    rotulo: centro.codigo ?? centro.nome,
    valor: centro.valor,
  }));

  if (restantes.length > 0) {
    dados.push({
      rotulo: "Outros",
      valor: restantes.reduce((soma, c) => soma + c.valor, 0),
    });
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
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
          <Tooltip content={<ConteudoTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="valor" name="Custo" radius={[3, 3, 0, 0]}>
            {dados.map((linha, indice) => (
              <Cell key={linha.rotulo} fill={CORES[indice % CORES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
