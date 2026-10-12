"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { BarChart3 } from "lucide-react";

import { DataTable, EmptyState, MoneyText } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import {
  ROTULOS_MESES,
  custosPorCategoria,
  custosPorCentro,
  mesesVisiveis,
  type CategoriaIndireta,
  type CustoIndiretoLinha,
} from "@/modules/financeiro/relatorios/custos-indiretos";

interface CustosIndiretosTabelaProps {
  ano: number;
  linhas: CustoIndiretoLinha[];
  /** yyyy-MM: no ano corrente, as colunas param no mês corrente. */
  mesCorrente: string;
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-corpo font-semibold text-foreground">{titulo}</h3>
      {children}
    </div>
  );
}

/** Zero vira "—": a grade de doze meses fica legível. */
function Valor({ valor, className }: { valor: number; className?: string }) {
  return valor === 0 ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <MoneyText valor={valor} className={className} />
  );
}

/** Linha da tabela por centro: o subtotal da raiz ou uma etapa dela. */
interface LinhaCentro {
  tipo: "raiz" | "centro";
  id: string;
  nome: string;
  porMes: number[];
  total: number;
}

function TabelaPorCentro({ ano, linhas, mesCorrente }: CustosIndiretosTabelaProps) {
  const dados = React.useMemo(() => custosPorCentro(linhas), [linhas]);
  const meses = mesesVisiveis(ano, mesCorrente, dados.porMes);
  const registros = React.useMemo<LinhaCentro[]>(
    () =>
      dados.raizes.flatMap((r) => [
        { tipo: "raiz" as const, id: `raiz:${r.raizId}`, nome: r.raiz, porMes: r.porMes, total: r.total },
        ...r.centros.map((c) => ({
          tipo: "centro" as const,
          id: `centro:${r.raizId}:${c.centroId}`,
          nome: c.centro,
          porMes: c.porMes,
          total: c.total,
        })),
      ]),
    [dados],
  );

  // Raiz com subtotal e as etapas logo abaixo: ordenar por coluna misturaria
  // etapa de uma raiz com o subtotal de outra, então nenhuma coluna ordena.
  const colunas = React.useMemo<ColumnDef<LinhaCentro, unknown>[]>(() => {
    const peso = (r: LinhaCentro) => (r.tipo === "raiz" ? "font-medium" : undefined);
    return [
      {
        id: "centro",
        header: "Centro",
        size: 260,
        enableSorting: false,
        meta: { celular: "titulo" },
        cell: ({ row }) =>
          row.original.tipo === "raiz" ? (
            <span className="font-medium">{row.original.nome}</span>
          ) : (
            row.original.nome
          ),
      },
      ...ROTULOS_MESES.slice(0, meses).map<ColumnDef<LinhaCentro, unknown>>((rotulo, i) => ({
        id: `mes${i + 1}`,
        header: rotulo,
        size: 120,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <Valor valor={row.original.porMes[i]} className={peso(row.original)} />,
      })),
      {
        id: "total",
        header: "Total",
        size: 140,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => <Valor valor={row.original.total} className="font-medium" />,
      },
    ];
  }, [meses]);

  const rodape: Record<string, React.ReactNode> = {
    centro: <span className="font-semibold">Total</span>,
    total: <Valor valor={dados.total} className="font-semibold" />,
  };
  dados.porMes.slice(0, meses).forEach((v, i) => {
    rodape[`mes${i + 1}`] = <Valor valor={v} className="font-semibold" />;
  });

  return (
    <DataTable
      idTabela="financeiro.relatorios.custos-indiretos.por-centro"
      columns={colunas}
      data={registros}
      idDaLinha={(r) => r.id}
      semPaginacao
      classeDaLinha={(r) => (r.tipo === "raiz" ? "bg-surface/40 hover:bg-surface/40" : undefined)}
      rodape={rodape}
    />
  );
}

const COLUNAS_CATEGORIA: ColumnDef<CategoriaIndireta, unknown>[] = [
  {
    accessorKey: "categoria",
    header: "Categoria",
    size: 260,
    meta: { celular: "titulo" },
  },
  {
    accessorKey: "total",
    header: "Total no ano",
    size: 150,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <Valor valor={row.original.total} />,
  },
  {
    accessorKey: "pct",
    header: "% do total",
    size: 110,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarPercentual(row.original.pct, 1)}</span>,
  },
];

function TabelaPorCategoria({ linhas }: { linhas: CustoIndiretoLinha[] }) {
  const categorias = React.useMemo(() => custosPorCategoria(linhas), [linhas]);
  const total = categorias.reduce((s, c) => s + Math.round(c.total * 100), 0) / 100;
  return (
    <DataTable
      idTabela="financeiro.relatorios.custos-indiretos.por-categoria"
      columns={COLUNAS_CATEGORIA}
      data={categorias}
      idDaLinha={(c) => c.categoriaId ?? `sem-${c.categoria}`}
      semPaginacao
      rodape={{
        categoria: <span className="font-semibold">Total</span>,
        total: <MoneyText valor={total} className="font-semibold" />,
        pct: <span className="font-semibold tabular-nums">{formatarPercentual(100, 1)}</span>,
      }}
    />
  );
}

/**
 * Duas tabelas: o custo indireto por centro (raiz com subtotal e cada etapa)
 * mês a mês, e por categoria no ano.
 */
export function CustosIndiretosTabela({ ano, linhas, mesCorrente }: CustosIndiretosTabelaProps) {
  if (linhas.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo={`Sem custo indireto em ${ano}`}
        descricao="Escritório Central, Manutenção/Documentação de Equipamentos e 002 - Equipamentos Colorado não tiveram lançamento a pagar no ano."
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Secao titulo="Por centro">
        <TabelaPorCentro ano={ano} linhas={linhas} mesCorrente={mesCorrente} />
      </Secao>
      <Secao titulo="Por categoria">
        <TabelaPorCategoria linhas={linhas} />
      </Secao>
    </div>
  );
}
