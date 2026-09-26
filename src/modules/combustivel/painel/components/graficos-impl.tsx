"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";

import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { useRecorteCombustivel } from "@/modules/combustivel/_shared/components/barra-filtros-combustivel";
import type { FiltroGlobal } from "@/modules/combustivel/_shared/filtro-global";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import {
  ID_SEM_OBRA,
  niceMax,
  type BaldeEvolucao,
  type Granularidade,
} from "@/modules/combustivel/painel/calculo";
import { COR_PAINEL, ID_OUTROS_COMBUSTIVEIS } from "@/modules/combustivel/painel/cores";
import { brlCompactoDe, litrosCompactos, porcento, reais4 } from "@/modules/combustivel/painel/formato";
import type {
  ConsumidorPainel,
  FatiaMix,
  FornecedorPainel,
  ObraPainel,
} from "@/modules/combustivel/painel/queries";

import { Alternador, CartaoGrafico, GraficoVazio } from "./cartao-grafico";

/**
 * Os gráficos da Visão Geral da origem (v2/visao-geral/charts), em Recharts, com as cores
 * do ERP. O que os gráficos da origem faziam ao clique continua: clicar num item liga ou
 * desliga aquele item no filtro global (na URL), e clicar numa barra da Evolução estreita o
 * período para ela.
 *
 * Toda série com `isAnimationActive={false}`: no Recharts 3 a animação de entrada começa com
 * altura 0 e, se não avança, a barra nunca aparece (eixo e legenda sem barra nenhuma).
 */

const EIXO = { fontSize: 11, fill: "var(--color-muted-foreground)" };
const GRADE = "var(--color-border)";
const CURSOR = { fill: "var(--color-muted)", opacity: 0.5 };

const brlEixo = brlCompactoDe;

/** A caixa de tooltip da origem (ChartTooltip): título, linhas com bolinha de cor, rodapé. */
function Dica({
  titulo,
  linhas,
  rodape,
}: {
  titulo: string;
  linhas: { rotulo: string; valor: React.ReactNode; cor?: string }[];
  rodape?: string;
}) {
  return (
    <div className="min-w-44 rounded-md border border-border bg-popover px-3 py-2 text-detalhe shadow-md">
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
      {rodape ? <p className="mt-1 border-t border-border pt-1 text-legenda text-muted-foreground">{rodape}</p> : null}
    </div>
  );
}

