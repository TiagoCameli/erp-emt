"use client";

import type * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatarBRL } from "@/lib/formatadores";
import type { Desempenho, LinhaMensal } from "@/modules/frete/carretas-emt/calculo";

/**
 * Os gráficos da aba Carretas EMT. Recharts 3, sem animação (a animação de entrada deixa a
 * barra invisível quando o quadro não avança, ver o painel do Combustível).
 *
 * UM EIXO POR GRÁFICO: viagens e reais nunca dividem o mesmo quadro. As cores vêm dos tokens
 * `--viz-*` do globals.css (paleta validada para daltonismo nos dois temas); a cor de cada
 * carreta segue a POSIÇÃO DELA NO CADASTRO, não no ranking, para não trocar de cor quando o
 * filtro muda. Placa não reconhecida fica em cinza.
 */

const EIXO = { fontSize: 11, fill: "var(--muted-foreground)" };
const GRADE = "var(--border)";
const CURSOR = { fill: "var(--muted)", opacity: 0.6 };
const LEGENDA = { fontSize: 11, color: "var(--muted-foreground)", paddingBottom: 8 };

export const COR_MEDIDA = {
  producao: "var(--viz-producao)",
  custo: "var(--viz-custo)",
  financiamento: "var(--viz-financiamento)",
  resultado: "var(--foreground)",
} as const;

const compacto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const eixoReais = (v: number) => (v === 0 ? "R$ 0" : compacto.format(v));

export interface SerieCarreta {
  chave: string;
  rotulo: string;
  cor: string;
}

function Dica({ titulo, linhas, rodape }: { titulo: string; linhas: { rotulo: string; valor: React.ReactNode; cor?: string }[]; rodape?: React.ReactNode }) {
  return (
    <div className="min-w-48 rounded-md border border-border bg-popover px-3 py-2 text-detalhe shadow-md">
      <p className="mb-1 font-semibold text-foreground">{titulo}</p>
      {linhas.map((linha) => (
        <div key={linha.rotulo} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {linha.cor ? <span className="size-2 rounded-full" style={{ background: linha.cor }} /> : null}
            {linha.rotulo}
          </span>
          <span className="tabular-nums text-foreground">{linha.valor}</span>
        </div>
      ))}
      {rodape ? <div className="mt-1 border-t border-border pt-1 text-legenda text-muted-foreground">{rodape}</div> : null}
    </div>
  );
}

