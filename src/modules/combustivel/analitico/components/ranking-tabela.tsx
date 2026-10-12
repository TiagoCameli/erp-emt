"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/canonicos";
import { cn } from "@/lib/utils";

/**
 * O lado cliente da `TabelaRanking`. As páginas do ranking são Server Components e
 * passam funções (nome, href, célula de cada métrica); função não atravessa para o
 * cliente, então a `TabelaRanking` roda essas funções no servidor e manda para cá só
 * o que cada célula já renderizou. Daqui sai a DataTable ajustável.
 */

export interface ColunaRankingCliente {
  cabecalho: string;
  alinhar?: "esquerda" | "direita";
  className?: string;
}

export interface LinhaRankingCliente {
  chave: string;
  posicao: number;
  nome: React.ReactNode;
  detalhe: string | null;
  hachurada: boolean;
  /** Uma por coluna, na ordem de `colunas`. */
  celulas: React.ReactNode[];
}

/**
 * A largura que a página pede por classe (`w-44` na barra de % do total) vira o
 * tamanho inicial da coluna, que o usuário pode arrastar; o resto da classe vai na
 * célula. 4px por unidade do Tailwind, mais o respiro da célula.
 */
function separarLargura(className: string | undefined): { size?: number; classe?: string } {
  if (!className) return {};
  const largura = /(?:^|\s)w-(\d+)(?=\s|$)/.exec(className);
  if (!largura) return { classe: className };
  const resto = className.replace(largura[0], " ").trim();
  return { size: Number(largura[1]) * 4 + 24, classe: resto || undefined };
}

/** A linha hachurada da origem (o "Não identificado"). */
const HACHURA =
  "bg-[repeating-linear-gradient(45deg,var(--color-muted),var(--color-muted)_4px,transparent_4px,transparent_8px)]";

export function TabelaRankingCliente({
  idTabela,
  cabecalhoNome,
  colunas,
  linhas,
}: {
  idTabela: string;
  cabecalhoNome: string;
  colunas: readonly ColunaRankingCliente[];
  linhas: LinhaRankingCliente[];
}) {
  // O ranking já vem na ordem da métrica e a célula chega pronta do servidor (sem o
  // valor cru para comparar): nenhuma coluna ordena.
  const definicoes = React.useMemo<ColumnDef<LinhaRankingCliente, unknown>[]>(
    () => [
      {
        id: "posicao",
        header: "#",
        size: 48,
        enableSorting: false,
        // No celular a ordem dos cards já é a posição.
        meta: { alinharDireita: true, atomico: true, celular: "oculta" },
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.posicao}</span>,
      },
      {
        id: "nome",
        header: cabecalhoNome,
        size: 260,
        enableSorting: false,
        meta: { celular: "titulo", naoTruncar: true },
        cell: ({ row }) => {
          const linha = row.original;
          return (
            <div className="min-w-0">
              <div className={cn("truncate font-medium", linha.hachurada && "text-status-pendente")}>{linha.nome}</div>
              {linha.detalhe ? <div className="truncate text-legenda text-muted-foreground">{linha.detalhe}</div> : null}
            </div>
          );
        },
      },
      ...colunas.map<ColumnDef<LinhaRankingCliente, unknown>>((coluna, indice) => {
        const direita = coluna.alinhar !== "esquerda";
        const { size, classe } = separarLargura(coluna.className);
        return {
          id: coluna.cabecalho,
          header: coluna.cabecalho,
          ...(size ? { size } : {}),
          enableSorting: false,
          meta: direita ? { alinharDireita: true, atomico: true } : { naoTruncar: true },
          cell: ({ row }) => (
            <div className={cn(direita && "tabular-nums", classe)}>{row.original.celulas[indice]}</div>
          ),
        };
      }),
    ],
    [cabecalhoNome, colunas],
  );

  return (
    <DataTable
      idTabela={idTabela}
      columns={definicoes}
      data={linhas}
      idDaLinha={(linha) => linha.chave}
      semPaginacao
      classeDaLinha={(linha) => (linha.hachurada ? HACHURA : undefined)}
    />
  );
}
