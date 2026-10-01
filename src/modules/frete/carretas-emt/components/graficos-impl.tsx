"use client";

import type * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
 *
 * Onde produção e custo dividem o quadro, a carreta mantém a cor dela: cheia na produção,
 * clara (`tomClaro`) no custo operacional.
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

/** O tom claro da cor da carreta, para o custo operacional ao lado da produção. */
export function tomClaro(cor: string): string {
  return `color-mix(in srgb, ${cor} 45%, var(--card))`;
}

function Amostra({ cor, tracejada = false }: { cor: string; tracejada?: boolean }) {
  return tracejada ? (
    <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: cor }} />
  ) : (
    <span className="inline-block size-2.5 rounded-sm" style={{ background: cor }} />
  );
}

/** Legenda dos quadros de produção x custo: cada carreta com o par cheia/clara. */
function LegendaProducaoCusto({ series, comResultado = false }: { series: SerieCarreta[]; comResultado?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 pb-2 text-legenda text-muted-foreground">
      {series.map((s) => (
        <span key={s.chave} className="inline-flex items-center gap-1">
          <Amostra cor={s.cor} />
          <Amostra cor={tomClaro(s.cor)} />
          {s.rotulo}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <Amostra cor={COR_MEDIDA.financiamento} />
        Financiamento e aquisição
      </span>
      {comResultado ? (
        <span className="inline-flex items-center gap-1">
          <Amostra cor={COR_MEDIDA.resultado} tracejada />
          Resultado final
        </span>
      ) : null}
      <span className="basis-full text-right">Cor cheia: produção. Cor clara: custo operacional.</span>
    </div>
  );
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

/** Ocupa a área que o CartaoGrafico dá (AreaGrafico), que cresce com o card. */
function Moldura({ children }: { children: React.ReactElement }) {
  return (
    <div className="h-full w-full">
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
  medida: "viagens" | "producao" | "custo";
}) {
  const porCarreta = (m: LinhaMensal) =>
    medida === "viagens" ? m.viagensPorCarreta : medida === "producao" ? m.producaoPorCarreta : m.custoPorCarreta;
  const dados = meses.map((m) => ({
    rotulo: m.rotulo,
    total: medida === "viagens" ? m.viagens : medida === "producao" ? m.producao : m.custoOperacional,
    ...Object.fromEntries(series.map((s) => [s.chave, porCarreta(m)[s.chave] ?? 0])),
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

export function ProducaoVsGastosGrafico({ meses, series }: { meses: LinhaMensal[]; series: SerieCarreta[] }) {
  const dados = meses.map((m) => ({
    rotulo: m.rotulo,
    ...Object.fromEntries(series.flatMap((s) => [[`p_${s.chave}`, m.producaoPorCarreta[s.chave] ?? 0], [`c_${s.chave}`, m.custoPorCarreta[s.chave] ?? 0]])),
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
            const porCarreta = series.flatMap((s) => [
              { rotulo: `${s.rotulo}, produção`, v: m.producaoPorCarreta[s.chave] ?? 0, cor: s.cor },
              { rotulo: `${s.rotulo}, custo`, v: m.custoPorCarreta[s.chave] ?? 0, cor: tomClaro(s.cor) },
            ]);
            return (
              <Dica
                titulo={String(label)}
                linhas={[
                  ...porCarreta.filter((l) => l.v !== 0).map((l) => ({ rotulo: l.rotulo, valor: formatarBRL(l.v), cor: l.cor })),
                  { rotulo: "Produção (fretes)", valor: formatarBRL(m.producao) },
                  { rotulo: "Custo operacional", valor: formatarBRL(m.custoOperacional) },
                  { rotulo: "Parcelas de financiamento", valor: formatarBRL(m.parcelas), cor: COR_MEDIDA.financiamento },
                  { rotulo: "Aquisição à vista", valor: formatarBRL(m.investimento), cor: COR_MEDIDA.financiamento },
                  { rotulo: "Resultado operacional", valor: formatarBRL(m.resultadoOperacional) },
                ]}
                rodape={<span className="tabular-nums">Resultado final: {formatarBRL(m.resultadoFinal)}</span>}
              />
            );
          }}
        />
        <Legend verticalAlign="top" content={() => <LegendaProducaoCusto series={series} comResultado />} />
        {series.map((s, i) => (
          <Bar
            key={`p_${s.chave}`}
            dataKey={`p_${s.chave}`}
            name={`${s.rotulo}, produção`}
            stackId="producao"
            fill={s.cor}
            stroke="var(--card)"
            strokeWidth={1}
            maxBarSize={28}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
        {series.map((s) => (
          <Bar
            key={`c_${s.chave}`}
            dataKey={`c_${s.chave}`}
            name={`${s.rotulo}, custo`}
            stackId="gasto"
            fill={tomClaro(s.cor)}
            stroke="var(--card)"
            strokeWidth={1}
            maxBarSize={28}
            isAnimationActive={false}
          />
        ))}
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

export function ComparativoCarretasGrafico({ desempenhos, series }: { desempenhos: Desempenho[]; series: SerieCarreta[] }) {
  const corDe = new Map(series.map((s) => [s.chave, s.cor]));
  const dados = desempenhos.map((d) => ({
    rotulo: d.placa ?? d.nome,
    producao: d.producao,
    custo: d.custoOperacional,
    financiamento: d.parcelas + d.investimento,
    cor: corDe.get(d.chave) ?? "var(--muted-foreground)",
    d,
  }));
  const daLegenda = series.filter((s) => desempenhos.some((d) => d.chave === s.chave));
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
                  { rotulo: "Produção", valor: formatarBRL(d.producao), cor: corDe.get(d.chave) },
                  { rotulo: "Custo operacional", valor: formatarBRL(d.custoOperacional), cor: tomClaro(corDe.get(d.chave) ?? "var(--muted-foreground)") },
                  { rotulo: "Financiamento e aquisição", valor: formatarBRL(d.parcelas + d.investimento), cor: COR_MEDIDA.financiamento },
                ]}
                rodape={<span className="tabular-nums">Resultado final: {formatarBRL(d.resultadoFinal)}</span>}
              />
            );
          }}
        />
        <Legend verticalAlign="top" content={() => <LegendaProducaoCusto series={daLegenda} />} />
        <Bar dataKey="producao" name="Produção" maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {dados.map((x) => (
            <Cell key={x.rotulo} fill={x.cor} />
          ))}
        </Bar>
        <Bar dataKey="custo" name="Custo operacional" maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {dados.map((x) => (
            <Cell key={x.rotulo} fill={tomClaro(x.cor)} />
          ))}
        </Bar>
        <Bar dataKey="financiamento" name="Financiamento e aquisição" fill={COR_MEDIDA.financiamento} maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </Moldura>
  );
}