function Moldura({ children }: { children: React.ReactElement }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Viagens e produção por mês, empilhadas por carreta
// ---------------------------------------------------------------------------

export function PorCarretaMensalGrafico({
  meses,
  series,
  medida,
}: {
  meses: LinhaMensal[];
  series: SerieCarreta[];
  medida: "viagens" | "producao";
}) {
  const dados = meses.map((m) => ({
    rotulo: m.rotulo,
    total: medida === "viagens" ? m.viagens : m.producao,
    ...Object.fromEntries(
      series.map((s) => [s.chave, (medida === "viagens" ? m.viagensPorCarreta[s.chave] : m.producaoPorCarreta[s.chave]) ?? 0]),
    ),
  }));
  const formatar = medida === "viagens" ? (v: number) => `${v.toLocaleString("pt-BR")} ${v === 1 ? "viagem" : "viagens"}` : formatarBRL;
  return (
    <Moldura>
      <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={{ stroke: GRADE }} />
        <YAxis
          tick={EIXO}
          tickLine={false}
          axisLine={false}
          width={medida === "viagens" ? 36 : 76}
          allowDecimals={false}
          tickFormatter={medida === "viagens" ? undefined : eixoReais}
        />
        <Tooltip
          cursor={CURSOR}
          content={({ active, payload, label }) => {
            const ponto = payload?.[0]?.payload as Record<string, number> | undefined;
            if (!active || !ponto) return null;
            return (
              <Dica
                titulo={String(label)}
                linhas={series
                  .filter((s) => (ponto[s.chave] ?? 0) > 0)
                  .map((s) => ({ rotulo: s.rotulo, valor: formatar(ponto[s.chave] ?? 0), cor: s.cor }))}
                rodape={<span className="tabular-nums">Total: {formatar(ponto.total ?? 0)}</span>}
              />
            );
          }}
        />
        <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={LEGENDA} />
        {series.map((s, i) => (
          <Bar
            key={s.chave}
            dataKey={s.chave}
            name={s.rotulo}
            stackId="carretas"
            fill={s.cor}
            stroke="var(--card)"
            strokeWidth={1}
            maxBarSize={44}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// Produção x gastos, mês a mês
// ---------------------------------------------------------------------------

export function ProducaoVsGastosGrafico({ meses }: { meses: LinhaMensal[] }) {
  const dados = meses.map((m) => ({
    rotulo: m.rotulo,
    producao: m.producao,
    custo: m.custoOperacional,
    financiamento: m.parcelas + m.investimento,
    resultado: m.resultadoFinal,
    linha: m,
  }));
  return (
    <Moldura>
      <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={{ stroke: GRADE }} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} width={76} tickFormatter={eixoReais} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
        <Tooltip
          cursor={CURSOR}
          content={({ active, payload, label }) => {
            const m = (payload?.[0]?.payload as { linha?: LinhaMensal } | undefined)?.linha;
            if (!active || !m) return null;
            return (
              <Dica
                titulo={String(label)}
                linhas={[
                  { rotulo: "Produção (fretes)", valor: formatarBRL(m.producao), cor: COR_MEDIDA.producao },
                  { rotulo: "Custo operacional", valor: formatarBRL(m.custoOperacional), cor: COR_MEDIDA.custo },
                  { rotulo: "Parcelas de financiamento", valor: formatarBRL(m.parcelas), cor: COR_MEDIDA.financiamento },
                  { rotulo: "Aquisição à vista", valor: formatarBRL(m.investimento), cor: COR_MEDIDA.financiamento },
                  { rotulo: "Resultado operacional", valor: formatarBRL(m.resultadoOperacional) },
                ]}
                rodape={<span className="tabular-nums">Resultado final: {formatarBRL(m.resultadoFinal)}</span>}
              />
            );
          }}
        />
        <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={LEGENDA} />
        <Bar dataKey="producao" name="Produção" fill={COR_MEDIDA.producao} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="custo" name="Custo operacional" stackId="gasto" fill={COR_MEDIDA.custo} stroke="var(--card)" strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
        <Bar
          dataKey="financiamento"
          name="Financiamento e aquisição"
          stackId="gasto"
          fill={COR_MEDIDA.financiamento}
          stroke="var(--card)"
          strokeWidth={1}
          maxBarSize={28}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          dataKey="resultado"
          name="Resultado final"
          type="monotone"
          stroke={COR_MEDIDA.resultado}
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={{ r: 3, fill: COR_MEDIDA.resultado }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// Resultado acumulado: quando a produção paga a carreta
// ---------------------------------------------------------------------------

export function ResultadoAcumuladoGrafico({ meses }: { meses: LinhaMensal[] }) {
  const dados = meses.map((m) => ({ rotulo: m.rotulo, operacional: m.operacionalAcumulado, final: m.resultadoAcumulado }));
  return (
    <Moldura>
      <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={{ stroke: GRADE }} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} width={76} tickFormatter={eixoReais} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
        <Tooltip
          content={({ active, payload, label }) => {
            const p = payload?.[0]?.payload as { operacional: number; final: number } | undefined;
            if (!active || !p) return null;
            return (
              <Dica
                titulo={`Acumulado até ${String(label)}`}
                linhas={[
                  { rotulo: "Resultado operacional", valor: formatarBRL(p.operacional), cor: COR_MEDIDA.producao },
                  { rotulo: "Após financiamento", valor: formatarBRL(p.final), cor: COR_MEDIDA.financiamento },
                ]}
              />
            );
          }}
        />
        <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={LEGENDA} />
        <Line dataKey="operacional" name="Resultado operacional" type="monotone" stroke={COR_MEDIDA.producao} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        <Line dataKey="final" name="Após financiamento e aquisição" type="monotone" stroke={COR_MEDIDA.financiamento} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// Comparativo por carreta
// ---------------------------------------------------------------------------

export function ComparativoCarretasGrafico({ desempenhos }: { desempenhos: Desempenho[] }) {
  const dados = desempenhos.map((d) => ({
    rotulo: d.placa ?? d.nome,
    producao: d.producao,
    custo: d.custoOperacional,
    financiamento: d.parcelas + d.investimento,
    d,
  }));
  return (
    <Moldura>
      <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={{ stroke: GRADE }} interval={0} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} width={76} tickFormatter={eixoReais} />
        <Tooltip
          cursor={CURSOR}
          content={({ active, payload }) => {
            const d = (payload?.[0]?.payload as { d?: Desempenho } | undefined)?.d;
            if (!active || !d) return null;
            return (
              <Dica
                titulo={d.nome}
                linhas={[
                  { rotulo: "Produção", valor: formatarBRL(d.producao), cor: COR_MEDIDA.producao },
                  { rotulo: "Custo operacional", valor: formatarBRL(d.custoOperacional), cor: COR_MEDIDA.custo },
                  { rotulo: "Financiamento e aquisição", valor: formatarBRL(d.parcelas + d.investimento), cor: COR_MEDIDA.financiamento },
                ]}
                rodape={<span className="tabular-nums">Resultado final: {formatarBRL(d.resultadoFinal)}</span>}
              />
            );
          }}
        />
        <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={LEGENDA} />
        <Bar dataKey="producao" name="Produção" fill={COR_MEDIDA.producao} maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="custo" name="Custo operacional" fill={COR_MEDIDA.custo} maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="financiamento" name="Financiamento e aquisição" fill={COR_MEDIDA.financiamento} maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </Moldura>
  );
}
