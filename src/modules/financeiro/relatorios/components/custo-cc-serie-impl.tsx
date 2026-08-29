"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatarBRL } from "@/lib/formatadores";
import { abrirDrill } from "@/modules/financeiro/relatorios/components/abrir-drill";
import {
  drillCentroCusto,
  type FiltrosDoRelatorioDeCusto,
} from "@/modules/financeiro/relatorios/drill";
import { rotuloMes } from "@/modules/financeiro/relatorios/calculo";
import {
  CORES_SERIE_CENTRO,
  SEM_ANIMACAO,
} from "@/modules/financeiro/relatorios/components/cores-grafico";
import type { SerieDeCentro } from "@/modules/financeiro/relatorios/queries";

interface CustoCcSerieProps {
  series: SerieDeCentro[];
  /** Os filtros do relatório, para o clique abrir a MESMA fatia que o ponto soma. */
  filtros: FiltrosDoRelatorioDeCusto;
  /** Sem permissão de ver lançamentos, o ponto não clica (levaria a um 404). */
  podeVerLancamentos: boolean;
}

/**
 * Cores das linhas: vêm de `cores-grafico`, onde mora o porquê de a paleta de
 * SÉRIE ser por posição (aqui a cor separa um centro do outro, e todas as linhas
 * são custo) enquanto a de entidade nunca é.
 */
const CORES_LINHA = CORES_SERIE_CENTRO;

/** Eixo Y compacto: R$ 12 mil / R$ 1,2 mi, pra não estourar a largura. */
function rotuloEixoValor(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return formatarBRL(valor);
}

/** Uma fileira do gráfico: o mês e o valor de cada centro naquele mês. */
type FileiraSerie = {
  mes: string;
  rotulo: string;
} & Record<string, string | number | undefined>;

function ConteudoTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: { name?: string; value?: number; color?: string }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">{item.name}</span>
          <span className="tabular-nums text-foreground">
            {formatarBRL(item.value ?? 0)}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Custo mês a mês de cada centro escolhido, no modo "vida do centro".
 *
 * Uma linha por centro, e cada uma começa na vida DELA: mês anterior ao primeiro
 * lançamento daquele centro não tem ponto (`connectNulls` desligado), então a
 * linha nasce onde a obra nasceu. Zero ali desenharia uma reta rasteira desde o
 * começo da janela, que se lê como obra que já existia e não gastava.
 *
 * Depois que a linha nasce, mês sem custo é ZERO e continua no gráfico: o vale é
 * a informação de que a obra parou naquele mês, e uma série que pula de março
 * para julho desenha crescimento onde houve parada. Quem preenche é a RPC
 * (`fn_rel_custo_centro_serie`), para o gráfico e qualquer outra leitura verem a
 * mesma série.
 */
export function CustoCcSerie({
  series,
  filtros,
  podeVerLancamentos,
}: CustoCcSerieProps) {
  // Uma fileira por mês da união das séries, em ordem. Centro que não tem aquele
  // mês fica sem a chave, e não com zero: é o que abre o buraco na linha dele.
  const meses = [
    ...new Set(series.flatMap((serie) => serie.pontos.map((p) => p.mes))),
  ].sort();

  const dados: FileiraSerie[] = meses.map((mes) => {
    const fileira: FileiraSerie = { mes, rotulo: rotuloMes(mes) };
    for (const serie of series) {
      const ponto = serie.pontos.find((p) => p.mes === mes);
      if (ponto) fileira[serie.centroCustoId] = ponto.valor;
    }
    return fileira;
  });

  /**
   * O clique é do GRÁFICO, e não de cada linha.
   *
   * Recharts entrega o clique de uma `Line` como o clique da série inteira, não o
   * do ponto embaixo do cursor, então clicar numa linha não diz qual mês foi. O
   * clique do gráfico diz o mês, e o destino leva os centros que TÊM ponto naquele
   * mês: assim a soma da lista que abre é exatamente a soma dos pontos visíveis
   * ali. Centro que ainda não tinha nascido naquele mês fica fora, em vez de
   * entrar somando zero e sugerindo que ele foi considerado.
   */
  function aoClicarNoMes(estado: unknown) {
    if (!podeVerLancamentos) return;
    // O Recharts 3 entrega o ÍNDICE do ponto ativo, não o payload dele (o
    // `activePayload` do Recharts 2 não existe mais aqui). Conferido na tela: sem
    // isto o clique não fazia nada, calado.
    const indice = Number(
      (estado as { activeIndex?: number | string } | undefined)?.activeIndex,
    );
    const fileira = Number.isInteger(indice) ? dados[indice] : undefined;
    if (!fileira) return;
    const centrosDoMes = series
      .map((serie) => serie.centroCustoId)
      .filter((id) => fileira[id] !== undefined);
    if (centrosDoMes.length === 0) return;
    abrirDrill(
      drillCentroCusto({
        centroCustoIds: centrosDoMes,
        periodo: { mes: fileira.mes },
        filtros,
      }),
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={dados}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          onClick={aoClicarNoMes}
          style={{ cursor: podeVerLancamentos ? "pointer" : undefined }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="rotulo"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            angle={-30}
            textAnchor="end"
            height={56}
          />
          <YAxis
            tickFormatter={rotuloEixoValor}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip content={<ConteudoTooltip />} />
          {series.length > 1 ? (
            <Legend
              verticalAlign="top"
              align="left"
              iconType="plainline"
              wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
            />
          ) : null}
          {series.map((serie, indice) => (
            <Line
              key={serie.centroCustoId}
              type="monotone"
              dataKey={serie.centroCustoId}
              name={
                serie.codigo ? `${serie.codigo} · ${serie.nome}` : serie.nome
              }
              stroke={CORES_LINHA[indice % CORES_LINHA.length]}
              isAnimationActive={SEM_ANIMACAO}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              // Buraco fica buraco: ligar dois meses distantes por uma reta
              // esconderia que o centro não existia ainda naquele trecho.
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
