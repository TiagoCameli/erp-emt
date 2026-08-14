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
import { drillAging } from "@/modules/financeiro/relatorios/drill";
import { abrirDrill } from "@/modules/financeiro/relatorios/components/abrir-drill";
import type { AgingFaixa } from "../queries";

interface AgingGraficoProps {
  aPagar: AgingFaixa[];
  aReceber: AgingFaixa[];
  /** Sem permissão de ver lançamentos, a barra não clica (levaria a um 404). */
  podeVerLancamentos: boolean;
}

interface LinhaGrafico {
  rotulo: string;
  aPagar: number;
  aReceber: number;
  /** Destino do clique em cada barra da faixa, por tipo. */
  hrefAPagar: string;
  hrefAReceber: string;
}

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

/** Aging por faixa de vencimento: a pagar x a receber lado a lado. */
export function AgingGrafico({
  aPagar,
  aReceber,
  podeVerLancamentos,
}: AgingGraficoProps) {
  const dados: LinhaGrafico[] = aPagar.map((faixa, indice) => ({
    rotulo: faixa.rotulo,
    aPagar: faixa.valor,
    aReceber: aReceber[indice]?.valor ?? 0,
    hrefAPagar: drillAging({ faixa: faixa.faixa, tipo: "a_pagar" }),
    hrefAReceber: drillAging({ faixa: faixa.faixa, tipo: "a_receber" }),
  }));

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
          {/* Clique por onClick porque o Recharts desenha <path>, não âncora. */}
          <Bar
            dataKey="aPagar"
            name="A pagar"
            fill="var(--color-chart-1)"
            radius={[3, 3, 0, 0]}
            cursor={podeVerLancamentos ? "pointer" : undefined}
            onClick={(ponto: { payload?: LinhaGrafico }) =>
              podeVerLancamentos
                ? abrirDrill(ponto?.payload?.hrefAPagar)
                : undefined
            }
          />
          <Bar
            dataKey="aReceber"
            name="A receber"
            fill="var(--color-chart-3)"
            radius={[3, 3, 0, 0]}
            cursor={podeVerLancamentos ? "pointer" : undefined}
            onClick={(ponto: { payload?: LinhaGrafico }) =>
              podeVerLancamentos
                ? abrirDrill(ponto?.payload?.hrefAReceber)
                : undefined
            }
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
