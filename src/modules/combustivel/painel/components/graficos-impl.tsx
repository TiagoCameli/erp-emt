"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { ALTURA_RANKING, ListaRanking, type ItemRanking } from "./lista-ranking";

/**
 * Os gráficos da Visão Geral da origem (v2/visao-geral/charts), em Recharts, com as cores
 * do ERP. Top e Custo por obra são ranking em HTML (`ListaRanking`), não Recharts: o nome
 * longo quebrava no eixo e o treemap não lia com uma obra dominante. O que os gráficos da origem faziam ao clique continua: clicar num item liga ou
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

  function clicar(id: string) {
    const linha = linhas.find((l) => l.id === id);
    if (!linha) return;
    if (linha.sentinela) {
      if (hrefSentinela) router.push(hrefSentinela);
      return;
    }
    recorte.alternar(dimensao, linha.id);
  }

  const itens: ItemRanking[] = linhas.map((l) => {
    const marcado = !l.sentinela && marcados.includes(l.id);
    return {
      id: l.id,
      nome: l.nome,
      detalhe: l.detalhe || undefined,
      valor: metrica === "litros" ? formatarLitros(l.litros) : formatarBRL(l.custo),
      fracao: maximo > 0 ? l[metrica] / maximo : 0,
      cor: l.sentinela ? COR_PAINEL.atencao : marcado ? COR_PAINEL.marcado : COR_PAINEL.principal,
      marcado,
      esmaecido: !l.sentinela && marcados.length > 0 && !marcado,
      sentinela: l.sentinela,
      inerte: l.sentinela && !hrefSentinela,
      dica: [
        [l.nome, l.detalhe].filter(Boolean).join(" · "),
        `${formatarLitros(l.litros)} · ${formatarBRL(l.custo)} · ${l.qtd} abastecimento${l.qtd === 1 ? "" : "s"}`,
        l.sentinela ? "Clique para atribuir retroativamente" : "Clique para filtrar",
      ].join("\n"),
    };
  });

  return (
    <CartaoGrafico
      titulo={proprios ? "Top equipamentos" : "Top carretas"}
      subtitulo={proprios ? "Maiores consumidores no período" : "Placas com maior consumo no período"}
      altura={ALTURA_RANKING}
      acoes={<Alternador rotulo="Métrica" opcoes={METRICAS} valor={metrica} onValorChange={setMetrica} />}
    >
      {linhas.length === 0 ? (
        <GraficoVazio texto={proprios ? "Nenhuma saída no período" : "Nenhuma carreta abasteceu no período"} />
      ) : (
        <ListaRanking itens={itens} onClicar={clicar} mono={!proprios} />
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
  const total = obras.reduce((acc, o) => acc + o.custo, 0);

  // A barra é a fatia do TOTAL (é "distribuição"), não a razão para a maior obra.
  const itens: ItemRanking[] = obras.map((o) => {
    const semObra = o.id === ID_SEM_OBRA;
    return {
      id: o.id,
      nome: o.nome,
      detalhe: formatarLitros(o.litros),
      valor: formatarBRL(o.custo),
      complemento: porcento(o.pct),
      fracao: o.pct / 100,
      // Uma cor só: o comprimento já carrega o tamanho. "Sem obra" é agregado.
      cor: semObra ? COR_PAINEL.agregado : marcados.includes(o.id) ? COR_PAINEL.marcado : COR_PAINEL.principal,
      marcado: marcados.includes(o.id),
      esmaecido: marcados.length > 0 && !marcados.includes(o.id),
      inerte: semObra,
      dica: `${o.nome}\n${formatarBRL(o.custo)} (${porcento(o.pct)}) · ${formatarLitros(o.litros)}${semObra ? "" : "\nClique para filtrar"}`,
    };
  });

  return (
    <CartaoGrafico titulo="Custo por obra" subtitulo="Distribuição do custo no período" altura={ALTURA_RANKING}>
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
      ) : (
        <ListaRanking
          itens={itens}
          onClicar={alternar}
          cabecalho={
            <p className="flex items-baseline justify-between gap-3 px-4 pb-2 text-legenda text-muted-foreground">
              <span>{obras.length} obras</span>
              <span>
                Total <span className="font-semibold tabular-nums text-foreground">{formatarBRL(total)}</span>
              </span>
            </p>
          }
        />
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
