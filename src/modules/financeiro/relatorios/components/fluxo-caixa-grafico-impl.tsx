"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AreaGrafico } from "@/components/canonicos/area-grafico";
import { formatarBRL } from "@/lib/formatadores";
import {
  tipoDaSerie,
  type SerieFluxo,
} from "@/modules/financeiro/lancamentos/recorte";
import { drillFluxoCaixa } from "@/modules/financeiro/relatorios/drill";
import { abrirDrill } from "@/modules/financeiro/relatorios/components/abrir-drill";
import {
  COR_ENTIDADE,
  SEM_ANIMACAO,
  corProjetada,
} from "@/modules/financeiro/relatorios/components/cores-grafico";
import type { FluxoCaixaMes } from "../fluxo-caixa";

interface FluxoCaixaGraficoProps {
  meses: FluxoCaixaMes[];
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

interface PontoTooltip {
  name: string;
  value: number | null;
  color: string;
  dataKey?: string;
}

function ConteudoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: PontoTooltip[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  // Oito barras e duas linhas: as séries zeradas do mês saem da lista, e o saldo
  // de mês passado (nulo) também. O líquido fica sempre, porque zero ali diz
  // alguma coisa.
  const pontos = payload.filter(
    (ponto): ponto is PontoTooltip & { value: number } =>
      ponto.value !== null &&
      (ponto.value !== 0 || ponto.dataKey === "liquido"),
  );
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <ul className="space-y-0.5">
        {pontos.map((ponto) => (
          <li key={ponto.name} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: ponto.color }}
            />
            <span className="text-muted-foreground">{ponto.name}</span>
            <span className="ml-auto tabular-nums text-foreground">
              {formatarBRL(ponto.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Uma barra do gráfico: a série, a metade (realizado ou projetado) e o campo. */
interface BarraFluxo {
  serie: SerieFluxo;
  realizado: boolean;
  campo: keyof FluxoCaixaMes;
  nome: string;
  pilha: "entradas" | "saidas";
}

/**
 * As oito barras, na ordem de empilhamento: de baixo para cima, o operacional
 * primeiro e a movimentação por cima, cada série com o realizado embaixo do
 * projetado. O operacional embaixo é o que deixa a leitura de sempre ("quanto
 * a obra trouxe e gastou") no mesmo lugar de antes da D1.
 */
const BARRAS: readonly BarraFluxo[] = [
  {
    serie: "a_receber",
    realizado: true,
    campo: "aReceberRealizado",
    nome: "Entradas operacionais realizadas",
    pilha: "entradas",
  },
  {
    serie: "a_receber",
    realizado: false,
    campo: "aReceberProjetado",
    nome: "Entradas operacionais projetadas",
    pilha: "entradas",
  },
  {
    serie: "emprestimo_tomado",
    realizado: true,
    campo: "emprestimoTomadoRealizado",
    nome: "Empréstimos tomados realizados",
    pilha: "entradas",
  },
  {
    serie: "emprestimo_tomado",
    realizado: false,
    campo: "emprestimoTomadoProjetado",
    nome: "Empréstimos tomados projetados",
    pilha: "entradas",
  },
  {
    serie: "a_pagar",
    realizado: true,
    campo: "aPagarRealizado",
    nome: "Saídas operacionais realizadas",
    pilha: "saidas",
  },
  {
    serie: "a_pagar",
    realizado: false,
    campo: "aPagarProjetado",
    nome: "Saídas operacionais projetadas",
    pilha: "saidas",
  },
  {
    serie: "amortizacao",
    realizado: true,
    campo: "amortizacaoRealizado",
    nome: "Amortizações realizadas",
    pilha: "saidas",
  },
  {
    serie: "amortizacao",
    realizado: false,
    campo: "amortizacaoProjetado",
    nome: "Amortizações projetadas",
    pilha: "saidas",
  },
];

/**
 * Fluxo de caixa por mês: duas pilhas por mês, entradas e saídas, cada uma com
 * a série operacional e a de movimentação (realizado + projetado), mais duas
 * linhas: o líquido do mês e o saldo acumulado a partir do saldo das contas.
 * Cores do design system EMT, por entidade (`COR_ENTIDADE`).
 */
export function FluxoCaixaGrafico({
  meses,
  centrosCusto,
  centrosReceita,
  podeVerLancamentos,
}: FluxoCaixaGraficoProps) {
  /**
   * O clique de cada barra: o mês vem do ponto, e o par série/realizado vem da
   * barra. Regime de CAIXA, então o destino vai pelo `recorte` (que reusa a
   * expressão de `fn_rel_fluxo_caixa`) e não por `mes`, que é competência: o
   * realizado é agrupado pelo mês do PAGAMENTO, e 694 parcelas da base foram
   * pagas em mês diferente do vencimento. A série viaja junto: clicar em
   * "Amortizações" abre só as prestações.
   */
  const aoClicar =
    (serie: SerieFluxo, realizado: boolean) =>
    (ponto: { payload?: FluxoCaixaMes }) => {
      if (!podeVerLancamentos || !ponto?.payload?.mes) return;
      abrirDrill(
        drillFluxoCaixa({
          mes: ponto.payload.mes,
          serie,
          realizado,
          // Cada lado leva os SEUS centros: saída é o centro de custo, entrada é
          // o de receita. Cruzar os dois abriria a lista com o recorte do lado
          // que ninguém clicou.
          centroIds:
            tipoDaSerie(serie) === "a_pagar" ? centrosCusto : centrosReceita,
        }),
      );
    };
  const cursor = podeVerLancamentos ? "pointer" : undefined;
  // A linha do saldo só existe do mês corrente em diante; sem nenhum ponto
  // (janela no passado, sem saldo visível, centro escolhido) ela nem entra na
  // legenda, para não prometer uma linha que não está desenhada.
  const temSaldoAcumulado = meses.some((mes) => mes.saldoAcumulado !== null);

  return (
    <AreaGrafico altura="20rem">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={meses}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
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
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {/*
            Realizado x projetado se separa por COR, e não por `fillOpacity`: o
            ícone da `Legend` lê o `fill` e o tooltip lê o `color` (que é o mesmo
            `fill`), então com opacidade a legenda mostrava dois quadrados
            idênticos, um "realizadas" e outro "projetadas". O tom claro é a
            mesma cor da entidade contra o fundo do card, legível fora da barra.

            O canto arredondado vai só na última barra de cada pilha: as outras
            têm outra barra por cima, e o arredondado no meio da pilha abriria um
            vão entre as duas.
          */}
          {BARRAS.map((barra, indice) => {
            const ultimaDaPilha = !BARRAS.slice(indice + 1).some(
              (outra) => outra.pilha === barra.pilha,
            );
            const cor = COR_ENTIDADE[barra.serie];
            return (
              <Bar
                key={barra.campo}
                dataKey={barra.campo}
                cursor={cursor}
                onClick={aoClicar(barra.serie, barra.realizado)}
                stackId={barra.pilha}
                name={barra.nome}
                fill={barra.realizado ? cor : corProjetada(cor)}
                isAnimationActive={SEM_ANIMACAO}
                radius={ultimaDaPilha ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              />
            );
          })}
          <Line
            type="monotone"
            dataKey="liquido"
            name="Líquido do mês"
            stroke={COR_ENTIDADE.saldo}
            isAnimationActive={SEM_ANIMACAO}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          {temSaldoAcumulado ? (
            <Line
              type="monotone"
              dataKey="saldoAcumulado"
              name="Saldo projetado"
              stroke={COR_ENTIDADE.saldo_acumulado}
              isAnimationActive={SEM_ANIMACAO}
              strokeWidth={2}
              dot={{ r: 3 }}
              // Mês passado não tem saldo acumulado: a linha começa em hoje em
              // vez de ligar um ponto inventado.
              connectNulls={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </AreaGrafico>
  );
}
