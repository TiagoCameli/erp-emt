"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatarBRL } from "@/lib/formatadores";
import type { MesDoResultado } from "../calculo";

/**
 * Gráficos do painel de Gestão. Recharts, cores do design system, grade
 * discreta, nenhuma decoração.
 *
 * ## A regra de cor
 *
 * A cor segue o que a barra SIGNIFICA, nunca a posição num ranking: cor por
 * posição não informa nada e troca de linha quando o filtro muda, fazendo
 * parecer que o dado mudou.
 *
 * Receita é o verde da marca e despesa é o âmbar — e não o vermelho, que era o
 * par óbvio. O vermelho perde para o verde em deuteranopia: medido em
 * 01/09/2026, `#3e7744` contra `#b91c1c` dá ΔE 5,2, abaixo do piso de 6 que
 * ainda exigiria reforço por outro meio, enquanto verde contra âmbar dá 14,7 e
 * passa limpo. Verde e vermelho lado a lado como DUAS SÉRIES é a armadilha
 * clássica de daltonismo, e aqui elas ficam lado a lado em oito pares de colunas.
 *
 * O vermelho continua reservado para ESTADO, onde ele não disputa com o verde na
 * mesma barra: o que já venceu, e o mês que fechou negativo. Nos dois casos há
 * uma segunda pista além da cor (o rótulo do eixo diz "Vencido"; o resultado
 * negativo fica abaixo da linha do zero e o número vem com o sinal).
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

/** Rótulo em cima da barra: compacto e COM SINAL, que é a informação ali. */
const formatadorRotulo = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function rotuloComSinal(valor: number): string {
  if (valor === 0) return "—";
  const sinal = valor > 0 ? "+" : "−";
  return `${sinal}${formatadorRotulo.format(Math.abs(valor))}`;
}

/**
 * Adaptador para o `LabelList`, que tipa o valor como texto renderizável e não
 * como número. Não-número vira string vazia em vez de "NaN" na cara do gráfico.
 */
function rotuloDaColuna(valor: unknown): string {
  return typeof valor === "number" ? rotuloComSinal(valor) : "";
}

const EIXO_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
const ROTULO_BARRA = { fontSize: 11, fill: "var(--muted-foreground)" };
const ALTURA = "h-64 w-full";

const COR_RECEITA = "var(--color-chart-1)";
const COR_DESPESA = "var(--color-chart-2)";
const COR_NEGATIVO = "var(--color-chart-5)";

interface SerieDoTooltip {
  name?: string;
  value?: number;
  color?: string;
}

/**
 * Tooltip de uma ou mais séries.
 *
 * Os valores vêm no texto do design system (não na cor da série): a bolinha
 * colorida ao lado é que carrega a identidade, e número colorido em cima de
 * fundo claro perde contraste justamente onde ele precisa ser lido.
 */
function ConteudoTooltip({
  active,
  payload,
  label,
  detalhe,
}: {
  active?: boolean;
  payload?: SerieDoTooltip[];
  label?: string;
  detalhe?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((serie) => (
        <p key={serie.name} className="flex items-center gap-1.5 text-foreground">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: serie.color }}
          />
          <span className="text-muted-foreground">{serie.name}</span>
          <span className="tabular-nums">{formatarBRL(serie.value ?? 0)}</span>
        </p>
      ))}
      {detalhe ? <p className="text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}

/**
 * Receita e despesa lado a lado, um par de colunas por mês de competência.
 *
 * Um eixo só para as duas séries: são a mesma grandeza em reais, e dois eixos
 * fariam a altura relativa das colunas mentir sobre qual das duas é maior.
 *
 * Sem rótulo em cima das colunas de propósito: são dezesseis colunas numa
 * janela de oito meses, e os números se atropelariam. Quem quer o número exato
 * tem o tooltip e a tabela do ano logo abaixo, que traz os três valores.
 */
export function ReceitaDespesaGrafico({ meses }: { meses: MesDoResultado[] }) {
  const dados = meses.map((mes) => ({
    rotulo: mes.rotulo,
    Receita: mes.receita,
    Despesa: mes.despesa,
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
          <Tooltip
            content={<ConteudoTooltip />}
            cursor={{ fill: "var(--muted)" }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="square"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
          />
          <Bar
            dataKey="Receita"
            fill={COR_RECEITA}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="Despesa"
            fill={COR_DESPESA}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * O resultado de cada mês: receita menos despesa, acima ou abaixo do zero.
 *
 * Uma grandeza só, com polaridade — então o par verde/vermelho aqui é
 * divergente, e não duas séries disputando a mesma barra. Quem não distingue as
 * duas cores lê o mesmo pela posição em relação à linha do zero e pelo sinal do
 * número escrito em cima.
 *
 * O rótulo em CADA coluna, aqui sim: são oito números, e é justamente a
 * comparação entre eles que o bloco existe para mostrar.
 */
export function ResultadoMesGrafico({ meses }: { meses: MesDoResultado[] }) {
  const dados = meses.map((mes) => ({
    rotulo: mes.rotulo,
    Resultado: mes.resultado,
  }));

  return (
    <div className={ALTURA}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          margin={{ top: 20, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="rotulo"
            tick={EIXO_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={rotuloEixoValor}
            tick={EIXO_TICK}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          {/* A linha do zero é o que faz "acima" e "abaixo" significarem algo. */}
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip
            content={<ConteudoTooltip />}
            cursor={{ fill: "var(--muted)" }}
          />
          <Bar dataKey="Resultado" radius={[3, 3, 0, 0]} maxBarSize={40}>
            {dados.map((linha) => (
              <Cell
                key={linha.rotulo}
                fill={linha.Resultado < 0 ? COR_NEGATIVO : COR_RECEITA}
              />
            ))}
            <LabelList
              dataKey="Resultado"
              position="top"
              formatter={rotuloDaColuna}
              style={ROTULO_BARRA}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
