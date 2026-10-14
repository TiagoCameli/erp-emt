"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AreaGrafico } from "@/components/canonicos/area-grafico";
import { formatarBRL } from "@/lib/formatadores";
import type { MesVencimento } from "@/modules/financeiro/dividas/painel";
import { COR_ENTIDADE, SEM_ANIMACAO } from "@/modules/financeiro/relatorios/components/cores-grafico";

function rotuloEixoValor(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return formatarBRL(valor);
}

function ConteudoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: MesVencimento }[];
}) {
  const ponto = payload?.[0]?.payload;
  if (!active || !ponto) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      <p className="mb-1 font-medium text-foreground">{ponto.rotulo}</p>
      <p className="tabular-nums text-foreground">{formatarBRL(ponto.total)}</p>
      {ponto.contratos > 0 && ponto.consorcios > 0 ? (
        <p className="text-legenda tabular-nums text-muted-foreground">
          Contratos {formatarBRL(ponto.contratos)} · consórcios {formatarBRL(ponto.consorcios)}
        </p>
      ) : null}
      <p className="text-legenda text-muted-foreground">
        {ponto.parcelas} {ponto.parcelas === 1 ? "parcela" : "parcelas"}
      </p>
    </div>
  );
}

/**
 * O que sai do caixa em dívida mês a mês: prestação de contrato e parcela de
 * consórcio empilhadas, e a barra "Em atraso" na frente quando há parcela
 * vencida sem baixa. Ela fica separada do mês corrente de propósito: somada
 * nele, o mês parece pesado sem dizer que o peso é atraso.
 */
export function VencimentosGrafico({ meses }: { meses: MesVencimento[] }) {
  const temConsorcio = meses.some((m) => m.consorcios > 0);
  return (
    <AreaGrafico altura="18rem">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={meses} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
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
          <Tooltip content={<ConteudoTooltip />} cursor={{ fill: "var(--muted)" }} />
          {temConsorcio ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
          <Bar
            dataKey="contratos"
            name="Contratos"
            stackId="divida"
            fill={COR_ENTIDADE.a_pagar}
            isAnimationActive={SEM_ANIMACAO}
          />
          {temConsorcio ? (
            <Bar
              dataKey="consorcios"
              name="Consórcios"
              stackId="divida"
              fill={COR_ENTIDADE.parcela_consorcio}
              isAnimationActive={SEM_ANIMACAO}
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </AreaGrafico>
  );
}
