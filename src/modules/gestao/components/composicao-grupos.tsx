import { MoneyText } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import type { CustoGrupo } from "../queries";

/**
 * Composição do custo por grupo de insumo: uma barra empilhada e a lista com
 * valor e participação de cada grupo.
 *
 * Por que não é um gráfico do Recharts: são no máximo cinco fatias de um mesmo
 * total, e a pergunta é "quanto do gasto é material, mão de obra, equipamento".
 * Uma barra de composição responde isso sem eixo, sem tooltip e sem carregar
 * biblioteca de gráfico, e a lista ao lado já mostra o número exato de cada um
 * (as cores do sistema são próximas entre si, então o rótulo é obrigatório).
 */

/**
 * Ordem fixa de cores. Não é a ordem dos tokens: âmbar e verde primeiro,
 * porque nesta sequência as fatias vizinhas continuam distinguíveis por quem
 * tem daltonismo. O cinza fica por último, para o grupo neutro.
 */
const CORES = [
  "var(--color-chart-1)",
  "var(--color-chart-3)",
  "var(--color-chart-2)",
  "var(--color-chart-5)",
  "var(--color-chart-4)",
];

export function ComposicaoGrupos({ grupos }: { grupos: CustoGrupo[] }) {
  return (
    <div className="space-y-4">
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        {grupos.map((grupo, indice) => (
          <div
            key={grupo.nome}
            className="min-w-0.5 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${grupo.participacao}%`,
              backgroundColor: CORES[indice % CORES.length],
            }}
          />
        ))}
      </div>

      <ul className="space-y-2">
        {grupos.map((grupo, indice) => (
          <li key={grupo.nome} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: CORES[indice % CORES.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-detalhe text-foreground">
              {grupo.nome}
            </span>
            <span className="w-14 shrink-0 text-right text-detalhe tabular-nums text-muted-foreground">
              {formatarPercentual(grupo.participacao, 0)}
            </span>
            <MoneyText
              valor={grupo.valor}
              className="w-32 shrink-0 text-right text-detalhe text-foreground"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
