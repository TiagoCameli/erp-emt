"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { cn } from "@/lib/utils";
import type { ResultadoDoPeriodo } from "../calculo";

interface LinhaResumo {
  nome: string;
  /** Um valor por mês, na mesma ordem de `resultado.meses`. */
  valores: number[];
  total: number;
  colorir: boolean;
}

/**
 * Verde ou vermelho só na linha de resultado, e nunca como única pista: o
 * número negativo já vem com o sinal do formatador.
 */
function corDo(valor: number, colorir: boolean): string {
  if (!colorir || valor === 0) return "text-foreground";
  return valor < 0 ? "text-destructive" : "text-primary";
}

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
 * levaria o resto do painel junto. A DataTable já faz isso, e ainda deixa o
 * usuário ajustar largura, ordem e quais meses aparecem (pedido do Tiago em
 * 12/10/2026: toda tabela ajustável). Sem ordenação: são três linhas com
 * ordem de leitura fixa (receita, despesa, resultado).
 */
export function ResumoPeriodoTabela({
  resultado,
}: {
  resultado: ResultadoDoPeriodo;
}) {
  const linhas: LinhaResumo[] = [
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

  const colunas: ColumnDef<LinhaResumo, unknown>[] = [
    {
      id: "nome",
      accessorKey: "nome",
      header: "Mês",
      size: 130,
      enableSorting: false,
      meta: { fixa: true, celular: "titulo" },
      cell: ({ row }) => (
        <span className="text-detalhe text-foreground">
          {row.original.nome}
        </span>
      ),
    },
    ...resultado.meses.map(
      (mes, indice): ColumnDef<LinhaResumo, unknown> => ({
        // Id pela competência, não pela posição: a largura e a ordem salvas
        // ficam presas ao mês, e trocar o período não as joga em outro mês.
        id: mes.mes,
        header: mes.rotulo,
        size: 130,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => {
          const valor = row.original.valores[indice];
          return (
            <span
              className={cn("text-detalhe", corDo(valor, row.original.colorir))}
            >
              <MoneyText valor={valor} />
            </span>
          );
        },
      }),
    ),
    {
      id: "total",
      header: "Total",
      size: 150,
      enableSorting: false,
      meta: { alinharDireita: true, atomico: true, celular: "valor" },
      cell: ({ row }) => (
        <span
          className={cn(
            "text-detalhe font-medium",
            corDo(row.original.total, row.original.colorir),
          )}
        >
          <MoneyText valor={row.original.total} />
        </span>
      ),
    },
  ];

  return (
    <DataTable
      idTabela="gestao.resumo-periodo"
      columns={colunas}
      data={linhas}
      idDaLinha={(linha) => linha.nome}
      semPaginacao
    />
  );
}
