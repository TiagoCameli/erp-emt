"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import type { Modo } from "@/modules/combustivel/anomalias/base";
import { linkDaSaida } from "@/modules/combustivel/anomalias/links";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import type { SaidaRecente } from "@/modules/combustivel/painel/queries";

/** "AAAA-MM-DDTHH:MM" (relógio de parede) -> "dd/mm/aaaa HH:mm", sem fuso. */
export function dataHoraDeParede(data: string): string {
  const dia = `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
  const hora = data.slice(11, 16);
  return hora.length === 5 ? `${dia} ${hora}` : dia;
}

/** Iniciais (até 2) para o avatar do operador, como a origem. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return `${partes[0]![0]}${partes[partes.length - 1]![0]}`.toUpperCase();
}

function precoPorLitro(saida: SaidaRecente): string {
  if (!(saida.litros > 0)) return "Sem litros";
  const valor = saida.valorTotal / saida.litros;
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function Operador({ nome }: { nome: string | null }) {
  if (!nome) return <span className="text-legenda italic text-muted-foreground">Sem operador</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
        {iniciais(nome)}
      </span>
      <span className="text-legenda text-foreground">{nome}</span>
    </span>
  );
}

/** Combustível com a cor dele e a obra embaixo, como a origem. */
function Combustivel({ saida }: { saida: SaidaRecente }) {
  return (
    <div>
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: `color-mix(in srgb, ${saida.corCombustivel} 14%, transparent)`, color: saida.corCombustivel }}
      >
        <span className="size-1.5 rounded-full" style={{ background: saida.corCombustivel }} />
        {saida.combustivel}
      </span>
      {saida.obra ? <div className="mt-0.5 text-[10px] text-muted-foreground">{saida.obra}</div> : null}
    </div>
  );
}

/**
 * As colunas pelo modo. A ordem é a do calculo (mais recente primeiro), mas a lista é
 * plana: ordenar por litros ou total não quebra nada.
 */
function colunasDoModo(proprios: boolean): ColumnDef<SaidaRecente, unknown>[] {
  const dataHora: ColumnDef<SaidaRecente, unknown> = {
    accessorKey: "data",
    header: "Data/hora",
    meta: { atomico: true },
    cell: ({ row }) => (
      <Link
        href={linkDaSaida(row.original.id)}
        className="text-legenda text-muted-foreground hover:text-foreground hover:underline"
      >
        {dataHoraDeParede(row.original.data)}
      </Link>
    ),
  };
  const operador: ColumnDef<SaidaRecente, unknown> = {
    accessorKey: "operador",
    header: proprios ? "Operador" : "Motorista",
    meta: { naoTruncar: true },
    cell: ({ row }) => <Operador nome={row.original.operador} />,
  };
  const consumidor: ColumnDef<SaidaRecente, unknown>[] = proprios
    ? [
        {
          accessorKey: "consumidor",
          header: "Equipamento",
          meta: { celular: "titulo" },
          cell: ({ row }) => (
            <div>
              <div className="font-medium text-foreground">{row.original.consumidor ?? "Equipamento não encontrado"}</div>
              {row.original.codigo ? (
                <div className="font-mono text-[10px] text-muted-foreground">{row.original.codigo}</div>
              ) : null}
            </div>
          ),
        },
        operador,
      ]
    : [
        {
          accessorKey: "consumidor",
          header: "Placa",
          meta: { atomico: true, celular: "titulo" },
          cell: ({ row }) =>
            row.original.consumidor ? (
              <span className="font-mono font-semibold text-foreground">{row.original.consumidor}</span>
            ) : (
              <span className="italic text-muted-foreground">Sem placa</span>
            ),
        },
        operador,
        {
          accessorKey: "transportadora",
          header: "Transportadora",
          cell: ({ row }) => (
            <span className="text-legenda text-muted-foreground">
              {row.original.transportadora ?? <span className="italic">Sem transportadora</span>}
            </span>
          ),
        },
      ];
  return [
    dataHora,
    ...consumidor,
    {
      accessorKey: "combustivel",
      header: "Combustível",
      meta: { naoTruncar: true },
      cell: ({ row }) => <Combustivel saida={row.original} />,
    },
    {
      accessorKey: "litros",
      header: "Litros",
      meta: { alinharDireita: true, atomico: true, celular: "destaque" },
      cell: ({ row }) => <span className="tabular-nums">{formatarLitros(row.original.litros)}</span>,
    },
    {
      id: "precoPorLitro",
      accessorFn: (s) => (s.litros > 0 ? s.valorTotal / s.litros : undefined),
      header: "R$/L",
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => (
        <span className="text-legenda tabular-nums text-muted-foreground">{precoPorLitro(row.original)}</span>
      ),
    },
    {
      accessorKey: "valorTotal",
      header: "Total",
      meta: { alinharDireita: true, atomico: true, celular: "valor" },
      cell: ({ row }) => <MoneyText valor={row.original.valorTotal} className="font-semibold" />,
    },
  ];
}

/**
 * A UltimosAbastecimentosTable da origem: as 10 saídas mais recentes do recorte, colunas
 * conforme o modo, e "Ver todos (N)" levando à aba Saídas com o mesmo recorte.
 */
export function UltimosAbastecimentos({
  modo,
  saidas,
  total,
  hrefVerTodos,
}: {
  modo: Modo;
  saidas: SaidaRecente[];
  /** Saídas no recorte (o N do "Ver todos"). */
  total: number;
  hrefVerTodos: string;
}) {
  const proprios = modo === "proprios";
  const colunas = React.useMemo(() => colunasDoModo(proprios), [proprios]);
  if (saidas.length === 0) return null;
  const todasVisiveis = saidas.length === total;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            {todasVisiveis ? "Abastecimentos no período" : "Últimos abastecimentos"}
          </h3>
          <p className="mt-0.5 text-detalhe text-muted-foreground">
            {todasVisiveis ? `Todos os abastecimentos no período (${total})` : `${saidas.length} mais recentes no período`}
          </p>
        </div>
        {!todasVisiveis ? (
          <Link href={hrefVerTodos} className="inline-flex items-center gap-1 text-legenda font-medium text-primary hover:underline">
            Ver todos ({total}) <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
      {/* Um id por modo: as colunas mudam (Equipamento/Operador ou Placa/Motorista/Transportadora). */}
      <DataTable
        idTabela={proprios ? "combustivel.painel.ultimos-abastecimentos.proprios" : "combustivel.painel.ultimos-abastecimentos.carretas"}
        columns={colunas}
        data={saidas}
        idDaLinha={(s) => s.id}
        semPaginacao
      />
    </section>
  );
}
