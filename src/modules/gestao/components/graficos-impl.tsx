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
import type { CustoCentro } from "../queries";
import type { FaixaVencimento, PontoMes } from "../calculo";

/**
 * Gráficos do painel de Gestão. Mesmo padrão dos relatórios do Financeiro:
 * Recharts, cores do design system, grade discreta, nenhuma decoração.
 *
 * Regra de cor aqui: um gráfico de série única usa UMA cor (a âmbar da marca).
 * Cor só varia quando significa alguma coisa, como a coluna do que já venceu,
 * que é a única vermelha. Cor por posição no ranking não informa nada.
 */

/**
 * Eixo de valor compacto: R$ 3,6 mil, R$ 1,2 mi. Mantém uma casa decimal
 * porque arredondar para o milheiro inteiro mente na escala da obra: com
 * ticks de 1.800 e 2.700 o eixo repetia "R$ 2 mil" e "R$ 3 mil".
 */
const formatadorEixo = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

function rotuloEixoValor(valor: number): string {
  if (valor === 0) return "R$ 0";
  return formatadorEixo.format(valor);
}

interface PontoTooltip {
  payload?: { rotulo: string; valor: number; detalhe?: string };
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
      <p className="tabular-nums text-foreground">{formatarBRL(ponto.valor)}</p>
      {ponto.detalhe ? (
        <p className="text-muted-foreground">{ponto.detalhe}</p>
      ) : null}
    </div>
  );
}

const EIXO_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
const ALTURA = "h-64 w-full";

/** Custo por mês de competência: uma barra por mês, inclusive os meses zerados. */
export function CustoMesGrafico({ meses }: { meses: PontoMes[] }) {
  const dados = meses.map((mes) => ({
    rotulo: mes.rotulo,
    valor: mes.valor,
    detalhe:
      mes.lancamentos === 1 ? "1 lançamento" : `${mes.lancamentos} lançamentos`,
  }));

  return (
    <div className={ALTURA}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="rotulo"
            tick={EIXO_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tickFormatter={rotuloEixoValor}
            tick={EIXO_TICK}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip content={<ConteudoTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Bar
            dataKey="valor"
            name="Custo"
            fill="var(--color-chart-1)"
            radius={[3, 3, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * A pagar por faixa de prazo. A coluna do vencido é vermelha porque é estado,
 * não série: o rótulo do eixo já diz "Vencido", então a cor não é a única pista.
 */
export function VencimentosGrafico({ faixas }: { faixas: FaixaVencimento[] }) {
  const dados = faixas.map((f) => ({
    rotulo: f.rotulo,
    valor: f.valor,
    vencido: f.faixa === "vencido",
  }));

  return (
    <div className={ALTURA}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="rotulo"
            tick={EIXO_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval={0}
            height={40}
          />
          <YAxis
            tickFormatter={rotuloEixoValor}
            tick={EIXO_TICK}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip content={<ConteudoTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="valor" name="A pagar" radius={[3, 3, 0, 0]} maxBarSize={48}>
            {dados.map((linha) => (
              <Cell
                key={linha.rotulo}
                fill={
                  linha.vencido
                    ? "var(--color-chart-5)"
                    : "var(--color-chart-1)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Nome do centro de custo cortado para caber no eixo sem espremer as barras. */
function encurtar(nome: string, limite = 22): string {
  return nome.length > limite ? `${nome.slice(0, limite - 1)}…` : nome;
}

/** Custo por centro de custo: barras horizontais, maiores em cima. */
export function CustoCentroGrafico({ centros }: { centros: CustoCentro[] }) {
  const dados = centros.map((centro) => ({
    rotulo: centro.nome,
    eixo: encurtar(centro.nome),
    valor: centro.valor,
    detalhe: `${centro.participacao.toFixed(0)}% do período`,
  }));

  return (
    <div className={ALTURA}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            horizontal={false}
          />
          <XAxis
            type="number"
            tickFormatter={rotuloEixoValor}
            tick={EIXO_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            type="category"
            dataKey="eixo"
            tick={EIXO_TICK}
            tickLine={false}
            axisLine={false}
            width={150}
            interval={0}
          />
          <Tooltip content={<ConteudoTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Bar
            dataKey="valor"
            name="Custo"
            fill="var(--color-chart-1)"
            radius={[0, 3, 3, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
