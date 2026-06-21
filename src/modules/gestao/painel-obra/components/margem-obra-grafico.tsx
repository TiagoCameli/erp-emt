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
import type { ResultadoObra } from "@/modules/gestao/_shared/agregacao";

interface MargemObraGraficoProps {
  obras: ResultadoObra[];
}

/** Eixo Y compacto: R$ 12 mil / R$ 1,2 mi, pra não estourar a largura. */
function rotuloEixoValor(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return formatarBRL(valor);
}

interface LinhaGrafico {
  rotulo: string;
  margem: number;
}

interface PontoTooltip {
  payload?: LinhaGrafico;
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
        Margem {formatarBRL(ponto.margem)}
      </p>
    </div>
  );
}

/**
 * Margem por obra em barras verticais: verde quando dá lucro, vermelho quando
 * dá prejuízo. Cores do design system EMT (status), espelhando o estilo do
 * gráfico de custo por centro de custo dos relatórios.
 */
export function MargemObraGrafico({ obras }: MargemObraGraficoProps) {
  const dados: LinhaGrafico[] = obras.map((obra) => ({
    rotulo: obra.obraLote ?? obra.obraNome,
    margem: obra.margem,
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
          <Bar dataKey="margem" name="Margem" radius={[3, 3, 0, 0]}>
            {dados.map((linha) => (
              <Cell
                key={linha.rotulo}
                fill={
                  linha.margem >= 0
                    ? "var(--color-status-aprovado)"
                    : "var(--color-status-rejeitado)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
