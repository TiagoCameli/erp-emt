"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { PontoMensal } from "@/modules/combustivel/consumo/calculo";
import { CartaoGrafico, GraficoVazio } from "@/modules/combustivel/painel/components/cartao-grafico";
import { COR_PAINEL } from "@/modules/combustivel/painel/cores";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** "2026-04" -> "Abr/26". */
function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${MESES[Number(m) - 1] ?? m}/${(ano ?? "").slice(2)}`;
}

const EIXO = { fontSize: 11, fill: "var(--color-muted-foreground)" };
const GRADE = "var(--color-border)";

function decimal(valor: number | null | undefined, casas = 2): string {
  return valor === null || valor === undefined
    ? "Sem trecho"
    : valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/**
 * Evolução mensal do consumo do veículo: km/L (quem roda) e L/h (quem trabalha parado), cada
 * um no seu eixo. A série some quando o veículo não tem trecho daquele tipo.
 */
export function GraficoMensalConsumo({ pontos }: { pontos: readonly PontoMensal[] }) {
  const dados = pontos.map((p) => ({ ...p, rotulo: rotuloMes(p.mes) }));
  const temKm = pontos.some((p) => p.kmPorL !== null);
  const temH = pontos.some((p) => p.lPorH !== null);
  return (
    <CartaoGrafico titulo="Consumo por mês" subtitulo="Pelo mês do abastecimento que fecha o trecho" altura={240}>
      {!temKm && !temH ? (
        <GraficoVazio texto="Nenhum trecho com leitura ainda" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={GRADE} vertical={false} />
            <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} />
            {temKm ? (
              <YAxis yAxisId="km" tick={EIXO} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => decimal(v, 1)} />
            ) : null}
            {temH ? (
              <YAxis
                yAxisId="h"
                orientation="right"
                tick={EIXO}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => decimal(v, 1)}
              />
            ) : null}
            <Tooltip
              formatter={(valor, nome) => [decimal(typeof valor === "number" ? valor : null), nome]}
              contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "var(--color-border)", background: "var(--color-popover)" }}
            />
            <Legend align="right" verticalAlign="top" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
            {temKm ? (
              <Line
                yAxisId="km"
                type="monotone"
                dataKey="kmPorL"
                name="km/L"
                stroke={COR_PAINEL.principal}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}
            {temH ? (
              <Line
                yAxisId="h"
                type="monotone"
                dataKey="lPorH"
                name="L/h"
                stroke={COR_PAINEL.custo}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      )}
    </CartaoGrafico>
  );
}
