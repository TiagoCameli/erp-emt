"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatarBRL } from "@/lib/formatadores";

/**
 * Gráficos do painel do Frete (Evolução Mensal, Evolução de Compras e Custo Material vs
 * Frete da origem). Recharts 3, sem animação (a animação de entrada deixa a barra
 * invisível quando o quadro não avança) e com o clique pelo `activeIndex` do gráfico (o
 * `activePayload` do Recharts 2 não existe mais).
 *
 * Cor: a barra é o verde da marca e a linha de contagem o âmbar; o par material x frete
 * é verde x âmbar (verde x vermelho não se distingue em deuteranopia).
 */

const EIXO = { fontSize: 11, fill: "var(--muted-foreground)" };
const COR_BARRA = "var(--color-chart-1)";
const COR_LINHA = "var(--color-chart-2)";

const compacto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const eixoValor = (v: number) => (v === 0 ? "R$ 0" : compacto.format(v));
const eixoToneladas = (v: number) => `${v.toLocaleString("pt-BR")} t`;

function indiceDoClique(estado: unknown): number | null {
  const i = Number((estado as { activeIndex?: number | string } | undefined)?.activeIndex);
  return Number.isInteger(i) ? i : null;
}

export interface PontoMensal {
  ym: string;
  rotulo: string;
  barra: number;
  contagem: number;
}

export interface EvolucaoGraficoProps {
  dados: PontoMensal[];
  /** "valor" (R$) ou "toneladas". */
  unidade: "valor" | "toneladas";
  nomeBarra: string;
  nomeContagem: string;
  selecionado?: string;
  onAlternarMes: (ym: string) => void;
}

export function EvolucaoGrafico({ dados, unidade, nomeBarra, nomeContagem, selecionado, onAlternarMes }: EvolucaoGraficoProps) {
  const formatar = unidade === "valor" ? formatarBRL : (v: number) => `${v.toLocaleString("pt-BR")} t`;
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={dados}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          style={{ cursor: "pointer" }}
          onClick={(estado: unknown) => {
            const i = indiceDoClique(estado);
            const ponto = i === null ? undefined : dados[i];
            if (ponto) onAlternarMes(ponto.ym);
          }}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis
            yAxisId="esq"
            tickFormatter={unidade === "valor" ? eixoValor : eixoToneladas}
            tick={EIXO}
            tickLine={false}
            axisLine={false}
            width={76}
          />
          <YAxis yAxisId="dir" orientation="right" tick={EIXO} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(valor, nome) => [nome === nomeBarra ? formatar(Number(valor)) : String(valor), String(nome)]}
          />
          <Legend verticalAlign="top" align="right" height={28} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="esq" dataKey="barra" name={nomeBarra} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false}>
            {dados.map((d) => (
              <Cell key={d.ym} fill={COR_BARRA} fillOpacity={selecionado && selecionado !== d.ym ? 0.3 : 1} />
            ))}
          </Bar>
          <Line
            yAxisId="dir"
            type="monotone"
            dataKey="contagem"
            name={nomeContagem}
            stroke={COR_LINHA}
            strokeWidth={2}
            dot={{ r: 3, fill: COR_LINHA }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface MaterialVsFreteGraficoProps {
  dados: { id: string; nome: string; material: number; frete: number }[];
  onAlternarMaterial: (id: string) => void;
}

export function MaterialVsFreteGrafico({ dados, onAlternarMaterial }: MaterialVsFreteGraficoProps) {
  const curtos = dados.map((d) => ({ ...d, curto: d.nome.length > 18 ? `${d.nome.slice(0, 18)}…` : d.nome }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={curtos}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          style={{ cursor: "pointer" }}
          onClick={(estado: unknown) => {
            const i = indiceDoClique(estado);
            const ponto = i === null ? undefined : curtos[i];
            if (ponto) onAlternarMaterial(ponto.id);
          }}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="curto" tick={EIXO} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval={0} />
          <YAxis tickFormatter={eixoValor} tick={EIXO} tickLine={false} axisLine={false} width={76} />
          <Tooltip cursor={{ fill: "var(--muted)" }} formatter={(valor, nome) => [formatarBRL(Number(valor)), String(nome)]} />
          <Legend verticalAlign="top" align="right" height={28} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="material" name="Material (R$)" fill={COR_BARRA} radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
          <Bar dataKey="frete" name="Frete (R$)" fill={COR_LINHA} radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
