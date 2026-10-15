"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AreaGrafico } from "@/components/canonicos/area-grafico";
import { formatarBRL } from "@/lib/formatadores";
import {
  GRUPOS_FLUXO,
  type GrupoFluxo,
  type SentidoFluxo,
} from "@/modules/financeiro/lancamentos/recorte";
import { drillFluxoCaixa } from "@/modules/financeiro/relatorios/drill";
import { abrirDrill } from "@/modules/financeiro/relatorios/components/abrir-drill";
import {
  COR_ENTIDADE,
  ENTIDADE_DO_GRUPO,
  SEM_ANIMACAO,
  corProjetada,
} from "@/modules/financeiro/relatorios/components/cores-grafico";
import {
  ROTULO_GRUPO_FLUXO,
  type FluxoCaixaMes,
} from "../fluxo-caixa";

interface FluxoCaixaGraficoProps {
  meses: FluxoCaixaMes[];
  /** Mês corrente (yyyy-MM): o que vem depois é previsto e sai em tom claro. */
  mesCorrente: string;
  /**
   * Centros JÁ EFETIVOS de cada lado, do jeito que o relatório recortou. Viajam
   * no clique para a lista abrir com o mesmo total da barra: com centro
   * escolhido, a barra soma a FATIA do rateio e a lista mede pela fatia também.
   */
  centrosCusto?: string[];
  centrosReceita?: string[];
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

/** Uma linha do gráfico: o mês original e os campos achatados das barras. */
type PontoGrafico = FluxoCaixaMes & Record<string, unknown>;

function chave(grupo: GrupoFluxo, sentido: SentidoFluxo): string {
  return `${grupo}_${sentido}`;
}

/**
 * Entrada para cima, saída para baixo: a saída vira número negativo SÓ no
 * desenho. Com `stackOffset="sign"` cada lado empilha do zero para fora, então a
 * altura acima do eixo é tudo o que entrou e abaixo tudo o que saiu.
 */
function achatar(meses: readonly FluxoCaixaMes[]): PontoGrafico[] {
  return meses.map((mes) => {
    const ponto: PontoGrafico = { ...mes };
    for (const grupo of GRUPOS_FLUXO) {
      ponto[chave(grupo, "entrada")] = mes.grupos[grupo].entrada.total;
      ponto[chave(grupo, "saida")] = -mes.grupos[grupo].saida.total;
    }
    return ponto;
  });
}

function ConteudoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: PontoGrafico }[];
}) {
  const mes = payload?.[0]?.payload;
  if (!active || !mes) return null;
  // Só os grupos que mexeram no mês. O líquido fica sempre: zero ali diz alguma
  // coisa. O previsto aparece à parte quando há, porque é ele que ainda pode
  // não acontecer.
  const grupos = GRUPOS_FLUXO.filter(
    (grupo) =>
      mes.grupos[grupo].entrada.total !== 0 || mes.grupos[grupo].saida.total !== 0,
  );
  return (
    <div className="min-w-56 rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      <p className="mb-1 font-medium text-foreground">{mes.rotulo}</p>
      <ul className="space-y-1">
        {grupos.map((grupo) => {
          const { entrada, saida, liquido } = mes.grupos[grupo];
          const previsto = entrada.projetado - saida.projetado;
          return (
            <li key={grupo} className="flex flex-col">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: COR_ENTIDADE[ENTIDADE_DO_GRUPO[grupo]] }}
                />
                <span className="text-muted-foreground">{ROTULO_GRUPO_FLUXO[grupo]}</span>
                <span className="ml-auto tabular-nums text-foreground">
                  {formatarBRL(liquido)}
                </span>
              </span>
              <span className="pl-4 text-legenda tabular-nums text-muted-foreground">
                {entrada.total !== 0 ? `entrou ${formatarBRL(entrada.total)}` : ""}
                {entrada.total !== 0 && saida.total !== 0 ? " · " : ""}
                {saida.total !== 0 ? `saiu ${formatarBRL(saida.total)}` : ""}
                {previsto !== 0 && (entrada.realizado !== 0 || saida.realizado !== 0)
                  ? ` · previsto ${formatarBRL(previsto)}`
                  : ""}
              </span>
            </li>
          );
        })}
        <li className="flex items-center gap-2 border-t border-border pt-1">
          <span className="text-muted-foreground">Líquido do mês</span>
          <span className="ml-auto tabular-nums font-medium text-foreground">
            {formatarBRL(mes.liquido)}
          </span>
        </li>
        {mes.saldoAcumulado !== null ? (
          <li className="flex items-center gap-2">
            <span className="text-muted-foreground">Disponível projetado</span>
            <span className="ml-auto tabular-nums text-foreground">
              {formatarBRL(mes.saldoAcumulado)}
            </span>
          </li>
        ) : null}
        {mes.saldoComAplicado !== null ? (
          <li className="flex items-center gap-2">
            <span className="text-muted-foreground">Com o aplicado</span>
            <span className="ml-auto tabular-nums text-foreground">
              {formatarBRL(mes.saldoComAplicado)}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * A legenda é HTML e não a `Legend` do Recharts: são dez barras (cinco grupos
 * nos dois lados) e a legenda tem de mostrar CINCO cores, uma por grupo. A do
 * Recharts listaria cada barra, que é o que deixava a de antes com onze itens.
 */
function LegendaFluxo({
  comSaldo,
  comAplicado,
  gruposPresentes,
}: {
  comSaldo: boolean;
  comAplicado: boolean;
  gruposPresentes: readonly GrupoFluxo[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-legenda text-muted-foreground">
      {gruposPresentes.map((grupo) => (
        <li key={grupo} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[2px]"
            style={{ backgroundColor: COR_ENTIDADE[ENTIDADE_DO_GRUPO[grupo]] }}
          />
          {ROTULO_GRUPO_FLUXO[grupo]}
        </li>
      ))}
      {comSaldo ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-0.5 w-4"
            style={{ backgroundColor: COR_ENTIDADE.saldo_acumulado }}
          />
          Disponível projetado
        </li>
      ) : null}
      {comAplicado ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: COR_ENTIDADE.saldo_com_aplicado }}
          />
          Disponível mais aplicado
        </li>
      ) : null}
      <li className="sm:ml-auto">Acima do zero entrou, abaixo saiu; tom claro é previsto</li>
    </ul>
  );
}

