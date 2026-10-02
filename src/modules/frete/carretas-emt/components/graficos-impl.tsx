"use client";

import type * as React from "react";
import { useRef } from "react";
import type { MouseHandlerDataParam } from "recharts";
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

// ---------------------------------------------------------------------------
// Filtro por clique: a coluna clicada recorta o resto da tela
// ---------------------------------------------------------------------------

/**
 * O clique filtra a tela pela coluna (o mês, ou a carreta no comparativo). Clicar na coluna
 * já escolhida desfaz (quem decide é o painel).
 *
 * Dois caminhos, porque nenhum cobre tudo sozinho:
 * - o clique no GRÁFICO vale na faixa inteira da coluna (a mesma que o hover pinta de cinza),
 *   não só na barra, que num mês fraco tem poucos pixels e no "Produção x gastos" são duas
 *   pilhas com vão no meio. Ele lê o índice do tooltip, que o Recharts só atualiza no
 *   mousemove, num quadro à parte: num clique sem hover antes (toque de tablet) chega vazio.
 *   Vazio não faz nada; `Number(null)` seria 0 e filtrava o primeiro mês (medido no
 *   Playwright: clicar em ago/26 filtrava jun/26).
 * - o clique na BARRA entrega a linha dela no `payload`, sem depender do hover.
 * O clique na barra sobe até o gráfico e o Recharts o repassa um quadro depois; a trava
 * descarta esse repasse, senão o mesmo clique escolhia e desfazia.
 */
export interface SelecaoGrafico {
  selecionado?: string;
  onSelecionar?: (chave: string) => void;
}

/** Com seleção, as colunas que não são a escolhida ficam esmaecidas. */
export const OPACIDADE_FORA = 0.35;

/** Janela em que o clique do gráfico é o mesmo clique que a barra já tratou. */
const MESMO_CLIQUE_MS = 400;

function opacidade(chave: string, selecionado: string | undefined): number {
  return !selecionado || chave === selecionado ? 1 : OPACIDADE_FORA;
}

function useCliqueColuna<T>(dados: T[], chave: (linha: T) => string, onSelecionar?: (chave: string) => void) {
  const ultimoDaBarra = useRef(0);
  if (!onSelecionar) return { barra: undefined, grafico: undefined };
  return {
    barra: (item: { payload?: T }) => {
      if (!item?.payload) return;
      ultimoDaBarra.current = Date.now();
      onSelecionar(chave(item.payload));
    },
    grafico: (estado: MouseHandlerDataParam) => {
      if (Date.now() - ultimoDaBarra.current < MESMO_CLIQUE_MS) return;
      const bruto = estado.activeTooltipIndex ?? estado.activeIndex;
      if (bruto === null || bruto === undefined || bruto === "") return;
      const linha = dados[Number(bruto)];
      if (linha) onSelecionar(chave(linha));
    },
  };
}

