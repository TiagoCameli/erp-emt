"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatarBRL, formatarMesAno } from "@/lib/formatadores";
import {
  CORES_SERIE_CENTRO,
  SEM_ANIMACAO,
} from "@/modules/financeiro/relatorios/components/cores-grafico";

export interface PosicaoGraficoProps {
  aplicacoes: { id: string; nome: string }[];
  serie: { mes: string; valores: Record<string, number> }[];
}

function rotuloEixo(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return formatarBRL(valor);
}

/**
 * Posição no fim de cada mês, uma linha por aplicação. Antes da abertura a
 * linha é o principal (aplicado menos resgatado), sem rendimento: é o que o
 * sistema sabia, e o salto em set/2026 é a abertura trazendo o que faltava.
 */
export function PosicaoGrafico({ aplicacoes, serie }: PosicaoGraficoProps) {
  const dados = serie.map((s) => ({ rotulo: formatarMesAno(s.mes), ...s.valores }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="rotulo"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tickFormatter={rotuloEixo}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip
            formatter={(valor) => formatarBRL(Number(valor))}
            contentStyle={{ fontSize: 12, borderColor: "var(--border)" }}
          />
          <Legend verticalAlign="top" align="left" iconType="plainline" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
          {aplicacoes.map((a, i) => (
            <Line
              key={a.id}
              type="monotone"
              dataKey={a.id}
              name={a.nome}
              stroke={CORES_SERIE_CENTRO[i % CORES_SERIE_CENTRO.length]}
              isAnimationActive={SEM_ANIMACAO}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