function dataCurtaDoDia(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(2, 4)}`;
}

// ---------------------------------------------------------------------------
// G1 Evolução temporal
// ---------------------------------------------------------------------------

const GRANULARIDADES = [
  { id: "dia", rotulo: "Dia" },
  { id: "semana", rotulo: "Semana" },
  { id: "mes", rotulo: "Mês" },
] as const;

export function EvolucaoTemporal({
  evolucao,
  granularidadeInicial,
  vazio,
  filtro,
}: {
  evolucao: Record<Granularidade, BaldeEvolucao[]>;
  /** A automática do período (`autoGranularidade`); o botão troca sem recarregar. */
  granularidadeInicial: Granularidade;
  vazio: boolean;
  filtro: FiltroGlobal;
}) {
  const recorte = useRecorteCombustivel(filtro);
  // Mudou o período, volta para a automática (a origem: `useEffect` em autoG).
  const [escolha, setEscolha] = React.useState({ base: granularidadeInicial, valor: granularidadeInicial });
  const granularidade = escolha.base === granularidadeInicial ? escolha.valor : granularidadeInicial;
  const dados = evolucao[granularidade];

  return (
    <CartaoGrafico
      titulo="Evolução temporal"
      subtitulo="Volume × Custo por período"
      acoes={
        <Alternador
          rotulo="Granularidade"
          opcoes={GRANULARIDADES}
          valor={granularidade}
          onValorChange={(valor) => setEscolha({ base: granularidadeInicial, valor })}
        />
      }
    >
      {vazio ? (
        <GraficoVazio />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={GRADE} vertical={false} />
            <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
            <YAxis yAxisId="L" tick={EIXO} tickLine={false} axisLine={false} tickFormatter={litrosCompactos} width={64} />
            <YAxis
              yAxisId="R$"
              orientation="right"
              tick={EIXO}
              tickLine={false}
              axisLine={false}
              tickFormatter={brlEixo}
              width={72}
            />
            <Tooltip
              cursor={CURSOR}
              content={({ active, payload }) => {
                const balde = payload?.[0]?.payload as BaldeEvolucao | undefined;
                if (!active || !balde) return null;
                const rPorL = balde.litros > 0 ? balde.custo / balde.litros : 0;
                return (
                  <Dica
                    titulo={balde.rotulo}
                    linhas={[
                      { rotulo: "Volume", valor: formatarLitros(balde.litros), cor: COR_PAINEL.principal },
                      { rotulo: "Custo", valor: formatarBRL(balde.custo), cor: COR_PAINEL.custo },
                      { rotulo: "R$/L", valor: rPorL > 0 ? reais4(rPorL) : "Sem volume" },
                    ]}
                    rodape={`${dataCurtaDoDia(balde.de)} – ${dataCurtaDoDia(balde.ate)} · clique para filtrar`}
                  />
                );
              }}
            />
            <Legend
              align="right"
              verticalAlign="top"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: "var(--color-muted-foreground)", paddingBottom: 8 }}
            />
            <Bar
              yAxisId="L"
              dataKey="litros"
              name="Volume (L)"
              fill={COR_PAINEL.principal}
              fillOpacity={0.7}
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              isAnimationActive={false}
              onClick={(_, indice) => {
                const balde = dados[indice];
                if (balde) recorte.definirPeriodo(balde.de, balde.ate);
              }}
            />
            <Line
              yAxisId="R$"
              type="monotone"
              dataKey="custo"
              name="Custo (R$)"
              stroke={COR_PAINEL.custo}
              strokeWidth={1.75}
              dot={{ r: 2.5, fill: COR_PAINEL.custo }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </CartaoGrafico>
  );
}

// ---------------------------------------------------------------------------
// G2 Mix de combustível
// ---------------------------------------------------------------------------

export function MixCombustivel({ fatias, filtro }: { fatias: FatiaMix[]; filtro: FiltroGlobal }) {
  const recorte = useRecorteCombustivel(filtro);
  const total = fatias.reduce((acc, f) => acc + f.litros, 0);
  const marcados = filtro.combustiveis;
  const alternar = (fatia: FatiaMix | undefined) => {
    if (fatia && fatia.id !== ID_OUTROS_COMBUSTIVEIS) recorte.alternar("combustiveis", fatia.id);
  };

  return (
    <CartaoGrafico titulo="Mix de combustível" subtitulo="Volume por tipo">
      {fatias.length === 0 ? (
        <GraficoVazio />
      ) : fatias.length === 1 ? (
        // Rosca de uma fatia só não diz nada: um resumo lê melhor (a origem faz igual).
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="size-12 rounded-full" style={{ background: fatias[0]!.cor }} aria-hidden />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Único combustível usado</p>
          <p className="text-base font-semibold text-foreground">{fatias[0]!.nome}</p>
          <p className="text-sm tabular-nums text-muted-foreground">
            {formatarLitros(fatias[0]!.litros)} · {formatarBRL(fatias[0]!.custo)}
          </p>
        </div>
      ) : (
        <div className="flex h-full items-center gap-4 px-2">
          <div className="relative size-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={fatias}
                  dataKey="litros"
                  nameKey="nome"
                  innerRadius={56}
                  outerRadius={82}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                  onClick={(_, indice) => alternar(fatias[indice])}
                >
                  {fatias.map((f) => (
                    <Cell
                      key={f.id}
                      fill={f.cor}
                      fillOpacity={marcados.length > 0 && !marcados.includes(f.id) ? 0.4 : 1}
                      cursor={f.id === ID_OUTROS_COMBUSTIVEIS ? "default" : "pointer"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    const fatia = payload?.[0]?.payload as FatiaMix | undefined;
                    if (!active || !fatia) return null;
                    return (
                      <Dica
                        titulo={fatia.nome}
                        linhas={[
                          { rotulo: "Volume", valor: formatarLitros(fatia.litros), cor: fatia.cor },
                          { rotulo: "Custo", valor: formatarBRL(fatia.custo) },
                          { rotulo: "% do total", valor: porcento(fatia.pct) },
                        ]}
                      />
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
              <span className="text-base font-bold tabular-nums text-foreground">{formatarLitros(total)}</span>
            </div>
          </div>
          <ul className="max-h-full min-w-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {fatias.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  disabled={f.id === ID_OUTROS_COMBUSTIVEIS}
                  onClick={() => alternar(f)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-legenda transition-colors",
                    marcados.includes(f.id) ? "bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: f.cor }} />
                    <span className="truncate text-foreground">{f.nome}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{porcento(f.pct)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CartaoGrafico>
  );
}

// ---------------------------------------------------------------------------
// G3 Top equipamentos / Top carretas
// ---------------------------------------------------------------------------

type Metrica = "litros" | "custo";
const METRICAS = [
  { id: "litros", rotulo: "Litros" },
  { id: "custo", rotulo: "R$" },
] as const;

/** Os 10 maiores pela métrica escolhida (a origem reordena ao trocar Litros/R$). */
export function topPorMetrica(consumidores: readonly ConsumidorPainel[], metrica: Metrica, topN = 10): ConsumidorPainel[] {
  return [...consumidores].sort((a, b) => b[metrica] - a[metrica]).slice(0, topN);
}

export function TopConsumidores({
  consumidores,
  filtro,
  hrefSentinela,
}: {
  consumidores: ConsumidorPainel[];
  filtro: FiltroGlobal;
  /** Clique no "Não identificado": a mesma ação do aviso (atribuir). `null` = sem ação. */
  hrefSentinela: string | null;
}) {
  const recorte = useRecorteCombustivel(filtro);
  const router = useRouter();
  const [metrica, setMetrica] = React.useState<Metrica>("litros");
  const proprios = filtro.modo === "proprios";
  const dimensao = proprios ? "equipamentos" : "placas";
  const marcados = filtro[dimensao];
  const linhas = topPorMetrica(consumidores, metrica);
  const maximo = linhas.reduce((acc, l) => Math.max(acc, l[metrica]), 0);
  const emLista = linhas.length > 0 && linhas.length < 3;
  const alturaGrafico = emLista ? Math.max(140, linhas.length * 56 + 16) : Math.max(180, linhas.length * (proprios ? 30 : 36));
  const formatar = (l: ConsumidorPainel) => (metrica === "litros" ? formatarLitros(l.litros) : formatarBRL(l.custo));

  function clicar(linha: ConsumidorPainel | undefined) {
    if (!linha) return;
    if (linha.sentinela) {
      if (hrefSentinela) router.push(hrefSentinela);
      return;
    }
    recorte.alternar(dimensao, linha.id);
  }

  return (
    <CartaoGrafico
      titulo={proprios ? "Top equipamentos" : "Top carretas"}
      subtitulo={proprios ? "Maiores consumidores no período" : "Placas com maior consumo no período"}
      altura={alturaGrafico + 32}
      acoes={<Alternador rotulo="Métrica" opcoes={METRICAS} valor={metrica} onValorChange={setMetrica} />}
    >
      {linhas.length === 0 ? (
        <GraficoVazio texto={proprios ? "Nenhuma saída no período" : "Nenhuma carreta abasteceu no período"} />
      ) : emLista ? (
        <ul className="h-full space-y-2 overflow-y-auto px-3 py-2">
          {linhas.map((l, i) => {
            const marcado = !l.sentinela && marcados.includes(l.id);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => clicar(l)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    marcado ? "bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-legenda font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 truncate text-sm font-medium",
                        l.sentinela ? "text-status-pendente" : "text-foreground",
                        !proprios && "font-mono",
                      )}
                    >
                      {l.sentinela ? <AlertTriangle className="size-3.5 shrink-0" /> : null}
                      {l.nome}
                    </span>
                    {l.detalhe ? <span className="block truncate text-[10px] text-muted-foreground">{l.detalhe}</span> : null}
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full"
                        style={{
                          width: `${Math.max(maximo > 0 ? (l[metrica] / maximo) * 100 : 0, 4)}%`,
                          background: l.sentinela ? COR_PAINEL.atencao : COR_PAINEL.principal,
                        }}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums text-foreground">{formatar(l)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={linhas} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <XAxis
              type="number"
              tick={EIXO}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => (metrica === "litros" ? litrosCompactos(v) : brlEixo(v))}
              domain={[0, niceMax(maximo)]}
            />
            <YAxis
              type="category"
              dataKey="nome"
              tick={proprios ? EIXO : { ...EIXO, fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={proprios ? 140 : 100}
              interval={0}
            />
            <Tooltip
              cursor={CURSOR}
              content={({ active, payload }) => {
                const l = payload?.[0]?.payload as ConsumidorPainel | undefined;
                if (!active || !l) return null;
                return (
                  <Dica
                    titulo={proprios ? l.nome : [l.nome, l.detalhe].filter(Boolean).join(" · ")}
                    linhas={[
                      { rotulo: "Volume", valor: formatarLitros(l.litros), cor: l.sentinela ? COR_PAINEL.atencao : COR_PAINEL.principal },
                      { rotulo: "Custo", valor: formatarBRL(l.custo) },
                      proprios && l.detalhe
                        ? { rotulo: l.sentinela ? "Saídas" : "Código", valor: l.detalhe }
                        : { rotulo: "Abastecimentos", valor: l.qtd },
                    ]}
                    rodape={l.sentinela ? "Clique para atribuir retroativamente" : "Clique para filtrar"}
                  />
                );
              }}
            />
            <Bar dataKey={metrica} radius={[0, 6, 6, 0]} isAnimationActive={false} onClick={(_, indice) => clicar(linhas[indice])}>
              {linhas.map((l) => {
                const marcado = !l.sentinela && marcados.includes(l.id);
                return (
                  <Cell
                    key={l.id}
                    cursor="pointer"
                    fill={l.sentinela ? COR_PAINEL.atencao : marcado ? COR_PAINEL.marcado : COR_PAINEL.principal}
                    fillOpacity={!l.sentinela && marcados.length > 0 && !marcado ? 0.4 : 1}
                    stroke={l.sentinela ? COR_PAINEL.atencao : undefined}
                    strokeWidth={l.sentinela ? 1 : 0}
                    strokeDasharray={l.sentinela ? "3 2" : undefined}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </CartaoGrafico>
  );
}

// ---------------------------------------------------------------------------
// G4 Custo por obra
// ---------------------------------------------------------------------------

export function CustoPorObra({ obras, filtro }: { obras: ObraPainel[]; filtro: FiltroGlobal }) {
  const recorte = useRecorteCombustivel(filtro);
  const marcados = filtro.obras;
  const alternar = (id: string) => {
    if (id !== ID_SEM_OBRA) recorte.alternar("obras", id);
  };
  const opacidade = (id: string) => (marcados.length > 0 && !marcados.includes(id) ? 0.45 : 1);
  // Uma cor só: a área (ou o comprimento) já carrega o tamanho. "Sem obra" é agregado.
  const cor = (id: string) => (id === ID_SEM_OBRA ? COR_PAINEL.agregado : COR_PAINEL.principal);

  return (
    <CartaoGrafico titulo="Custo por obra" subtitulo="Distribuição do custo no período">
      {obras.length === 0 ? (
        <GraficoVazio />
      ) : obras.length === 1 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Única obra no período</p>
          <p className="max-w-full truncate text-base font-semibold text-foreground">{obras[0]!.nome}</p>
          <p className="text-sm tabular-nums text-muted-foreground">
            {formatarBRL(obras[0]!.custo)} · {formatarLitros(obras[0]!.litros)}
          </p>
        </div>
      ) : obras.length >= 4 ? (
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            isAnimationActive={false}
            data={obras.map((o) => ({ ...o, name: o.nome, size: Math.max(o.custo, 0.01) }))}
            dataKey="size"
            stroke="var(--color-card)"
            content={(no) => {
              const id = typeof no.id === "string" ? no.id : null;
              const { x, y, width, height } = no;
              if (!id || no.depth !== 1 || width <= 0 || height <= 0) return <g />;
              const nome = typeof no.nome === "string" ? no.nome : "";
              const custo = typeof no.custo === "number" ? no.custo : 0;
              const pct = typeof no.pct === "number" ? no.pct : 0;
              const caracteres = Math.floor(width / 6);
              return (
                <g onClick={() => alternar(id)} style={{ cursor: id === ID_SEM_OBRA ? "default" : "pointer" }}>
                  <title>{`${nome}: ${formatarBRL(custo)} (${porcento(pct)})`}</title>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={cor(id)}
                    fillOpacity={opacidade(id)}
                    stroke="var(--color-card)"
                    strokeWidth={2}
                  />
                  {width > 70 && height > 32 ? (
                    <text x={x + 8} y={y + 16} fill="white" fontSize={11} fontWeight={600} style={{ pointerEvents: "none" }}>
                      {nome.length > caracteres ? `${nome.slice(0, Math.max(caracteres - 1, 1))}…` : nome}
                    </text>
                  ) : null}
                  {width > 90 && height > 50 ? (
                    <text x={x + 8} y={y + 32} fill="white" fontSize={10} fillOpacity={0.85} style={{ pointerEvents: "none" }}>
                      {`${brlEixo(custo)} · ${porcento(pct)}`}
                    </text>
                  ) : null}
                </g>
              );
            }}
          />
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full flex-col justify-center gap-2 px-2 py-3">
          {obras.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => alternar(o.id)}
              className="text-left"
              style={{ opacity: opacidade(o.id) }}
            >
              <span className="mb-1 flex items-center justify-between gap-2 text-legenda">
                <span className="truncate font-medium text-foreground">{o.nome}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatarBRL(o.custo)} <span>· {porcento(o.pct)}</span>
                </span>
              </span>
              <span className="block h-3 overflow-hidden rounded-full bg-muted">
                <span className="block h-full" style={{ width: `${Math.max(o.pct, 1.5)}%`, background: cor(o.id) }} />
              </span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">{formatarLitros(o.litros)}</span>
            </button>
          ))}
        </div>
      )}
    </CartaoGrafico>
  );
}

// ---------------------------------------------------------------------------
// G5 R$/L por fornecedor
// ---------------------------------------------------------------------------

export function CustoPorFornecedor({
  fornecedores,
  media,
  filtro,
}: {
  fornecedores: FornecedorPainel[];
  media: number;
  filtro: FiltroGlobal;
}) {
  const recorte = useRecorteCombustivel(filtro);
  const marcados = filtro.fornecedores;

  return (
    <CartaoGrafico titulo="R$/L por fornecedor" subtitulo="Compras de combustível no período">
      {fornecedores.length === 0 ? (
        <GraficoVazio texto="Nenhuma entrada de combustível no período" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={fornecedores} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={GRADE} vertical={false} />
            <XAxis dataKey="nome" tick={EIXO} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis
              tick={EIXO}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              width={64}
            />
            <Tooltip
              cursor={CURSOR}
              content={({ active, payload }) => {
                const f = payload?.[0]?.payload as FornecedorPainel | undefined;
                if (!active || !f) return null;
                return (
                  <Dica
                    titulo={f.nome}
                    linhas={[
                      { rotulo: "R$/L médio", valor: reais4(f.rPorL) },
                      { rotulo: "Volume", valor: formatarLitros(f.litros) },
                      { rotulo: "Total", valor: formatarBRL(f.custo) },
                      { rotulo: "Compras", valor: f.qtd },
                    ]}
                    rodape={
                      media > 0
                        ? `${f.rPorL > media ? "Acima" : "Abaixo"} da média geral (${reais4(media)}/L)`
                        : undefined
                    }
                  />
                );
              }}
            />
            {media > 0 ? (
              <ReferenceLine
                y={media}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="4 4"
                label={{ position: "right", value: `Média ${reais4(media)}`, fill: "var(--color-muted-foreground)", fontSize: 10 }}
              />
            ) : null}
            <Bar
              dataKey="rPorL"
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
              onClick={(_, indice) => {
                const f = fornecedores[indice];
                if (f) recorte.alternar("fornecedores", f.id);
              }}
            >
              {fornecedores.map((f) => (
                <Cell
                  key={f.id}
                  cursor="pointer"
                  fill={media > 0 && f.rPorL > media ? COR_PAINEL.atencao : COR_PAINEL.principal}
                  fillOpacity={marcados.length > 0 && !marcados.includes(f.id) ? 0.4 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </CartaoGrafico>
  );
}