/**
 * Fluxo de caixa por mês: cada grupo é uma cor, a entrada empilha para cima e a
 * saída para baixo, e duas linhas levam o saldo a partir de hoje (o disponível,
 * e o disponível mais o aplicado). O mês depois do corrente sai no tom claro da
 * mesma cor: é previsto.
 */
export function FluxoCaixaGrafico({
  meses,
  mesCorrente,
  centrosCusto,
  centrosReceita,
  podeVerLancamentos,
}: FluxoCaixaGraficoProps) {
  /**
   * O clique de cada pedaço: o mês vem do ponto, o grupo e o lado da barra. A
   * situação não vai: a barra soma pago e previsto, e a lista tem de abrir com
   * o mesmo número. Regime de CAIXA, então o destino vai pelo `recorte` e não
   * por `mes`, que é competência.
   */
  const aoClicar =
    (grupo: GrupoFluxo, sentido: SentidoFluxo) =>
    (ponto: { payload?: FluxoCaixaMes }) => {
      if (!podeVerLancamentos || !ponto?.payload?.mes) return;
      abrirDrill(
        drillFluxoCaixa({
          mes: ponto.payload.mes,
          grupo,
          sentido,
          // Cada lado leva os SEUS centros: saída é o centro de custo, entrada
          // é o de receita.
          centroIds: sentido === "saida" ? centrosCusto : centrosReceita,
        }),
      );
    };
  const cursor = podeVerLancamentos ? "pointer" : undefined;
  const dados = achatar(meses);
  // A linha do saldo só existe do mês corrente em diante; sem nenhum ponto
  // (janela no passado, sem saldo visível, centro escolhido) ela nem entra na
  // legenda, para não prometer uma linha que não está desenhada.
  const temSaldoAcumulado = meses.some((mes) => mes.saldoAcumulado !== null);
  const temComAplicado = meses.some((mes) => mes.saldoComAplicado !== null);
  const gruposPresentes = GRUPOS_FLUXO.filter((grupo) =>
    meses.some(
      (mes) =>
        mes.grupos[grupo].entrada.total !== 0 || mes.grupos[grupo].saida.total !== 0,
    ),
  );
  const rotuloCorrente = meses.find((mes) => mes.mes === mesCorrente)?.rotulo;

  return (
    <div className="flex flex-col gap-3">
      <AreaGrafico altura="22rem">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={dados}
            stackOffset="sign"
            margin={{ top: 16, right: 8, bottom: 8, left: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="rotulo"
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
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
            <ReferenceLine y={0} stroke="var(--border)" />
            {rotuloCorrente ? (
              <ReferenceLine
                x={rotuloCorrente}
                stroke="var(--muted-foreground)"
                strokeDasharray="2 4"
                label={{
                  value: "hoje",
                  position: "top",
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
              />
            ) : null}
            {gruposPresentes.flatMap((grupo) =>
              (["entrada", "saida"] as const).map((sentido) => {
                const cor = COR_ENTIDADE[ENTIDADE_DO_GRUPO[grupo]];
                return (
                  <Bar
                    key={chave(grupo, sentido)}
                    dataKey={chave(grupo, sentido)}
                    name={`${ROTULO_GRUPO_FLUXO[grupo]} · ${sentido === "entrada" ? "entrou" : "saiu"}`}
                    stackId="caixa"
                    cursor={cursor}
                    onClick={aoClicar(grupo, sentido)}
                    fill={cor}
                    isAnimationActive={SEM_ANIMACAO}
                  >
                    {/*
                      Previsto x pago se separa por COR, e não por opacidade (ver
                      `corProjetada`). Por mês e não por série: o mês depois do
                      corrente é todo previsto, e o corrente mistura os dois.
                    */}
                    {dados.map((ponto) => (
                      <Cell
                        key={ponto.mes}
                        fill={ponto.mes > mesCorrente ? corProjetada(cor) : cor}
                      />
                    ))}
                  </Bar>
                );
              }),
            )}
            {temSaldoAcumulado ? (
              <Line
                type="monotone"
                dataKey="saldoAcumulado"
                name="Disponível projetado"
                stroke={COR_ENTIDADE.saldo_acumulado}
                isAnimationActive={SEM_ANIMACAO}
                strokeWidth={2}
                dot={{ r: 3 }}
                // Mês passado não tem saldo acumulado: a linha começa em hoje em
                // vez de ligar um ponto inventado.
                connectNulls={false}
              />
            ) : null}
            {temComAplicado ? (
              <Line
                type="monotone"
                dataKey="saldoComAplicado"
                name="Disponível mais aplicado"
                stroke={COR_ENTIDADE.saldo_com_aplicado}
                strokeDasharray="5 4"
                isAnimationActive={SEM_ANIMACAO}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </AreaGrafico>
      <LegendaFluxo
        comSaldo={temSaldoAcumulado}
        comAplicado={temComAplicado}
        gruposPresentes={gruposPresentes}
      />
    </div>
  );
}