/** Ocupa a área que o CartaoGrafico dá (AreaGrafico), que cresce com o card. */
function Moldura({ children, clicavel = false }: { children: React.ReactElement; clicavel?: boolean }) {
  return (
    <div className={clicavel ? "h-full w-full cursor-pointer" : "h-full w-full"}>
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
  selecionado,
  onSelecionar,
}: {
  meses: LinhaMensal[];
  series: SerieCarreta[];
  medida: "viagens" | "producao" | "custo";
} & SelecaoGrafico) {
  const porCarreta = (m: LinhaMensal) =>
    medida === "viagens" ? m.viagensPorCarreta : medida === "producao" ? m.producaoPorCarreta : m.custoPorCarreta;
  const dados = meses.map((m) => ({
    mes: m.mes,
    rotulo: m.rotulo,
    total: medida === "viagens" ? m.viagens : medida === "producao" ? m.producao : m.custoOperacional,
    ...Object.fromEntries(series.map((s) => [s.chave, porCarreta(m)[s.chave] ?? 0])),
  }));
  const clique = useCliqueColuna(dados, (d) => d.mes, onSelecionar);
  const formatar = medida === "viagens" ? (v: number) => `${v.toLocaleString("pt-BR")} ${v === 1 ? "viagem" : "viagens"}` : formatarBRL;
  return (
    <Moldura clicavel={!!onSelecionar}>
      <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} onClick={clique.grafico}>
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
            onClick={clique.barra}
           
          >
            {dados.map((d) => (
              <Cell key={d.mes} fillOpacity={opacidade(d.mes, selecionado)} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// Produção x gastos, mês a mês
// ---------------------------------------------------------------------------

export function ProducaoVsGastosGrafico({
  meses,
  series,
  selecionado,
  onSelecionar,
}: { meses: LinhaMensal[]; series: SerieCarreta[] } & SelecaoGrafico) {
  const dados = meses.map((m) => ({
    mes: m.mes,
    rotulo: m.rotulo,
    ...Object.fromEntries(series.flatMap((s) => [[`p_${s.chave}`, m.producaoPorCarreta[s.chave] ?? 0], [`c_${s.chave}`, m.custoPorCarreta[s.chave] ?? 0]])),
    financiamento: m.parcelas + m.investimento,
    resultado: m.resultadoFinal,
    linha: m,
  }));
  const clique = useCliqueColuna(dados, (d) => d.mes, onSelecionar);
  return (
    <Moldura clicavel={!!onSelecionar}>
      <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} onClick={clique.grafico}>
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
            onClick={clique.barra}
           
          >
            {dados.map((d) => (
              <Cell key={d.mes} fillOpacity={opacidade(d.mes, selecionado)} />
            ))}
          </Bar>
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
            onClick={clique.barra}
           
          >
            {dados.map((d) => (
              <Cell key={d.mes} fillOpacity={opacidade(d.mes, selecionado)} />
            ))}
          </Bar>
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
          onClick={clique.barra}
         
        >
          {dados.map((d) => (
            <Cell key={d.mes} fillOpacity={opacidade(d.mes, selecionado)} />
          ))}
        </Bar>
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

export function ResultadoAcumuladoGrafico({ meses, selecionado, onSelecionar }: { meses: LinhaMensal[] } & SelecaoGrafico) {
  const dados = meses.map((m) => ({ mes: m.mes, rotulo: m.rotulo, operacional: m.operacionalAcumulado, final: m.resultadoAcumulado }));
  const rotuloEscolhido = dados.find((d) => d.mes === selecionado)?.rotulo;
  const clique = useCliqueColuna(dados, (d) => d.mes, onSelecionar);
  return (
    <Moldura clicavel={!!onSelecionar}>
      <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} onClick={clique.grafico}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={{ stroke: GRADE }} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} width={76} tickFormatter={eixoReais} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
        {rotuloEscolhido ? <ReferenceLine x={rotuloEscolhido} stroke="var(--foreground)" strokeWidth={1} strokeDasharray="3 3" /> : null}
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

export function ComparativoCarretasGrafico({
  desempenhos,
  series,
  selecionado,
  onSelecionar,
}: { desempenhos: Desempenho[]; series: SerieCarreta[] } & SelecaoGrafico) {
  const corDe = new Map(series.map((s) => [s.chave, s.cor]));
  const dados = desempenhos.map((d) => ({
    rotulo: d.placa ?? d.nome,
    producao: d.producao,
    custo: d.custoOperacional,
    financiamento: d.parcelas + d.investimento,
    cor: corDe.get(d.chave) ?? "var(--muted-foreground)",
    opacidade: opacidade(d.chave, selecionado),
    d,
  }));
  const clique = useCliqueColuna(dados, (x) => x.d.chave, onSelecionar);
  const daLegenda = series.filter((s) => desempenhos.some((d) => d.chave === s.chave));
  return (
    <Moldura clicavel={!!onSelecionar}>
      <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} onClick={clique.grafico}>
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
        <Bar dataKey="producao" name="Produção" maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} onClick={clique.barra}>
          {dados.map((x) => (
            <Cell key={x.rotulo} fill={x.cor} fillOpacity={x.opacidade} />
          ))}
        </Bar>
        <Bar dataKey="custo" name="Custo operacional" maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} onClick={clique.barra}>
          {dados.map((x) => (
            <Cell key={x.rotulo} fill={tomClaro(x.cor)} fillOpacity={x.opacidade} />
          ))}
        </Bar>
        <Bar dataKey="financiamento" name="Financiamento e aquisição" fill={COR_MEDIDA.financiamento} maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} onClick={clique.barra}>
          {dados.map((x) => (
            <Cell key={x.rotulo} fillOpacity={x.opacidade} />
          ))}
        </Bar>
      </BarChart>
    </Moldura>
  );
}
