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

import { formatarBRL } from "@/lib/formatadores";
import { drillFluxoCaixa } from "@/modules/financeiro/relatorios/drill";
import { abrirDrill } from "@/modules/financeiro/relatorios/components/abrir-drill";
import {
  COR_ENTIDADE,
  SEM_ANIMACAO,
  corProjetada,
} from "@/modules/financeiro/relatorios/components/cores-grafico";
import type { FluxoCaixaMes } from "../queries";

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
  value: number;
  color: string;
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
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((ponto) => (
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

/**
 * Fluxo de caixa por mês: barras de entradas x saídas (realizado + projetado
 * empilhados) e a linha de saldo do mês. Cores do design system EMT.
 */
export function FluxoCaixaGrafico({
  meses,
  centrosCusto,
  centrosReceita,
  podeVerLancamentos,
}: FluxoCaixaGraficoProps) {
  /**
   * O clique de cada barra: o mês vem do ponto, e o par tipo/realizado vem da
   * barra. Regime de CAIXA, então o destino vai pelo `recorte` (que reusa a
   * expressão de `fn_rel_fluxo_caixa`) e não por `mes`, que é competência: o
   * realizado é agrupado pelo mês do PAGAMENTO, e 694 parcelas da base foram
   * pagas em mês diferente do vencimento.
   */
  const aoClicar =
    (tipo: "a_pagar" | "a_receber", realizado: boolean) =>
    (ponto: { payload?: FluxoCaixaMes }) => {
      if (!podeVerLancamentos || !ponto?.payload?.mes) return;
      abrirDrill(
        drillFluxoCaixa({
          mes: ponto.payload.mes,
          tipo,
          realizado,
          // Cada lado leva os SEUS centros: saída é o centro de custo, entrada é
          // o de receita. Cruzar os dois abriria a lista com o recorte do lado
          // que ninguém clicou.
          centroIds: tipo === "a_pagar" ? centrosCusto : centrosReceita,
        }),
      );
    };
  const cursor = podeVerLancamentos ? "pointer" : undefined;

  return (
    <div className="h-80 w-full">
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
            mesma cor da entidade contra o fundo do card — o mesmo desenho de
            antes, agora legível fora da barra.
          */}
          <Bar
            dataKey="entradasRealizado"
            cursor={cursor}
            onClick={aoClicar("a_receber", true)}
            stackId="entradas"
            name="Entradas realizadas"
            fill={COR_ENTIDADE.a_receber}
            isAnimationActive={SEM_ANIMACAO}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="entradasProjetado"
            cursor={cursor}
            onClick={aoClicar("a_receber", false)}
            stackId="entradas"
            name="Entradas projetadas"
            fill={corProjetada(COR_ENTIDADE.a_receber)}
            isAnimationActive={SEM_ANIMACAO}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="saidasRealizado"
            cursor={cursor}
            onClick={aoClicar("a_pagar", true)}
            stackId="saidas"
            name="Saídas realizadas"
            fill={COR_ENTIDADE.a_pagar}
            isAnimationActive={SEM_ANIMACAO}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="saidasProjetado"
            cursor={cursor}
            onClick={aoClicar("a_pagar", false)}
            stackId="saidas"
            name="Saídas projetadas"
            fill={corProjetada(COR_ENTIDADE.a_pagar)}
            isAnimationActive={SEM_ANIMACAO}
            radius={[3, 3, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="saldo"
            name="Saldo do mês"
            stroke={COR_ENTIDADE.saldo}
            isAnimationActive={SEM_ANIMACAO}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
