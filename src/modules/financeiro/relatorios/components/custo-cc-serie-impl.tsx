"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatarBRL } from "@/lib/formatadores";
import { abrirDrill } from "@/modules/financeiro/relatorios/components/abrir-drill";
import { drillCentroCusto } from "@/modules/financeiro/relatorios/drill";
import { rotuloMes } from "@/modules/financeiro/relatorios/calculo";
import type { PontoSerieCentro } from "@/modules/financeiro/relatorios/queries";

interface CustoCcSerieProps {
  serie: PontoSerieCentro[];
  centroCustoId: string;
  /** Sem permissão de ver lançamentos, a barra não clica (levaria a um 404). */
  podeVerLancamentos: boolean;
}

/** Eixo Y compacto: R$ 12 mil / R$ 1,2 mi, pra não estourar a largura. */
function rotuloEixoValor(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return formatarBRL(valor);
}

interface LinhaSerie {
  mes: string;
  rotulo: string;
  valor: number;
}

function ConteudoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: LinhaSerie }[];
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
 * Custo mês a mês de UM centro de custo, no modo "vida do centro".
 *
 * Mês sem custo aparece como barra zerada, e não some da série: o buraco é a
 * informação de que a obra parou naquele mês, e uma série que pula de março para
 * julho desenha crescimento onde houve parada. Quem preenche é a RPC
 * (`fn_rel_custo_centro_serie`), para o gráfico e qualquer outra leitura verem a
 * mesma série.
 */
export function CustoCcSerie({
  serie,
  centroCustoId,
  podeVerLancamentos,
}: CustoCcSerieProps) {
  const dados: LinhaSerie[] = serie.map((ponto) => ({
    mes: ponto.mes,
    rotulo: rotuloMes(ponto.mes),
    valor: ponto.valor,
  }));

  return (
    <div className="h-72 w-full">
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
            height={56}
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
          <Bar
            dataKey="valor"
            name="Custo do mês"
            fill="var(--color-chart-1)"
            radius={[3, 3, 0, 0]}
            cursor={podeVerLancamentos ? "pointer" : undefined}
            onClick={(ponto: { payload?: LinhaSerie }) => {
              if (!podeVerLancamentos || !ponto?.payload) return;
              // Clicar num mês da vida abre os lançamentos DAQUELE mês naquele
              // centro, não a vida inteira: é o que a barra está mostrando.
              abrirDrill(
                drillCentroCusto({
                  centroCustoId,
                  periodo: { mes: ponto.payload.mes },
                  filtros: {},
                }),
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
