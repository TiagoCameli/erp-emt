import { MoneyText } from "@/components/canonicos";
import { cn } from "@/lib/utils";
import type { ResultadoDoPeriodo } from "../calculo";

/**
 * O mesmo dinheiro do gráfico acima, em números, mês a mês: receita, despesa e
 * resultado, com o total do período na última coluna.
 *
 * Não é enfeite nem repetição: é a leitura EXATA do que o gráfico mostra de
 * forma aproximada. Quem precisa saber se o mês fechou em R$ 8.328,53 ou em
 * R$ 8.300 não tem como tirar isso da altura de uma coluna, e o eixo compacto
 * ("R$ 1,2 mi") arredonda de propósito. Ela também é o que dá acesso ao número a
 * quem não distingue as cores das duas séries do gráfico.
 *
 * Rola na horizontal dentro do próprio contêiner: com um período longo escolhido
 * na barra de filtros são muitas colunas, e a página inteira rolando de lado
 * levaria o resto do painel junto.
 */
export function ResumoPeriodoTabela({
  resultado,
}: {
  resultado: ResultadoDoPeriodo;
}) {
  const linhas = [
    {
      nome: "Receita",
      valores: resultado.meses.map((m) => m.receita),
      total: resultado.receita,
      colorir: false,
    },
    {
      nome: "Despesa",
      valores: resultado.meses.map((m) => m.despesa),
      total: resultado.despesa,
      colorir: false,
    },
    {
      nome: "Resultado",
      valores: resultado.meses.map((m) => m.resultado),
      total: resultado.resultado,
      colorir: true,
    },
  ];

  /**
   * Verde ou vermelho só na linha de resultado, e nunca como única pista: o
   * número negativo já vem com o sinal do formatador.
   */
  function corDo(valor: number, colorir: boolean): string {
    if (!colorir || valor === 0) return "text-foreground";
    return valor < 0 ? "text-destructive" : "text-emt-verde";
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="py-1.5 pr-3 text-left text-legenda font-normal uppercase tracking-wide text-muted-foreground">
              Mês
            </th>
            {resultado.meses.map((mes) => (
              <th
                key={mes.mes}
                className="px-3 py-1.5 text-right text-legenda font-normal uppercase tracking-wide text-muted-foreground"
              >
                {mes.rotulo}
              </th>
            ))}
            <th className="py-1.5 pl-3 text-right text-legenda font-normal uppercase tracking-wide text-muted-foreground">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.nome} className="border-b border-border last:border-0">
              <th
                scope="row"
                className="py-2 pr-3 text-left text-detalhe font-normal text-foreground"
              >
                {linha.nome}
              </th>
              {linha.valores.map((valor, indice) => (
                <td
                  key={resultado.meses[indice].mes}
                  className={cn(
                    "px-3 py-2 text-right text-detalhe",
                    corDo(valor, linha.colorir),
                  )}
                >
                  <MoneyText valor={valor} />
                </td>
              ))}
              <td
                className={cn(
                  "py-2 pl-3 text-right text-detalhe font-medium",
                  corDo(linha.total, linha.colorir),
                )}
              >
                <MoneyText valor={linha.total} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
