"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatarBRL } from "@/lib/formatadores";
import { rotuloMes } from "@/modules/financeiro/relatorios/calculo";
import type { MesCustoReceita } from "@/modules/financeiro/relatorios/custo-receita";

interface CustoReceitaGraficoProps {
  meses: MesCustoReceita[];
}

/** Eixo Y compacto: R$ 12 mil / R$ 1,2 mi, pra não estourar a largura. */
function rotuloEixoValor(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return formatarBRL(valor);
}

interface Fileira {
  mes: string;
  rotulo: string;
  receita: number;
  custo: number;
  resultado: number;
}

function ConteudoTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: { name?: string; value?: number; color?: string }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">{item.name}</span>
          <span className="tabular-nums text-foreground">
            {formatarBRL(item.value ?? 0)}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Receita e custo lado a lado por mês de referência, com o resultado em linha.
 *
 * O gráfico NÃO clica, de propósito, e as tabelas embaixo clicam: a coluna de um
 * mês soma dois dinheiros opostos vindos de dois conjuntos de centros diferentes,
 * então um clique único ali não tem destino honesto. Quem quer os lançamentos
 * clica no centro, onde o recorte é um só.
 *
 * A linha do zero é explícita porque o resultado é a série que mais importa e ela
 * cruza para baixo: sem a referência, um resultado negativo pequeno parece
 * rasteiro em vez de negativo.
 */
export function CustoReceitaGrafico({ meses }: CustoReceitaGraficoProps) {
  const dados: Fileira[] = meses.map((mes) => ({
    mes: mes.mes,
    rotulo: rotuloMes(mes.mes),
    receita: mes.receita,
    custo: mes.custo,
    resultado: mes.resultado,
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
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
            interval="preserveStartEnd"
            angle={-30}
            textAnchor="end"
            height={56}
          />
          <YAxis
            tickFormatter={rotuloEixoValor}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={80}
          />
          <Tooltip content={<ConteudoTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Legend
            verticalAlign="top"
            align="left"
            wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar
            dataKey="receita"
            name="Receita líquida"
            fill="var(--color-chart-1)"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="custo"
            name="Custo"
            fill="var(--color-chart-3)"
            radius={[3, 3, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="resultado"
            name="Resultado"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
